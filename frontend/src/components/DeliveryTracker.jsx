import React, { useState, useEffect } from 'react';
import { Card, Badge } from './Shared';

const DeliveryTracker = ({ delivery }) => {
    const [location, setLocation] = useState(null);
    const [eta, setEta] = useState('30-45 phút');

    useEffect(() => {
        // Simulate real-time location updates
        const interval = setInterval(() => {
            setLocation({
                lat: 10.7769 + (Math.random() - 0.5) * 0.01,
                lng: 106.6955 + (Math.random() - 0.5) * 0.01,
                accuracy: Math.random() * 30,
            });
        }, 3000);

        return () => clearInterval(interval);
    }, []);

    const steps = [
        { time: '14:32', status: 'Đơn hàng được xác nhận' },
        { time: '14:35', status: 'Bắt đầu chuẩn bị' },
        { time: '14:42', status: 'Đơn hàng sẵn sàng' },
        { time: '14:45', status: 'Giao hàng bắt đầu' },
        { time: '15:05', status: 'Đang trên đường (Phường 1)' },
    ];

    return (
        <div className="space-y-6">
            {/* ETA Card */}
            <Card className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                <div className="text-center">
                    <p className="text-sm mb-2">Dự kiến giao trong</p>
                    <p className="text-4xl font-bold mb-2">{eta}</p>
                    <p className="text-sm">🚗 Đang trên đường</p>
                </div>
            </Card>

            {/* Map Placeholder */}
            <Card title="Vị trí giao hàng">
                <div className="w-full h-64 bg-gray-200 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                        <p className="text-4xl mb-2">🗺️</p>
                        <p className="text-gray-600">
                            {location ? `Vị trí: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : 'Đang cập nhật vị trí...'}
                        </p>
                    </div>
                </div>
            </Card>

            {/* Driver Info */}
            <Card title="Thông tin giao hàng">
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <div className="flex gap-4">
                            <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center text-xl">👤</div>
                            <div>
                                <p className="font-bold">Nguyễn Văn A</p>
                                <p className="text-sm text-gray-600">Mã giao hàng: #001</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="font-bold">⭐ 4.9/5</p>
                            <p className="text-sm text-gray-600">120 giao hàng</p>
                        </div>
                    </div>
                    <div className="border-t pt-4">
                        <p className="text-sm text-gray-600 mb-2">Liên hệ</p>
                        <div className="flex gap-2">
                            <button className="flex-1 bg-blue-600 text-white py-2 rounded">📞 Gọi</button>
                            <button className="flex-1 bg-green-600 text-white py-2 rounded">💬 Chat</button>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Timeline */}
            <Card title="Dòng thời gian">
                <div className="space-y-3">
                    {steps.map((step, idx) => (
                        <div key={idx} className="flex gap-4">
                            <div className="flex flex-col items-center">
                                <div className={`w-4 h-4 rounded-full ${idx < 4 ? 'bg-green-600' : 'bg-blue-600'}`} />
                                {idx < steps.length - 1 && <div className="w-1 h-8 bg-gray-300" />}
                            </div>
                            <div className="py-1">
                                <p className="font-semibold">{step.status}</p>
                                <p className="text-sm text-gray-600">{step.time}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
};

export default DeliveryTracker;
