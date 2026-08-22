import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookingService } from '../../services/api';
import { Button, Card, ErrorMessage, SuccessMessage } from '../../components/Shared';

const BookingFormPage = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [formData, setFormData] = useState({
        booking_date: '',
        arrival_time: '',
        duration: '60',
        guest_count: '2',
        table_number: '',
        notes: '',
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Validation
        if (!formData.booking_date || !formData.arrival_time || !formData.table_number) {
            setError('Vui lòng điền đầy đủ thông tin bắt buộc');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            await bookingService.createBooking({
                booking_date: formData.booking_date,
                arrival_time: formData.arrival_time,
                duration: parseInt(formData.duration),
                guest_count: parseInt(formData.guest_count),
                table_number: parseInt(formData.table_number),
                notes: formData.notes,
            });

            setSuccess('Đặt bàn thành công!');
            setTimeout(() => {
                navigate('/bookings');
            }, 2000);
        } catch (err) {
            setError(err.response?.data?.message || 'Lỗi đặt bàn');
        } finally {
            setLoading(false);
        }
    };

    // Get minimum date (today)
    const today = new Date().toISOString().split('T')[0];

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-2xl mx-auto px-4">
                <h1 className="text-4xl font-bold mb-8 text-red-600">Đặt bàn</h1>

                {error && <ErrorMessage message={error} onClose={() => setError(null)} />}
                {success && <SuccessMessage message={success} onClose={() => setSuccess(null)} />}

                <Card>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            {/* Date */}
                            <div>
                                <label className="block text-sm font-semibold mb-2">Ngày đặt *</label>
                                <input
                                    type="date"
                                    name="booking_date"
                                    value={formData.booking_date}
                                    onChange={handleChange}
                                    min={today}
                                    className="w-full border border-gray-300 rounded px-3 py-2"
                                    required
                                />
                            </div>

                            {/* Time */}
                            <div>
                                <label className="block text-sm font-semibold mb-2">Giờ tới *</label>
                                <input
                                    type="time"
                                    name="arrival_time"
                                    value={formData.arrival_time}
                                    onChange={handleChange}
                                    className="w-full border border-gray-300 rounded px-3 py-2"
                                    required
                                />
                            </div>

                            {/* Guest Count */}
                            <div>
                                <label className="block text-sm font-semibold mb-2">Số khách</label>
                                <select
                                    name="guest_count"
                                    value={formData.guest_count}
                                    onChange={handleChange}
                                    className="w-full border border-gray-300 rounded px-3 py-2"
                                >
                                    {Array.from({ length: 12 }, (_, i) => i + 1).map(num => (
                                        <option key={num} value={num}>{num} khách</option>
                                    ))}
                                </select>
                            </div>

                            {/* Duration */}
                            <div>
                                <label className="block text-sm font-semibold mb-2">Thời gian ở lại (phút)</label>
                                <select
                                    name="duration"
                                    value={formData.duration}
                                    onChange={handleChange}
                                    className="w-full border border-gray-300 rounded px-3 py-2"
                                >
                                    <option value="30">30 phút</option>
                                    <option value="60">1 giờ</option>
                                    <option value="90">1.5 giờ</option>
                                    <option value="120">2 giờ</option>
                                    <option value="150">2.5 giờ</option>
                                    <option value="180">3 giờ</option>
                                </select>
                            </div>

                            {/* Table */}
                            <div>
                                <label className="block text-sm font-semibold mb-2">Bàn (1-50) *</label>
                                <input
                                    type="number"
                                    name="table_number"
                                    value={formData.table_number}
                                    onChange={handleChange}
                                    min="1"
                                    max="50"
                                    className="w-full border border-gray-300 rounded px-3 py-2"
                                    placeholder="Nhập số bàn"
                                    required
                                />
                            </div>
                        </div>

                        {/* Notes */}
                        <div>
                            <label className="block text-sm font-semibold mb-2">Ghi chú (tuỳ chọn)</label>
                            <textarea
                                name="notes"
                                value={formData.notes}
                                onChange={handleChange}
                                placeholder="Ví dụ: Cần bàn gần cửa sổ, có người sinh nhật, etc."
                                rows="4"
                                className="w-full border border-gray-300 rounded px-3 py-2"
                            />
                        </div>

                        {/* Buttons */}
                        <div className="flex gap-3">
                            <Button
                                type="submit"
                                disabled={loading}
                                className="flex-1"
                            >
                                {loading ? 'Đang xử lý...' : 'Đặt bàn'}
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => navigate('/bookings')}
                            >
                                Quay lại
                            </Button>
                        </div>
                    </form>
                </Card>

                {/* Tips */}
                <Card title="💡 Gợi ý" className="mt-8">
                    <ul className="space-y-2 text-sm text-gray-700">
                        <li>✓ Đặt bàn trước ít nhất 30 phút</li>
                        <li>✓ Chọn số bàn hợp lý dựa trên số khách</li>
                        <li>✓ Thời gian ở lại là ước tính, bạn có thể ở lâu hơn</li>
                        <li>✓ Hãy liên hệ với chúng tôi nếu cần thay đổi</li>
                    </ul>
                </Card>
            </div>
        </div>
    );
};

export default BookingFormPage;
