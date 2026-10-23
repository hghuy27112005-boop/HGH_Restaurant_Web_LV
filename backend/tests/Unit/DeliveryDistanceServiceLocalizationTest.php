<?php

namespace Tests\Unit;

use App\Services\DeliveryDistanceService;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DeliveryDistanceServiceLocalizationTest extends TestCase
{
    public function test_gps_reverse_geocoded_address_uses_english_when_requested(): void
    {
        Http::fake([
            'nominatim.openstreetmap.org/reverse*' => Http::response([
                'display_name' => 'Đường số 2, Phường Tân An, Thành phố Cần Thơ, 94120, Việt Nam',
                'address' => [
                    'road' => 'Đường số 2',
                    'suburb' => 'Phường Tân An',
                    'city' => 'Thành phố Cần Thơ',
                    'postcode' => '94120',
                    'country' => 'Việt Nam',
                ],
            ]),
            'router.project-osrm.org/route/*' => Http::response([
                'code' => 'Ok',
                'routes' => [['distance' => 160]],
            ]),
        ]);

        $result = app(DeliveryDistanceService::class)->calculateForCoordinates(10.02, 105.77, 'en');

        $this->assertSame('Street 2, Tan An Ward, Can Tho City, 94120, Vietnam', $result['address']);
        Http::assertSent(fn (Request $request) =>
            str_contains($request->url(), 'accept-language=en')
        );
    }

    public function test_gps_reverse_geocoded_address_remains_vietnamese_when_requested(): void
    {
        Http::fake([
            'nominatim.openstreetmap.org/reverse*' => Http::response([
                'display_name' => 'Đường số 2, Phường Tân An, Thành phố Cần Thơ, 94120, Việt Nam',
                'address' => [
                    'road' => 'Đường số 2',
                    'suburb' => 'Phường Tân An',
                    'city' => 'Thành phố Cần Thơ',
                    'postcode' => '94120',
                    'country' => 'Việt Nam',
                ],
            ]),
            'router.project-osrm.org/route/*' => Http::response([
                'code' => 'Ok',
                'routes' => [['distance' => 160]],
            ]),
        ]);

        $result = app(DeliveryDistanceService::class)->calculateForCoordinates(10.02, 105.77, 'vi');

        $this->assertSame('Đường số 2, Phường Tân An, Thành phố Cần Thơ, 94120, Việt Nam', $result['address']);
    }
}
