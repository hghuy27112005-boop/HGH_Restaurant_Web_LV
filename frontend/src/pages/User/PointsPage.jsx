import React, { useState, useEffect } from 'react';
import { pointsAPI } from '../../services/api';
import { Loading, ErrorMessage, Card, Badge } from '../../components/Shared';

const PointsPage = () => {
    const [points, setPoints] = useState(null);
    const [membership, setMembership] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [pointsRes, membershipRes] = await Promise.all([
                pointsService.getUserPoints(),
                pointsService.getMembershipInfo(),
            ]);

            setPoints(pointsRes.data.data);
            setMembership(membershipRes.data.data);
        } catch (err) {
            setError('Lỗi tải thông tin điểm');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <Loading />;

    const tiers = [
        { name: 'Bronze', color: 'bg-yellow-600', min: 0, max: 1000, discount: '0%' },
        { name: 'Silver', color: 'bg-gray-400', min: 1000, max: 5000, discount: '5%' },
        { name: 'Gold', color: 'bg-yellow-400', min: 5000, max: 10000, discount: '10%' },
        { name: 'Platinum', color: 'bg-blue-400', min: 10000, max: 50000, discount: '15%' },
        { name: 'Diamond', color: 'bg-blue-600', min: 50000, max: Infinity, discount: '20%' },
    ];

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-6xl mx-auto px-4">
                <h1 className="text-4xl font-bold mb-8 text-red-600">Điểm thành viên</h1>

                {error && <ErrorMessage message={error} />}

                {/* Current Points */}
                {points && (
                    <Card className="mb-8 bg-gradient-to-r from-red-600 to-red-700 text-white">
                        <p className="text-lg mb-2">Điểm hiện tại</p>
                        <p className="text-5xl font-bold mb-4">{points.total_points}</p>
                        <p className="text-sm">
                            Bạn đã tích lũy {points.points_this_month} điểm trong tháng này
                        </p>
                    </Card>
                )}

                {/* Membership Info */}
                {membership && (
                    <Card title="Thông tin thành viên" className="mb-8">
                        <div className="grid md:grid-cols-2 gap-6">
                            <div>
                                <p className="text-sm text-gray-600 mb-2">Hạng hiện tại</p>
                                <div className={`inline-block ${membership.current_tier_color} text-white px-6 py-3 rounded-lg text-2xl font-bold`}>
                                    {membership.current_tier}
                                </div>
                                <p className="text-sm text-gray-600 mt-4">
                                    Chiết khấu: {membership.discount}%
                                </p>
                            </div>
                            {membership.next_tier && (
                                <div>
                                    <p className="text-sm text-gray-600 mb-2">Hạng tiếp theo</p>
                                    <div className={`inline-block ${membership.next_tier_color} text-white px-6 py-3 rounded-lg text-2xl font-bold`}>
                                        {membership.next_tier}
                                    </div>
                                    <p className="text-sm text-gray-600 mt-4">
                                        Còn cần {membership.points_needed_next_tier} điểm
                                    </p>
                                    <div className="bg-gray-200 rounded h-2 mt-4 overflow-hidden">
                                        <div
                                            className="bg-red-600 h-full"
                                            style={{ width: `${Math.min((points?.total_points || 0) / membership.next_tier_threshold * 100, 100)}%` }}
                                        ></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>
                )}

                {/* Membership Tiers */}
                <Card title="Bảng tiêu chí thành viên">
                    <div className="grid md:grid-cols-5 gap-4">
                        {tiers.map((tier, idx) => (
                            <div key={idx} className="text-center p-4 border rounded-lg hover:shadow-lg transition">
                                <div className={`${tier.color} text-white px-4 py-2 rounded mb-2 font-bold`}>
                                    {tier.name}
                                </div>
                                <p className="text-sm text-gray-600 mb-2">
                                    {tier.min.toLocaleString('vi-VN')} - {tier.max === Infinity ? '∞' : tier.max.toLocaleString('vi-VN')} điểm
                                </p>
                                <p className="font-bold text-red-600">{tier.discount} chiết khấu</p>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* How to Earn Points */}
                <Card title="Cách tích lũy điểm" className="mt-8">
                    <div className="space-y-3">
                        <p>✓ 1 điểm được tích lũy cho mỗi 1,000 VND chi tiêu</p>
                        <p>✓ Điểm được tính tự động sau khi thanh toán</p>
                        <p>✓ Điểm có thể được sử dụng để nâng hạng thành viên</p>
                        <p>✓ Hạng thành viên cao hơn = chiết khấu lớn hơn</p>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default PointsPage;
