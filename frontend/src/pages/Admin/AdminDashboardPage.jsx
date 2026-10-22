import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { Loading, ErrorMessage } from '../../components/Shared';
import { AdminPageShell, StatGrid, StatCard } from '../../components/AdminUI';
import CollapsibleSection from '../../components/CollapsibleSection';
import MetricSection from './DashboardSections/MetricSection';
import DishTrendSection from './DashboardSections/DishTrendSection';
import DishRankingSection from './DashboardSections/DishRankingSection';
import PeakHoursSection from './DashboardSections/PeakHoursSection';
import TopUsersSection from './DashboardSections/TopUsersSection';
import HolidaysSection from './DashboardSections/HolidaysSection';
import { fmtMoney, extractError } from './DashboardSections/helpers';
import { translatePageText } from '../../pageTextTranslations';

const AdminDashboardPage = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [summary, setSummary] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await adminAPI.dashboard.summary();
                setSummary(res?.data?.data || null);
            } catch (err) {
                setError(extractError(err, translatePageText("Lỗi tải dashboard")));
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) return <Loading />;

    return (
        <AdminPageShell
            title="Dashboard"
        >
            {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

            <StatGrid>
                <StatCard label="Tổng doanh thu" value={fmtMoney(summary?.total_revenue)} icon="fa-sack-dollar" tone="green" />
                <StatCard label="Tổng số đơn" value={Number(summary?.total_orders || 0).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN')} icon="fa-receipt" tone="purple" />
                <StatCard label="Doanh thu đặt bàn" value={fmtMoney(summary?.booking_revenue)} icon="fa-chair" tone="blue" />
                <StatCard label="Doanh thu đặt ship" value={fmtMoney(summary?.ship_revenue)} icon="fa-motorcycle" tone="yellow" />
            </StatGrid>

            <CollapsibleSection title={translatePageText("Doanh thu")} icon="fa-chart-line">
                <MetricSection metric="revenue" />
            </CollapsibleSection>

            <CollapsibleSection title={translatePageText("Số đơn hàng")} icon="fa-receipt">
                <MetricSection metric="orders" />
            </CollapsibleSection>

            <CollapsibleSection title={translatePageText("Xu hướng món ăn")} icon="fa-arrow-trend-up">
                <DishTrendSection kind="sales" />
            </CollapsibleSection>

            <CollapsibleSection title={translatePageText("Món ăn được yêu thích")} icon="fa-heart">
                <DishTrendSection kind="rating" />
            </CollapsibleSection>

            <CollapsibleSection title={translatePageText("Thống kê theo thực đơn")} icon="fa-utensils">
                <DishRankingSection />
            </CollapsibleSection>

            <CollapsibleSection title={translatePageText("Khung giờ cao điểm")} icon="fa-clock">
                <PeakHoursSection />
            </CollapsibleSection>

            <CollapsibleSection title={translatePageText("Xếp hạng người dùng")} icon="fa-ranking-star">
                <TopUsersSection />
            </CollapsibleSection>

            <CollapsibleSection title={translatePageText("Ngày nghỉ lễ")} icon="fa-calendar-days">
                <HolidaysSection />
            </CollapsibleSection>
        </AdminPageShell>
    );
};

export default AdminDashboardPage;