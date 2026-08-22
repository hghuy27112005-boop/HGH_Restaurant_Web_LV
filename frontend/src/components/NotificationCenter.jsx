import React, { useState, useEffect } from 'react';
import { Card, Badge, Button } from './Shared';

const NotificationCenter = ({ isOpen, onClose }) => {
    const [notifications, setNotifications] = useState([
        {
            id: 1,
            type: 'order',
            title: 'Đơn hàng #001 được xác nhận',
            message: 'Nhà hàng đã xác nhận đơn hàng của bạn',
            time: '5 phút trước',
            read: false,
            icon: '📋',
        },
        {
            id: 2,
            type: 'delivery',
            title: 'Giao hàng sắp đến',
            message: 'Tài xế sắp đến nơi, vui lòng chuẩn bị tiếp đón',
            time: '2 phút trước',
            read: false,
            icon: '🚗',
        },
        {
            id: 3,
            type: 'promotion',
            title: 'Khuyến mãi mới 20%',
            message: 'Giảm 20% cho đơn hàng tiếp theo của bạn',
            time: '1 giờ trước',
            read: true,
            icon: '🎉',
        },
        {
            id: 4,
            type: 'points',
            title: 'Bạn được +50 điểm',
            message: 'Cảm ơn bạn đã mua hàng, bạn nhận thêm 50 điểm',
            time: '3 giờ trước',
            read: true,
            icon: '⭐',
        },
    ]);

    const markAsRead = (id) => {
        setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));
    };

    const deleteNotification = (id) => {
        setNotifications(notifications.filter(n => n.id !== id));
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-end pt-20">
            <div className="bg-white rounded-lg shadow-xl w-96 max-h-96 overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
                    <h3 className="font-bold text-lg">Thông báo ({unreadCount})</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                    >
                        ×
                    </button>
                </div>

                {/* Notifications List */}
                <div className="divide-y">
                    {notifications.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            <p>Không có thông báo</p>
                        </div>
                    ) : (
                        notifications.map(notif => (
                            <div
                                key={notif.id}
                                className={`p-4 hover:bg-gray-50 cursor-pointer transition ${!notif.read ? 'bg-blue-50' : ''}`}
                                onClick={() => markAsRead(notif.id)}
                            >
                                <div className="flex gap-3 mb-2">
                                    <div className="text-2xl">{notif.icon}</div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start">
                                            <p className="font-semibold text-sm">{notif.title}</p>
                                            {!notif.read && <div className="w-2 h-2 bg-blue-600 rounded-full mt-1" />}
                                        </div>
                                        <p className="text-xs text-gray-600 mt-1">{notif.message}</p>
                                        <p className="text-xs text-gray-500 mt-1">{notif.time}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteNotification(notif.id);
                                    }}
                                    className="text-xs text-red-600 hover:text-red-700"
                                >
                                    Xóa
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="border-t p-3 sticky bottom-0 bg-white">
                    <Button onClick={onClose} className="w-full text-center">Đóng</Button>
                </div>
            </div>
        </div>
    );
};

export default NotificationCenter;