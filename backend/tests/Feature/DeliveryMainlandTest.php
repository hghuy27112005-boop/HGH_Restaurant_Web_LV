<?php

namespace Tests\Feature;

use App\Services\DeliveryDistanceService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DeliveryMainlandTest extends TestCase
{
    public function test_gps_rejects_islands_open_water_and_other_countries_before_routing(): void
    {
        Http::fake();
        $service = app(DeliveryDistanceService::class);

        foreach ([[10.22, 103.97], [12.0, 110.0], [11.56, 104.93]] as [$latitude, $longitude]) {
            try {
                $service->calculateForCoordinates($latitude, $longitude);
                $this->fail('Expected a location outside mainland Vietnam to be rejected.');
            } catch (\RuntimeException $exception) {
                $this->assertStringContainsString('đất liền Việt Nam', $exception->getMessage());
            }
        }
        Http::assertNothingSent();
    }

    public function test_typed_address_is_checked_against_mainland_coordinates(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'nominatim.openstreetmap.org/search*' => Http::sequence()
                ->push([['lat' => '10.22', 'lon' => '103.97']])
                ->push([['lat' => '10.03', 'lon' => '105.77']]),
            'router.project-osrm.org/*' => Http::response(['code' => 'Ok', 'routes' => [['distance' => 2000]]]),
        ]);
        $service = app(DeliveryDistanceService::class);

        try {
            $service->calculateForAddress('Phú Quốc');
            $this->fail('Expected an island address to be rejected.');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString('đất liền Việt Nam', $exception->getMessage());
        }

        $this->assertSame(2.0, $service->calculateForAddress('Cần Thơ')['distance_km']);
        Http::assertSentCount(3);
    }
}
