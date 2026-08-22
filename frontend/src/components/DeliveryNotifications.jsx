import React, { useState, useEffect } from 'react';
import { Card } from './Shared';

const DeliveryNotifications = ({ delivery, onClose }) => {
    const [notifications, setNotifications] = useState([
        {
            id: 1,
            type: 'info',
            title: 'Đơn hàng đã được xác nhận',
            message: 'Nhà hàng bắt đầu chuẩn bị đơn hàng của bạn',
            time: '14:35',
            read: true,
        },
        {
            id: 2,
            type: 'success',
            title: 'Đơn hàng sẵn sàng',
            message: 'Đơn hàng của bạn đã sẵn sàng, tài xế sắp đến',
            time: '14:42',
            read: true,
        },
        {
            id: 3,
            type: 'info',
            title: 'Tài xế trên đường',
            message: 'Tài xế đang trên đường tới bạn, ETA 20 phút',
            time: '14:45',
            read: false,
        },
        {
            id: 4,
            type: 'warning',
            title: 'Cập nhật giao hàng',
            message: 'Tài xế sắp tới, vui lòng chuẩn bị tiếp đón',
            time: 'Vừa xong',
            read: false,
        },
    ]);

    const getIcon = (type) => {
        switch (type) {
            case 'success':
                return '✓';
            case 'warning':
                return '⚠️';
            case 'error':
                return '✕';
            default:
                return 'ℹ️';
        }
    };

    const getColor = (type) => {
        switch (type) {
            case 'success':
                return 'bg-green-50 border-green-200';
            case 'warning':
                return 'bg-yellow-50 border-yellow-200';
            case 'error':
                return 'bg-red-50 border-red-200';
            default:
                return 'bg-blue-50 border-blue-200';
        }
    };

    const markAllAsRead = () => {
        setNotifications(notifications.map(n => ({ ...n, read: true })));
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Thông báo</h2>
                {unreadCount > 0 && (
                    <button
                        onClick={markAllAsRead}
                        className="text-sm text-blue-600 hover:underline"
                    >
                        Đánh dấu tất cả đã đọc ({unreadCount})
                    </button>
                )}
            </div>

            {notifications.length === 0 ? (
                <Card className="text-center py-8 text-gray-500">
                    <p>Không có thông báo mới</p>
                </Card>
            ) : (
                <div className="space-y-3">
                    {notifications.map(notification => (
                        <Card
                            key={notification.id}
                            className={`border-l-4 ${getColor(notification.type)} ${!notification.read ? 'border-l-blue-600' : 'border-l-gray-300'}`}
                        >
                            <div className="flex gap-4">
                                <div className="text-2xl flex-shrink-0">{getIcon(notification.type)}</div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-bold">{notification.title}</p>
                                            <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                                        </div>
                                        {!notification.read && (
                                            <div className="w-3 h-3 bg-blue-600 rounded-full flex-shrink-0 mt-1" />
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">{notification.time}</p>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Notification Settings */}
            <Card title="⚙️ Cài đặt thông báo">
                <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" defaultChecked className="w-4 h-4" />
                        <span className="text-sm">Thông báo đơn hàng</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" defaultChecked className="w-4 h-4" />
                        <span className="text-sm">Thông báo giao hàng</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" defaultChecked className="w-4 h-4" />
                        <span className="text-sm">Thông báo khuyến mãi</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" className="w-4 h-4" />
                        <span className="text-sm">Thông báo âm thanh</span>
                    </label>
                </div>
            </Card>
        </div>
    );
};

export default DeliveryNotifications;
