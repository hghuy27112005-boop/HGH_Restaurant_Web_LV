<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class DeliveryDistanceService
{
    private const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
    private const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

    private const AVERAGE_SPEED_KMH = 35;

    /**
     * Geocode địa chỉ + kiểm tra không thuộc đảo/quần đảo, sau đó tính khoảng cách/
     * thời gian/phí ship so với địa chỉ nhà hàng (config/restaurant.php).
     *
     * @return array{lat: float, lng: float, distance_km: float, duration_minutes: int, shipping_fee: int}
     * @throws \RuntimeException nếu không tìm thấy địa chỉ, hoặc địa chỉ ngoài phạm vi, hoặc lỗi routing
     */
    public function calculateForAddress(string $address): array
    {
        $geo = $this->geocodeAddress($address);

        if (!$geo) {
            throw new \RuntimeException('Địa chỉ địa lý không hợp lệ. Vui lòng nhập lại địa chỉ cụ thể hơn');
        }

        if (!$this->isOnMainland($geo['lat'], $geo['lng'])) {
            throw new \RuntimeException('Địa chỉ giao hàng phải nằm trong phạm vi đất liền Việt Nam, không giao tới các đảo/quần đảo.');
        }

        $route = $this->getRoute(
            (float) config('restaurant.latitude'),
            (float) config('restaurant.longitude'),
            $geo['lat'],
            $geo['lng']
        );

        if (!$route) {
            throw new \RuntimeException('Không thể tính được tuyến đường giao hàng tới địa chỉ này.');
        }

        $distanceKm = $route['distance_km'];
        $durationMinutes = (int) ceil(($distanceKm / self::AVERAGE_SPEED_KMH) * 60);
        $shippingFee = $this->calculateShippingFee($distanceKm);

        return [
            'lat' => $geo['lat'],
            'lng' => $geo['lng'],
            'distance_km' => round($distanceKm, 2),
            'duration_minutes' => $durationMinutes,
            'shipping_fee' => $shippingFee,
        ];
    }

    /**
     * Tính khoảng cách/thời gian/phí ship trực tiếp từ toạ độ GPS thật của khách (lấy
     * qua Geolocation API của trình duyệt) — chính xác hơn geocode từ chuỗi địa chỉ vì
     * không phụ thuộc vào việc khách gõ đúng tên gọi trên bản đồ.
     *
     * @return array{address: string, lat: float, lng: float, distance_km: float, duration_minutes: int, shipping_fee: int}
     * @throws \RuntimeException
     */
    public function calculateForCoordinates(float $lat, float $lng, string $language = 'vi'): array
    {
        if (!$this->isOnMainland($lat, $lng)) {
            throw new \RuntimeException('Vị trí hiện tại nằm ngoài phạm vi đất liền Việt Nam, không giao tới các đảo/quần đảo.');
        }
        $reverse = $this->reverseGeocode($lat, $lng, $language);

        $route = $this->getRoute(
            (float) config('restaurant.latitude'),
            (float) config('restaurant.longitude'),
            $lat,
            $lng
        );

        if (!$route) {
            throw new \RuntimeException('Không thể tính được tuyến đường giao hàng tới vị trí này.');
        }

        $distanceKm = $route['distance_km'];
        $durationMinutes = (int) ceil(($distanceKm / self::AVERAGE_SPEED_KMH) * 60);
        $shippingFee = $this->calculateShippingFee($distanceKm);

        return [
            'address' => $reverse
                ? $this->formatReverseGeocodedAddress($reverse['display_name'] ?? '', $language)
                : sprintf('%.6f, %.6f', $lat, $lng),
            'lat' => $lat,
            'lng' => $lng,
            'distance_km' => round($distanceKm, 2),
            'duration_minutes' => $durationMinutes,
            'shipping_fee' => $shippingFee,
        ];
    }

    /**
     * Reverse geocode: từ toạ độ suy ra tên địa chỉ (chỉ dùng để hiển thị/lưu, không
     * dùng để tính toán khoảng cách).
     */
    private function reverseGeocode(float $lat, float $lng, string $language): ?array
    {
        try {
            $response = Http::withHeaders([
                'User-Agent' => 'HGH-Restaurant-App/1.0',
                'Accept-Language' => $language === 'en' ? 'en' : 'vi',
            ])->get('https://nominatim.openstreetmap.org/reverse', [
                'lat' => $lat,
                'lon' => $lng,
                'format' => 'jsonv2',
                'addressdetails' => 1,
                'accept-language' => $language === 'en' ? 'en' : 'vi',
            ]);

            if (!$response->successful()) {
                return null;
            }

            $data = $response->json();

            if (empty($data)) {
                return null;
            }

            return [
                'display_name' => $data['display_name'] ?? null,
            ];
        } catch (\Throwable $e) {
            Log::error('Nominatim reverse geocode failed: ' . $e->getMessage());
            return null;
        }
    }

    private function formatReverseGeocodedAddress(string $address, string $language): string
    {
        if ($language !== 'en') {
            return $address;
        }

        $address = preg_replace_callback(
            '/\b(Phường|Xã|Thị trấn|Quận|Huyện|Thành phố|Tỉnh)\s+([^,]+)/iu',
            function (array $matches): string {
                $suffix = match (mb_strtolower($matches[1])) {
                    'phường' => 'Ward',
                    'xã' => 'Commune',
                    'thị trấn' => 'Town',
                    'quận', 'huyện' => 'District',
                    'thành phố' => 'City',
                    'tỉnh' => 'Province',
                    default => '',
                };

                return trim($matches[2]) . ' ' . $suffix;
            },
            $address
        );
        $address = preg_replace_callback(
            '/\bĐường\s+số\s+([^,]+)/iu',
            fn (array $matches): string => 'Street ' . trim($matches[1]),
            $address
        );
        $address = preg_replace('/\bViệt Nam\b/iu', 'Vietnam', $address);

        return Str::ascii($address);
    }

    /**
     * Geocode địa chỉ bằng Nominatim, trả về toạ độ + toàn bộ nội dung địa chỉ dạng chuỗi.
     */
    private function geocodeAddress(string $address): ?array
    {
        try {
            $response = Http::withHeaders([
                // Nominatim yêu cầu User-Agent định danh ứng dụng khi gọi API
                'User-Agent' => 'HGH-Restaurant-App/1.0',
            ])->get(self::NOMINATIM_URL, [
                'q' => $address,
                'format' => 'jsonv2',
                'addressdetails' => 1,
                'countrycodes' => 'vn',
                'limit' => 1,
            ]);

            if (!$response->successful()) {
                return null;
            }

            $results = $response->json();

            if (empty($results)) {
                return null;
            }

            $first = $results[0];
            return [
                'lat' => (float) $first['lat'],
                'lng' => (float) $first['lon'],
            ];
        } catch (\Throwable $e) {
            Log::error('Nominatim geocode failed: ' . $e->getMessage());
            return null;
        }
    }

    private function isOnMainland(float $latitude, float $longitude): bool
    {
        static $ring;
        $ring ??= json_decode(file_get_contents(resource_path('geography/vietnam-mainland.geojson')), true, flags: JSON_THROW_ON_ERROR)
            ['geometry']['coordinates'][0];

        $inside = false;
        for ($i = 0, $j = count($ring) - 1; $i < count($ring); $j = $i++) {
            [$x1, $y1] = $ring[$j];
            [$x2, $y2] = $ring[$i];
            if (($y1 > $latitude) === ($y2 > $latitude)) {
                continue;
            }
            $crossingLongitude = $x1 + ($latitude - $y1) * ($x2 - $x1) / ($y2 - $y1);
            if ($longitude < $crossingLongitude) {
                $inside = !$inside;
            }
        }
        return $inside;
    }

    /**
     * Gọi OSRM để lấy khoảng cách đường bộ thực tế (km) giữa 2 toạ độ.
     */
    private function getRoute(float $fromLat, float $fromLng, float $toLat, float $toLng): ?array
    {
        try {
            $url = sprintf(
                '%s/%f,%f;%f,%f',
                self::OSRM_URL,
                $fromLng,
                $fromLat,
                $toLng,
                $toLat
            );

            $response = Http::get($url, [
                'overview' => 'false',
            ]);

            if (!$response->successful()) {
                return null;
            }

            $data = $response->json();

            if (($data['code'] ?? '') !== 'Ok' || empty($data['routes'])) {
                return null;
            }

            $distanceMeters = $data['routes'][0]['distance'] ?? null;

            if ($distanceMeters === null) {
                return null;
            }

            return [
                'distance_km' => $distanceMeters / 1000,
            ];
        } catch (\Throwable $e) {
            Log::error('OSRM routing failed: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Công thức phí ship: 15.000đ cho 3km đầu, +3.000đ/km tới 10km, +4.000đ/km sau 10km.
     */
    private function calculateShippingFee(float $distanceKm): int
    {
        $baseFee = 15000;

        if ($distanceKm <= 3) {
            return $baseFee;
        }

        if ($distanceKm <= 10) {
            $extraKm = ceil($distanceKm - 3);
            return $baseFee + ($extraKm * 3000);
        }

        $midExtra = 7 * 3000; // 3km -> 10km
        $farExtra = ceil($distanceKm - 10) * 4000;

        return $baseFee + $midExtra + $farExtra;
    }
}