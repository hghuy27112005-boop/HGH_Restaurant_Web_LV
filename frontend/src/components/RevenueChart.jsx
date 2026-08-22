import React, { useState, useEffect } from 'react';
import { Card } from './Shared';

const RevenueChart = () => {
    const [data, setData] = useState([]);
    const [chartType, setChartType] = useState('line');

    useEffect(() => {
        // Simulated data
        const mockData = [
            { month: 'Tháng 1', revenue: 45000000, target: 50000000 },
            { month: 'Tháng 2', revenue: 52000000, target: 50000000 },
            { month: 'Tháng 3', revenue: 48000000, target: 50000000 },
            { month: 'Tháng 4', revenue: 61000000, target: 50000000 },
            { month: 'Tháng 5', revenue: 58000000, target: 50000000 },
            { month: 'Tháng 6', revenue: 73000000, target: 50000000 },
        ];
        setData(mockData);
    }, []);

    const maxRevenue = Math.max(...data.map(d => d.revenue));
    const maxValue = Math.ceil(maxRevenue / 10000000) * 10000000;

    return (
        <div className="space-y-6">
            {/* Chart Type Selector */}
            <div className="flex gap-2">
                <button
                    onClick={() => setChartType('line')}
                    className={`px-4 py-2 rounded ${
                        chartType === 'line' ? 'bg-red-600 text-white' : 'bg-white border'
                    }`}
                >
                    📈 Biểu đồ đường
                </button>
                <button
                    onClick={() => setChartType('bar')}
                    className={`px-4 py-2 rounded ${
                        chartType === 'bar' ? 'bg-red-600 text-white' : 'bg-white border'
                    }`}
                >
                    📊 Biểu đồ cột
                </button>
            </div>

            {/* Chart */}
            <Card title="Doanh thu theo tháng">
                {chartType === 'bar' ? (
                    // Bar Chart
                    <div className="space-y-4">
                        {data.map((item, idx) => {
                            const revenuePercent = (item.revenue / maxValue) * 100;
                            const targetPercent = (item.target / maxValue) * 100;

                            return (
                                <div key={idx}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="font-semibold">{item.month}</span>
                                        <span className="text-gray-600">{(item.revenue / 1000000).toFixed(1)}M</span>
                                    </div>
                                    <div className="flex gap-1 h-8 bg-gray-100 rounded overflow-hidden">
                                        <div
                                            className="bg-green-600 rounded"
                                            style={{ width: `${revenuePercent}%` }}
                                            title={`Doanh thu: ${(item.revenue / 1000000).toFixed(1)}M`}
                                        />
                                        <div
                                            className="bg-gray-400 opacity-50 rounded"
                                            style={{ width: `${targetPercent - revenuePercent}%` }}
                                            title={`Mục tiêu: ${(item.target / 1000000).toFixed(1)}M`}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    // Line Chart (ASCII style)
                    <div className="space-y-4">
                        <div className="h-64 bg-gray-50 rounded p-4 flex flex-col justify-between font-mono text-xs">
                            {[...Array(5)].map((_, y) => (
                                <div key={y} className="flex items-center gap-2">
                                    <span className="w-16 text-right text-gray-600">
                                        {((maxValue / 5) * (5 - y) / 1000000).toFixed(0)}M
                                    </span>
                                    <div className="flex-1 border-t border-gray-300" />
                                </div>
                            ))}
                            <div className="flex items-end justify-between h-40 gap-2">
                                {data.map((item, idx) => {
                                    const height = (item.revenue / maxValue) * 100;
                                    return (
                                        <div key={idx} className="flex-1 flex flex-col items-center">
                                            <div className="flex-1 w-full flex items-end justify-center">
                                                <div
                                                    className="w-3/4 bg-gradient-to-t from-green-600 to-green-400 rounded-t"
                                                    style={{ height: `${height}%` }}
                                                    title={`${item.month}: ${(item.revenue / 1000000).toFixed(1)}M`}
                                                />
                                            </div>
                                            <span className="text-xs mt-1 text-center text-gray-600 truncate">
                                                {item.month}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Legend */}
                <div className="flex gap-6 mt-6 pt-4 border-t">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-green-600 rounded" />
                        <span className="text-sm">Doanh thu thực tế</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-gray-400 rounded opacity-50" />
                        <span className="text-sm">Mục tiêu</span>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default RevenueChart;
