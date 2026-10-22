import React, { useState } from 'react';
import { Card, Badge, Button, Modal } from './Shared';
import { translatePageText } from '../pageTextTranslations';

const BookingDetail = ({ booking, onClose, onReschedule, onCancel }) => {
    const [showRescheduleModal, setShowRescheduleModal] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [rescheduleTime, setRescheduleTime] = useState('');

    const handleReschedule = async () => {
        if (rescheduleDate && rescheduleTime) {
            await onReschedule(booking.booking_id, rescheduleDate, rescheduleTime);
            setShowRescheduleModal(false);
        }
    };

    const handleCancel = async () => {
        await onCancel(booking.booking_id);
        setShowCancelModal(false);
    };

    const bookingDate = new Date(booking.booking_date);
    const daysUntil = Math.ceil((bookingDate - new Date()) / (1000 * 60 * 60 * 24));

    return (
        <>
            {/* Reschedule Modal */}
            <Modal
                isOpen={showRescheduleModal}
                title={translatePageText("Đổi lịch đặt bàn")}
                onClose={() => setShowRescheduleModal(false)}
                onConfirm={handleReschedule}
                confirmText="Xác nhận"
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold mb-2">{translatePageText("Ngày mới")}</label>
                        <input
                            type="date"
                            value={rescheduleDate}
                            onChange={(e) => setRescheduleDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                            className="w-full border border-gray-300 rounded px-3 py-2"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold mb-2">{translatePageText("Giờ mới")}</label>
                        <input
                            type="time"
                            value={rescheduleTime}
                            onChange={(e) => setRescheduleTime(e.target.value)}
                            className="w-full border border-gray-300 rounded px-3 py-2"
                        />
                    </div>
                </div>
            </Modal>

            {/* Cancel Modal */}
            <Modal
                isOpen={showCancelModal}
                title={translatePageText("Xác nhận hủy đặt bàn")}
                onClose={() => setShowCancelModal(false)}
                onConfirm={handleCancel}
                confirmText="Hủy"
            >
                <p className="text-gray-700">{translatePageText("Bạn chắc chắn muốn hủy đặt bàn này? Hành động này không thể hoàn tác.") + " "}</p>
            </Modal>

            {/* Detail Card */}
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <Card className="w-full max-w-2xl max-h-96 overflow-y-auto">
                    <div className="flex justify-between items-start mb-6">
                        <h2 className="text-2xl font-bold">{translatePageText("Chi tiết đặt bàn")}</h2>
                        <button
                            onClick={onClose}
                            className="text-2xl text-gray-400 hover:text-gray-600"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Main Info */}
                    <div className="grid md:grid-cols-2 gap-6 mb-6">
                        <div>
                            <p className="text-sm text-gray-600 mb-2">{translatePageText("Mã đặt")}</p>
                            <p className="text-xl font-bold">{booking.booking_code}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600 mb-2">{translatePageText("Trạng thái")}</p>
                            <Badge variant={booking.status === 'confirmed' ? 'success' : 'warning'}>
                                {booking.status === 'confirmed' ? translatePageText("✓ Xác nhận") : translatePageText("⏳ Chờ xác nhận")}
                            </Badge>
                        </div>
                    </div>

                    {/* Booking Details */}
                    <div className="space-y-4 mb-6 pb-6 border-b">
                        <div className="grid md:grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-gray-600">{translatePageText("Ngày")}</p>
                                <p className="font-semibold">{bookingDate.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                <p className="text-xs text-gray-500">({daysUntil}{" " + translatePageText("ngày từ nay)")}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">{translatePageText("Giờ")}</p>
                                <p className="font-semibold text-lg">{booking.arrival_time}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">{translatePageText("Bàn số")}</p>
                                <p className="font-semibold text-2xl">{booking.table_number}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">{translatePageText("Số khách")}</p>
                                <p className="font-semibold text-lg">{booking.guest_count}{" " + translatePageText("người")}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">{translatePageText("Thời gian")}</p>
                                <p className="font-semibold">{booking.duration}{" " + translatePageText("phút")}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">{translatePageText("Dự kiến kết thúc")}</p>
                                <p className="font-semibold">
                                    {new Date(new Date(`${booking.booking_date} ${booking.arrival_time}`).getTime() + booking.duration * 60000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    {booking.notes && (
                        <div className="mb-6 pb-6 border-b">
                            <p className="text-sm text-gray-600 mb-2">{translatePageText("Ghi chú")}</p>
                            <p className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded">
                                {booking.notes}
                            </p>
                        </div>
                    )}

                    {/* Timeline */}
                    <div className="mb-6 space-y-3">
                        <p className="font-semibold">{translatePageText("Dòng thời gian")}</p>
                        <div className="text-sm space-y-2 text-gray-700">
                            <div>{translatePageText("✓ Đặt lúc:") + " "}{new Date(booking.created_at).toLocaleString('vi-VN')}</div>
                            {booking.status === 'confirmed' && (
                                <div>{translatePageText("✓ Xác nhận lúc:") + " "}{new Date(booking.updated_at).toLocaleString('vi-VN')}</div>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    {booking.status !== 'cancelled' && (
                        <div className="flex gap-3">
                            <Button
                                onClick={() => setShowRescheduleModal(true)}
                                variant="secondary"
                                className="flex-1"
                            >{translatePageText("📅 Đổi lịch") + " "}</Button>
                            <Button
                                onClick={() => setShowCancelModal(true)}
                                variant="danger"
                                className="flex-1"
                            >{translatePageText("✕ Hủy") + " "}</Button>
                        </div>
                    )}
                </Card>
            </div>
        </>
    );
};

export default BookingDetail;
