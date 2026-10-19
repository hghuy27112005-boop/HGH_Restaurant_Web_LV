import React, { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../../services/api';
import { TableLoading, Button, Modal } from '../../components/Shared';
import { AdminPageShell, StatGrid, StatCard } from '../../components/AdminUI';
// Các hàm xuất Excel dùng chung, import từ orderTools (nằm trong thư mục Orders)
import { EXPORT_LIMIT, fetchAllRows, downloadXlsx } from './Orders/orderTools';

const MEMBERSHIP_LABELS = {
    bronze: 'Bronze',
    silver: 'Silver',
    gold: 'Gold',
    platinum: 'Platinum',
    diamond: 'Diamond',
};

const MEMBERSHIP_STYLE = {
    bronze: { tone: 'orange', badge: 'bg-orange-100 text-orange-700' },
    silver: { tone: 'gray', badge: 'bg-gray-200 text-gray-700' },
    gold: { tone: 'yellow', badge: 'bg-yellow-100 text-yellow-700' },
    platinum: { tone: 'blue', badge: 'bg-blue-100 text-blue-700' },
    diamond: { tone: 'purple', badge: 'bg-purple-100 text-purple-700' },
};

const UNIT_OPTIONS = [
    { id: 'day', label: 'Ngày' },
    { id: 'month', label: 'Tháng' },
    { id: 'year', label: 'Năm' },
];

const NO_SPIN = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

const formatDateTime = (value) => value
    ? new Date(value).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    })
    : '';

