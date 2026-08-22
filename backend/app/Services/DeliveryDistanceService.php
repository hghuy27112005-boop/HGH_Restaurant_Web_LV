<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class DeliveryDistanceService
{
    // Thay vì whitelist tỉnh/thành (dễ chặn nhầm do cấu trúc dữ liệu địa chỉ của
    // Nominatim không nhất quán giữa các loại đơn vị hành chính), dùng blacklist các
    // khu vực đảo/quần đảo phổ biến của Việt Nam. Địa chỉ đã được lọc theo
    // countrycodes=vn nên mặc định coi là hợp lệ, trừ khi khớp 1 trong các từ khóa này.
    private const ISLAND_KEYWORDS = [
        'phu quoc', 'con dao', 'con son', 'ly son', 'cat ba', 'cat hai',
        'truong sa', 'hoang sa', 'bach long vi', 'co to', 'con co',
        'tho chu', 'nam du', 'hon khoai', 'hon son', 'phu quy',
        'ly hoa', 'quan dao',
    ];

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

        if ($this->isIslandAddress($geo['address_text'])) {
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
    public function calculateForCoordinates(float $lat, float $lng): array
    {
        $reverse = $this->reverseGeocode($lat, $lng);

        if ($reverse && $this->isIslandAddress($reverse['address_text'])) {
            throw new \RuntimeException('Vị trí hiện tại nằm ngoài phạm vi đất liền Việt Nam, không giao tới các đảo/quần đảo.');
        }

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
            'address' => $reverse['display_name'] ?? sprintf('%.6f, %.6f', $lat, $lng),
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
    private function reverseGeocode(float $lat, float $lng): ?array
    {
        try {
            $response = Http::withHeaders([
                'User-Agent' => 'HGH-Restaurant-App/1.0',
            ])->get('https://nominatim.openstreetmap.org/reverse', [
                'lat' => $lat,
                'lon' => $lng,
                'format' => 'jsonv2',
                'addressdetails' => 1,
            ]);

            if (!$response->successful()) {
                return null;
            }

            $data = $response->json();

            if (empty($data)) {
                return null;
            }

            $addr = $data['address'] ?? [];
            $addressText = implode(' ', array_filter($addr, fn ($v) => is_string($v)));

            return [
                'display_name' => $data['display_name'] ?? null,
                'address_text' => $addressText,
            ];
        } catch (\Throwable $e) {
            Log::error('Nominatim reverse geocode failed: ' . $e->getMessage());
            return null;
        }
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
            $addr = $first['address'] ?? [];

            // Gộp toàn bộ giá trị của address lại thành 1 chuỗi để kiểm tra từ khóa đảo,
            // vì tên đảo có thể xuất hiện ở nhiều field khác nhau (suburb, county, city...).
            $addressText = implode(' ', array_filter($addr, fn ($v) => is_string($v)));

            return [
                'lat' => (float) $first['lat'],
                'lng' => (float) $first['lon'],
                'address_text' => $addressText,
            ];
        } catch (\Throwable $e) {
            Log::error('Nominatim geocode failed: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Kiểm tra địa chỉ có khớp từ khóa đảo/quần đảo nào không (tương đối, không phân
     * biệt hoa thường, không dấu).
     */
    private function isIslandAddress(string $addressText): bool
    {
        $normalized = $this->stripAccents(mb_strtolower($addressText));

        foreach (self::ISLAND_KEYWORDS as $keyword) {
            if (str_contains($normalized, $keyword)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Bỏ dấu tiếng Việt để so sánh chuỗi an toàn, tránh lỗi lệch kết quả do khác biệt
     * giữa dạng Unicode tổ hợp (NFD) và dựng sẵn (NFC) giữa dữ liệu trả về từ Nominatim
     * và chuỗi khai báo cứng trong code.
     */
    private function stripAccents(string $str): string
    {
        if (class_exists('Normalizer')) {
            $str = \Normalizer::normalize($str, \Normalizer::FORM_D);
            $str = preg_replace('/\p{Mn}/u', '', $str);
        }

        $str = str_replace(['đ', 'Đ'], ['d', 'D'], $str);

        return $str;
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