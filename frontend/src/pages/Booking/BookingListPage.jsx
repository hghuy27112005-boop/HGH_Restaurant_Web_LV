import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookingService, extractListData } from '../../services/api';
import { Loading, ErrorMessage, Card, Badge, Button, EmptyState } from '../../components/Shared';

const BookingListPage = () => {
    const navigate = useNavigate();
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all');

    useEffect(() => {
        fetchBookings();
    }, []);

    const fetchBookings = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await bookingService.getBookings();
            setBookings(extractListData(response));
        } catch (err) {
            if (err.response?.status === 401) return;
            setError(err.response?.data?.message || 'Không thể tải danh sách đặt bàn. Vui lòng thử lại.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const getFilteredBookings = () => {
        if (filter === 'all') return bookings;
        if (filter === 'upcoming') {
            return bookings.filter(b => {
                if (!b.booking_date) return false;
                const bookingDate = new Date(b.booking_date);
                return bookingDate >= new Date() && b.status !== 'cancelled';
            });
        }
        if (filter === 'past') {
            return bookings.filter(b => {
                if (!b.booking_date) return false;
                return new Date(b.booking_date) < new Date();
            });
        }
        if (filter === 'cancelled') {
            return bookings.filter(b => b.status === 'cancelled');
        }
        return bookings;
    };

    if (loading) return <Loading />;

    const filtered = getFilteredBookings();

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-4xl mx-auto px-4">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-4xl font-bold text-red-600">Danh sách đặt bàn</h1>
                    <Button onClick={() => navigate('/menu')}>+ Đặt bàn mới</Button>
                </div>

                {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

                {/* Filters */}
                <div className="flex gap-2 mb-8 overflow-x-auto">
                    {['all', 'upcoming', 'past', 'cancelled'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-2 rounded font-semibold whitespace-nowrap ${
                                filter === f
                                    ? 'bg-red-600 text-white'
                                    : 'bg-white border border-gray-300 text-gray-700 hover:border-red-600'
                            }`}
                        >
                            {f === 'all' ? 'Tất cả' : f === 'upcoming' ? 'Sắp tới' : f === 'past' ? 'Quá khứ' : 'Đã hủy'}
                        </button>
                    ))}
                </div>

                {/* Bookings */}
                {filtered.length === 0 ? (
                    <EmptyState
                        icon="📅"
                        title="Không có đặt bàn"
                        description={bookings.length === 0
                            ? 'Bạn chưa có đơn đặt bàn nào. Chọn món tại Menu (Ăn tại quán) để bắt đầu.'
                            : `Chưa có đặt bàn với bộ lọc "${filter}"`}
                        action={<Button onClick={() => navigate('/menu')}>Xem Menu</Button>}
                    />
                ) : (
                    <div className="space-y-4">
                        {filtered.map(bill => {
                            const bookingDate = bill.booking_date ? new Date(bill.booking_date) : null;
                            const isUpcoming = bookingDate && bookingDate >= new Date() && bill.status !== 'cancelled';

                            return (
                                <Card
                                    key={bill.id}
                                    className={isUpcoming ? 'border-l-4 border-l-green-500' : ''}
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="font-bold text-lg">Bàn {bill.table_number || '—'}</h3>
                                            <p className="text-sm text-gray-600">{bill.bill_code}</p>
                                        </div>
                                        <Badge variant={bill.is_paid ? 'success' : bill.status === 'cancelled' ? 'danger' : 'warning'}>
                                            {bill.is_paid ? '✓ Đã thanh toán' : bill.status === 'cancelled' ? '✕ Đã hủy' : '⏳ Chờ thanh toán'}
                                        </Badge>
                                    </div>

                                    <div className="grid md:grid-cols-4 gap-4 mb-4">
                                        <div>
                                            <p className="text-sm text-gray-600">Ngày</p>
                                            <p className="font-semibold">{bookingDate ? bookingDate.toLocaleDateString('vi-VN') : '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Giờ</p>
                                            <p className="font-semibold">{bill.arrival_time || '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Tổng tiền</p>
                                            <p className="font-semibold text-red-600">{Number(bill.total_amount || 0).toLocaleString('vi-VN')}đ</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Trạng thái</p>
                                            <p className="font-semibold">{bill.status || 'pending'}</p>
                                        </div>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default BookingListPage;