const AdminUsersPage = () => {
    const [users, setUsers] = useState([]);
    const [stats, setStats] = useState({});
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);
    const [success, setSuccess] = useState(null);

    const [currentPage, setCurrentPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [pageInput, setPageInput] = useState('1');

    const [searchInput, setSearchInput] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const [membership, setMembership] = useState('');
    const [status, setStatus] = useState('');

    // Khóa / mở khóa
    const [lockTarget, setLockTarget] = useState(null);
    const [lockAmount, setLockAmount] = useState('');
    const [lockUnit, setLockUnit] = useState('day');
    const [unlockTarget, setUnlockTarget] = useState(null);
    const [busy, setBusy] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [total, setTotal] = useState(0); // tổng số người khớp bộ lọc, dùng kiểm tra giới hạn xuất
    const [mailState, setMailState] = useState(null); // { status: 'sending' | 'done' | 'error', message }

    const fetchStats = useCallback(async () => {
        try {
            const res = await adminAPI.users.getStats();
            setStats(res.data?.data || {});
        } catch (err) {
            console.error(err);
        }
    }, []);

    const fetchUsers = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const params = { page };
            if (appliedSearch) params.search = appliedSearch;
            if (membership) params.membership = membership;
            if (status) params.status = status;

            const response = await adminAPI.users.getAll(params);
            const payload = response.data;

            setUsers(payload.data || []);
            setCurrentPage(payload.pagination.current_page);
            setLastPage(payload.pagination.last_page);
            setTotal(payload.pagination.total);
            setPageInput(String(payload.pagination.current_page));
        } catch (err) {
            setErrorMessage('Lỗi tải danh sách người dùng');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [appliedSearch, membership, status]);

    // Đổi bất kỳ bộ lọc nào thì quay về trang 1
    useEffect(() => {
        fetchUsers(1);
    }, [fetchUsers]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    const applySearch = () => setAppliedSearch(searchInput.trim());

    const handleSearchKeyDown = (e) => {
        if (e.key === 'Enter') applySearch();
    };

    const handleGoToPage = () => {
        let page = parseInt(pageInput, 10);
        if (isNaN(page) || page < 1) page = 1;
        if (page > lastPage) page = lastPage;
        fetchUsers(page);
    };

    // Xuất Excel theo bộ lọc đang áp dụng (giống dữ liệu bảng đang hiển thị)
    const handleExport = async () => {
        if (exporting) return;
        if (total > EXPORT_LIMIT) {
            setErrorMessage(`Có ${total} người dùng khớp bộ lọc, vượt giới hạn xuất ${EXPORT_LIMIT} người. Vui lòng thu hẹp bộ lọc rồi xuất lại.`);
            return;
        }
        try {
            setExporting(true);
            const rows = await fetchAllRows((p, per) => {
                const params = { page: p, per_page: per };
                if (appliedSearch) params.search = appliedSearch;
                if (membership) params.membership = membership;
                if (status) params.status = status;
                return adminAPI.users.getAll(params);
            });
            await downloadXlsx(
                'danh-sach-nguoi-dung.xlsx',
                'Người dùng',
                [
                    { header: 'STT', width: 8, type: 'number' },
                    { header: 'Tên người dùng', width: 22, type: 'text' },
                    { header: 'SĐT', width: 15, type: 'text' },
                    { header: 'Gmail', width: 32, type: 'text' },
                    { header: 'Bậc thành viên', width: 16, type: 'text' },
                    { header: 'Trạng thái', width: 32, type: 'text' },
                ],
                rows.map((u) => [
                    u.stt,
                    u.username,
                    u.tele_number,
                    u.email,
                    MEMBERSHIP_LABELS[u.membership] || u.membership,
                    u.is_locked ? `Bị khóa đến ${formatDateTime(u.locked_until)}` : 'Hoạt động',
                ]),
            );
        } catch (err) {
            setErrorMessage(err.response?.data?.message || 'Xuất Excel thất bại. Vui lòng thử lại.');
        } finally {
            setExporting(false);
        }
    };

    const openLockModal = (user) => {
        setLockTarget(user);
        setLockAmount('');
        setLockUnit('day');
    };

    // Chạy sau khi khóa/mở khóa xong: hiện modal riêng "Đang gửi mail" rồi báo kết quả
    const sendNotificationMail = async (kind, user) => {
        setMailState({ status: 'sending', message: `Đang gửi mail đến ${user.email}...` });
        try {
            const res = kind === 'lock'
                ? await adminAPI.users.sendLockMail(user.user_id)
                : await adminAPI.users.sendUnlockMail(user.user_id);
            setMailState({ status: 'done', message: res.data?.message || 'Đã gửi mail.' });
        } catch (err) {
            setMailState({ status: 'error', message: err.response?.data?.message || 'Gửi mail thất bại.' });
        }
    };

    const handleConfirmLock = async () => {
        if (!lockTarget || busy) return;

        const amount = Number(lockAmount);
        if (!Number.isInteger(amount) || amount < 1) {
            setErrorMessage('Vui lòng nhập thời hạn khóa là số nguyên lớn hơn 0.');
            return;
        }

        try {
            setBusy(true);
            const target = lockTarget;
            const res = await adminAPI.users.lock(target.user_id, amount, lockUnit);
            setSuccess(`${res.data?.message || 'Đã khóa tài khoản'} (tài khoản "${target.username}")`);
            setLockTarget(null);
            fetchUsers(currentPage);
            fetchStats();
            sendNotificationMail('lock', target);
        } catch (err) {
            const data = err.response?.data;
            setErrorMessage(data?.message || data?.errors?.amount?.[0] || 'Lỗi khóa tài khoản');
        } finally {
            setBusy(false);
        }
    };

    const handleConfirmUnlock = async () => {
        if (!unlockTarget || busy) return;
        try {
            setBusy(true);
            const target = unlockTarget;
            await adminAPI.users.unlock(target.user_id);
            setSuccess(`Đã mở khóa tài khoản "${target.username}"`);
            setUnlockTarget(null);
            fetchUsers(currentPage);
            fetchStats();
            sendNotificationMail('unlock', target);
        } catch (err) {
            setErrorMessage(err.response?.data?.message || 'Lỗi mở khóa tài khoản');
        } finally {
            setBusy(false);
        }
    };

    return (
        <AdminPageShell title="Quản lý người dùng">
            {/* Thống kê: một hàng */}
            <StatGrid>
                <StatCard label="Tổng người dùng" value={stats.total} icon="fa-users" tone="red" />
                <StatCard label="Đang bị khóa" value={stats.locked} icon="fa-lock" tone="gray" />
                {Object.entries(MEMBERSHIP_LABELS).map(([key, label]) => (
                    <StatCard
                        key={key}
                        label={label}
                        value={stats[key]}
                        icon="fa-medal"
                        tone={MEMBERSHIP_STYLE[key].tone}
                    />
                ))}
            </StatGrid>

            {/* Thanh công cụ */}
            <div className="mb-4 flex flex-wrap items-center gap-3 bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                <div className="flex flex-1 min-w-[260px] gap-2">
                    <div className="relative flex-1">
                        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                        <input
                            type="text"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            placeholder="Tìm theo tên, email hoặc SDT, nhấn Enter..."
                            className="w-full border border-gray-300 rounded pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-red-600"
                        />
                    </div>
                    <button onClick={applySearch} className="px-4 py-2 rounded bg-red-600 text-white font-semibold hover:bg-red-700">
                        Tìm
                    </button>
                </div>
                <select
                    value={membership}
                    onChange={(e) => setMembership(e.target.value)}
                    className="border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-red-600"
                >
                    <option value="">Tất cả bậc</option>
                    {Object.entries(MEMBERSHIP_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                    ))}
                </select>
                <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-red-600"
                >
                    <option value="">Mọi trạng thái</option>
                    <option value="active">Đang hoạt động</option>
                    <option value="locked">Đang bị khóa</option>
                </select>
                <button
                    onClick={handleExport}
                    disabled={exporting}
                    className="px-4 py-2 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                    {exporting ? 'Đang xuất...' : 'Xuất Excel'}
                </button>
            </div>

            {/* Bảng + phân trang */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-red-600 text-white">
                                <th className="px-4 py-2.5 text-left w-16">STT</th>
                                <th className="px-4 py-2.5 text-left">Tên người dùng</th>
                                <th className="px-4 py-2.5 text-left">SĐT</th>
                                <th className="px-4 py-2.5 text-left">Gmail</th>
                                <th className="px-4 py-2.5 text-left">Bậc thành viên</th>
                                <th className="px-4 py-2.5 text-left">Trạng thái</th>
                                <th className="px-4 py-2.5 text-left">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={7}><TableLoading /></td>
                                </tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                        Không tìm thấy người dùng nào
                                    </td>
                                </tr>
                            ) : (
                                users.map((user) => (
                                    <tr key={user.user_id} className="border-b last:border-b-0 hover:bg-gray-50">
                                        <td className="px-4 py-1.5 text-gray-500">{user.stt}</td>
                                        <td className="px-4 py-1.5 font-semibold">{user.username}</td>
                                        <td className="px-4 py-1.5 text-gray-600">{user.tele_number || '—'}</td>
                                        <td className="px-4 py-1.5 text-gray-600">{user.email}</td>
                                        <td className="px-4 py-1.5">
                                            <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${MEMBERSHIP_STYLE[user.membership]?.badge || 'bg-gray-100 text-gray-700'}`}>
                                                {MEMBERSHIP_LABELS[user.membership] || user.membership}
                                            </span>
                                        </td>
                                        <td className="px-4 py-1.5">
                                            {user.is_locked ? (
                                                <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded bg-red-100 text-red-700">
                                                    Bị khóa đến {formatDateTime(user.locked_until)}
                                                </span>
                                            ) : (
                                                <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded bg-green-100 text-green-700">
                                                    Hoạt động
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-1.5">
                                            {user.is_locked ? (
                                                <button
                                                    onClick={() => setUnlockTarget(user)}
                                                    className="px-2.5 py-1 rounded border border-green-600 text-green-700 text-xs font-semibold hover:bg-green-600 hover:text-white transition"
                                                >
                                                    Mở khóa
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => openLockModal(user)}
                                                    className="px-2.5 py-1 rounded border border-red-600 text-red-600 text-xs font-semibold hover:bg-red-600 hover:text-white transition"
                                                >
                                                    Khóa tài khoản
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center justify-center gap-3 px-4 py-3 border-t text-sm">
                    <span>
                        Trang <strong>{currentPage}</strong> / <strong>{lastPage}</strong>
                    </span>
                    <input
                        type="number"
                        min={1}
                        max={lastPage}
                        value={pageInput}
                        onChange={(e) => setPageInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleGoToPage(); }}
                        className={`w-20 border rounded px-2 py-1 text-center ${NO_SPIN}`}
                    />
                    <Button variant="secondary" size="sm" onClick={handleGoToPage}>
                        Đi tới
                    </Button>
                </div>
            </div>

            {/* Modal khóa tài khoản */}
            <Modal
                isOpen={!!lockTarget}
                title="Khóa tài khoản"
                onClose={() => !busy && setLockTarget(null)}
                onConfirm={handleConfirmLock}
                confirmText={busy ? 'Đang xử lý...' : 'Khóa'}
                cancelText="Hủy"
            >
                <p className="text-gray-700 mb-4">
                    Khóa tài khoản <strong>{lockTarget?.username}</strong> trong bao lâu?
                </p>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        min={1}
                        value={lockAmount}
                        onChange={(e) => setLockAmount(e.target.value)}
                        placeholder="Nhập số"
                        className={`w-28 border rounded px-3 py-2 focus:outline-none focus:border-red-600 ${NO_SPIN}`}
                    />
                    <div className="inline-flex rounded-lg border-2 border-red-600 overflow-hidden">
                        {UNIT_OPTIONS.map((unit) => (
                            <button
                                key={unit.id}
                                type="button"
                                onClick={() => setLockUnit(unit.id)}
                                className={`px-4 py-2 text-sm font-bold transition ${lockUnit === unit.id ? 'bg-red-600 text-white' : 'bg-white text-red-600 hover:bg-red-50'}`}
                            >
                                {unit.label}
                            </button>
                        ))}
                    </div>
                </div>
                <p className="mt-3 text-xs text-gray-500">Tối đa 100 năm. Lý do hiển thị cho người dùng: vi phạm chính sách nội quy Nhà hàng.</p>
            </Modal>

            {/* Modal mở khóa */}
            <Modal
                isOpen={!!unlockTarget}
                title="Mở khóa tài khoản"
                onClose={() => !busy && setUnlockTarget(null)}
                onConfirm={handleConfirmUnlock}
                confirmText={busy ? 'Đang xử lý...' : 'Mở khóa'}
                cancelText="Hủy"
            >
                <p className="text-gray-700">
                    Bạn có chắc muốn mở khóa tài khoản <strong>{unlockTarget?.username}</strong> không?
                </p>
            </Modal>

            {/* Modal thành công */}
            <Modal
                isOpen={!!success}
                title="Thông báo"
                showHeaderClose
                showFooterClose={false}
                onClose={() => setSuccess(null)}
            >
                <p className="text-gray-700">{success}</p>
            </Modal>

            {/* Modal gửi mail: đang gửi / thành công / thất bại */}
            <Modal
                isOpen={!!mailState}
                title={mailState?.status === 'sending' ? 'Đang gửi mail' : mailState?.status === 'error' ? 'Gửi mail thất bại' : 'Gửi mail thành công'}
                showHeaderClose={mailState?.status !== 'sending'}
                showFooterClose={false}
                onClose={() => mailState?.status !== 'sending' && setMailState(null)}
            >
                <div className="flex items-center gap-3">
                    {mailState?.status === 'sending' && (
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600 flex-shrink-0"></div>
                    )}
                    <p className="text-gray-700">{mailState?.message}</p>
                </div>
            </Modal>

            {/* Modal lỗi */}
            <Modal
                isOpen={!!errorMessage}
                title="Thông báo"
                showHeaderClose
                showFooterClose={false}
                onClose={() => setErrorMessage(null)}
            >
                <p className="text-gray-700">{errorMessage}</p>
            </Modal>
        </AdminPageShell>
    );
};

export default AdminUsersPage;