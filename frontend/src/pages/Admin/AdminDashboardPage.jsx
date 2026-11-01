import i18n from '../../i18n.js';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

const AdminDashboardPage = () => {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [summary, setSummary] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await adminAPI.dashboard.summary();
                setSummary(res?.data?.data || null);
            } catch (err) {
                setError(extractError(err, i18n.t("Lỗi tải dashboard", { ns: 'legacy', keySeparator: false })));
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) return <Loading />;

    return (
        <AdminPageShell
            title={t('navigation.dashboard')}
        >
            {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

            <StatGrid>
                <StatCard label="Tổng doanh thu" value={fmtMoney(summary?.total_revenue)} icon="fa-sack-dollar" tone="green" />
                <StatCard label="Tổng số đơn" value={Number(summary?.total_orders || 0).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN')} icon="fa-receipt" tone="purple" />
                <StatCard label="Doanh thu đặt bàn" value={fmtMoney(summary?.booking_revenue)} icon="fa-chair" tone="blue" />
                <StatCard label="Doanh thu đặt ship" value={fmtMoney(summary?.ship_revenue)} icon="fa-motorcycle" tone="yellow" />
            </StatGrid>

            <CollapsibleSection title={i18n.t("Doanh thu", { ns: 'legacy', keySeparator: false })} icon="fa-chart-line">
                <MetricSection metric="revenue" />
            </CollapsibleSection>

            <CollapsibleSection title={i18n.t("Số đơn hàng", { ns: 'legacy', keySeparator: false })} icon="fa-receipt">
                <MetricSection metric="orders" />
            </CollapsibleSection>

            <CollapsibleSection title={i18n.t("Xu hướng món ăn", { ns: 'legacy', keySeparator: false })} icon="fa-arrow-trend-up">
                <DishTrendSection kind="sales" />
            </CollapsibleSection>

            <CollapsibleSection title={i18n.t("Món ăn được yêu thích", { ns: 'legacy', keySeparator: false })} icon="fa-heart">
                <DishTrendSection kind="rating" />
            </CollapsibleSection>

            <CollapsibleSection title={i18n.t("Thống kê theo thực đơn", { ns: 'legacy', keySeparator: false })} icon="fa-utensils">
                <DishRankingSection />
            </CollapsibleSection>

            <CollapsibleSection title={i18n.t("Khung giờ cao điểm", { ns: 'legacy', keySeparator: false })} icon="fa-clock">
                <PeakHoursSection />
            </CollapsibleSection>

            <CollapsibleSection title={i18n.t("Xếp hạng người dùng", { ns: 'legacy', keySeparator: false })} icon="fa-ranking-star">
                <TopUsersSection />
            </CollapsibleSection>

            <CollapsibleSection title={i18n.t("Ngày nghỉ lễ", { ns: 'legacy', keySeparator: false })} icon="fa-calendar-days">
                <HolidaysSection />
            </CollapsibleSection>
        </AdminPageShell>
    );
};

export default AdminDashboardPage;
