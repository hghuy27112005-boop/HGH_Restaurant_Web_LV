import React, { useState, useEffect } from 'react';
import { Button, Card, Badge, Loading } from './Shared';

const AvailableTables = ({ selectedDate, selectedTime, guestCount, onSelectTable }) => {
    const [tables, setTables] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (selectedDate && selectedTime) {
            checkAvailability();
        }
    }, [selectedDate, selectedTime, guestCount]);

    const checkAvailability = async () => {
        setLoading(true);
        // Simulate API call
        setTimeout(() => {
            const mockTables = [];
            for (let i = 1; i <= 20; i++) {
                const capacity = Math.floor((i - 1) / 5) * 2 + 2; // 2, 2, 2, 2, 2, 4, 4, 4, 4, 4, etc.
                const isAvailable = Math.random() > 0.4; // 60% available

                mockTables.push({
                    table_id: i,
                    table_number: i,
                    capacity: capacity,
                    location: ['Góc cửa sổ', 'Gần quầy', 'Phía trong', 'Gần cửa'][i % 4],
                    is_available: isAvailable,
                    reserved_until: isAvailable ? null : new Date(new Date().getTime() + 60 * 60000).toLocaleTimeString('vi-VN'),
                });
            }
            setTables(mockTables);
            setLoading(false);
        }, 500);
    };

    const availableTables = tables.filter(t => t.is_available && t.capacity >= parseInt(guestCount));

    if (!selectedDate || !selectedTime) {
        return (
            <Card className="bg-blue-50 border-blue-200">
                <p className="text-sm text-blue-700">Vui lòng chọn ngày và giờ để xem bàn có sẵn</p>
            </Card>
        );
    }

    if (loading) return <Loading />;

    return (
        <Card title={`Bàn có sẵn (${availableTables.length}/${tables.length})`}>
            {availableTables.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                    <p className="mb-2">😔 Không có bàn trống vào thời gian này</p>
                    <p className="text-sm">Vui lòng chọn thời gian khác</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {availableTables.map(table => (
                        <button
                            key={table.table_id}
                            onClick={() => onSelectTable(table.table_number)}
                            className="p-3 border-2 border-green-400 rounded-lg hover:bg-green-50 transition text-center"
                        >
                            <p className="text-2xl font-bold mb-1">🪑</p>
                            <p className="font-bold">Bàn {table.table_number}</p>
                            <p className="text-xs text-gray-600">{table.capacity} chỗ</p>
                            <p className="text-xs text-gray-500">{table.location}</p>
                        </button>
                    ))}
                </div>
            )}

            {/* Unavailable Tables */}
            {tables.filter(t => !t.is_available).length > 0 && (
                <div className="mt-6 pt-6 border-t">
                    <p className="text-sm font-semibold mb-3">Bàn không có sẵn:</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {tables.filter(t => !t.is_available).map(table => (
                            <div
                                key={table.table_id}
                                className="p-3 border-2 border-gray-300 rounded-lg bg-gray-100 text-center opacity-50"
                            >
                                <p className="text-2xl font-bold mb-1">🪑</p>
                                <p className="font-bold text-sm">Bàn {table.table_number}</p>
                                <p className="text-xs text-gray-600">Đến {table.reserved_until}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </Card>
    );
};

export default AvailableTables;
