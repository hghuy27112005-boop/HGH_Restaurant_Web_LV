import React from 'react';
import { Card, Badge } from './Shared';

const DeliveryStatus = ({ delivery }) => {
    const getStatusInfo = () => {
        switch (delivery.status) {
            case 'pending':
                return { icon: '⏳', color: 'yellow', text: 'Chờ xác nhận', detail: 'Nhà hàng sắp xác nhận đơn của bạn' };
            case 'approved':
                return { icon: '✓', color: 'blue', text: 'Đã xác nhận', detail: 'Đang chuẩn bị đơn hàng' };
            case 'in_delivery':
                return { icon: '🚗', color: 'blue', text: 'Đang giao', detail: 'Tài xế đang trên đường tới bạn' };
            case 'delivered':
                return { icon: '✓', color: 'green', text: 'Đã giao', detail: 'Giao hàng thành công' };
            case 'cancelled':
                return { icon: '✕', color: 'red', text: 'Đã hủy', detail: 'Đơn hàng đã bị hủy' };
            default:
                return { icon: '?', color: 'gray', text: 'Không xác định', detail: 'Trạng thái không rõ' };
        }
    };

    const info = getStatusInfo();
    const colorMap = {
        yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300',
        blue: 'bg-blue-100 text-blue-800 border-blue-300',
        green: 'bg-green-100 text-green-800 border-green-300',
        red: 'bg-red-100 text-red-800 border-red-300',
        gray: 'bg-gray-100 text-gray-800 border-gray-300',
    };

    return (
        <Card className={`border-l-4 ${colorMap[info.color]}`}>
            <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                    <div className="text-4xl">{info.icon}</div>
                    <div>
                        <p className="font-bold text-lg">{info.text}</p>
                        <p className="text-sm mt-1">{info.detail}</p>
                    </div>
                </div>
            </div>

            {/* Status Progress */}
            <div className="mt-4 pt-4 border-t">
                <div className="flex justify-between text-xs font-semibold mb-2">
                    <span>Tiến độ</span>
                    <span>
                        {['pending', 'approved', 'in_delivery', 'delivered'].includes(delivery.status)
                            ? `${(['pending', 'approved', 'in_delivery', 'delivered'].indexOf(delivery.status) + 1) * 25}%`
                            : '0%'
                        }
                    </span>
                </div>
                <div className="w-full bg-gray-300 rounded-full h-2 overflow-hidden">
                    <div
                        className={`h-full transition-all ${
                            info.color === 'green' ? 'bg-green-600' :
                            info.color === 'blue' ? 'bg-blue-600' :
                            info.color === 'yellow' ? 'bg-yellow-600' :
                            'bg-gray-600'
                        }`}
                        style={{
                            width: ['pending', 'approved', 'in_delivery', 'delivered'].includes(delivery.status)
                                ? `${(['pending', 'approved', 'in_delivery', 'delivered'].indexOf(delivery.status) + 1) * 25}%`
                                : '0%'
                        }}
                    />
                </div>
            </div>
        </Card>
    );
};

export default DeliveryStatus;
