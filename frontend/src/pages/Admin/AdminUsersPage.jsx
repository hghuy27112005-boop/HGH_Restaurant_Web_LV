import React, { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../../services/api';
import { Loading, ErrorMessage, SuccessMessage, Button } from '../../components/Shared';

const MEMBERSHIP_LABELS = {
    bronze: 'Bronze',
    silver: 'Silver',
    gold: 'Gold',
    platinum: 'Platinum',
    diamond: 'Diamond',
    administrator: 'Administrator',
};

const AdminUsersPage = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const [currentPage, setCurrentPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [pageInput, setPageInput] = useState('1');

    const [searchInput, setSearchInput] = useState('');

    const [deleteTarget, setDeleteTarget] = useState(null); // user object
    const [deleting, setDeleting] = useState(false);

    const fetchUsers = useCallback(async (page, search = '') => {
        try {
            setLoading(true);
            setError(null);
            const params = { page };
            if (search) params.search = search;

            const response = await adminAPI.users.getAll(params);
            const payload = response.data;

            setUsers(payload.data || []);
            setCurrentPage(payload.pagination.current_page);
            setLastPage(payload.pagination.last_page);
            setPageInput(String(payload.pagination.current_page));
        } catch (err) {
            setError('Lỗi tải danh sách người dùng');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers(1);
    }, [fetchUsers]);

    const handleSearchKeyDown = (e) => {
        if (e.key === 'Enter') {
            fetchUsers(1, searchInput.trim());
        }
    };

    const handleGoToPage = () => {
        let page = parseInt(pageInput, 10);
        if (isNaN(page) || page < 1) page = 1;
        if (page > lastPage) page = lastPage;
        fetchUsers(page);
    };

    const handleDeleteClick = (user) => {
        setDeleteTarget(user);
    };

    const handleConfirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            setDeleting(true);
            setError(null);
            await adminAPI.users.delete(deleteTarget.user_id);
            setSuccess(`Đã xóa tài khoản "${deleteTarget.username}" thành công`);
            setDeleteTarget(null);
            fetchUsers(currentPage);
        } catch (err) {
            setError(err.response?.data?.message || 'Lỗi xóa tài khoản người dùng');
            console.error(err);
        } finally {
            setDeleting(false);
        }
    };

    if (loading && users.length === 0) return <Loading />;

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-6xl mx-auto px-4">
                <h1 className="text-4xl font-bold mb-8 text-red-600">Quản lý người dùng</h1>

                {error && <ErrorMessage message={error} onClose={() => setError(null)} />}
                {success && <SuccessMessage message={success} onClose={() => setSuccess(null)} />}

                {/* Search box */}
                <div className="mb-4 flex gap-2">
                    <input
                        type="text"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        placeholder="Tìm theo tên đăng nhập hoặc email, nhấn Enter để tìm..."
                        className="flex-1 border rounded px-3 py-2"
                    />
                </div>

                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-red-600 text-white">
                                    <th className="px-4 py-3 text-left">STT</th>
                                    <th className="px-4 py-3 text-left">Tên người dùng</th>
                                    <th className="px-4 py-3 text-left">Gmail</th>
                                    <th className="px-4 py-3 text-left">Bậc thành viên</th>
                                    <th className="px-4 py-3 text-left">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => {
                                    return (
                                        <tr
                                            key={user.user_id}
                                            className="border-b hover:bg-gray-50"
                                        >
                                            <td className="px-4 py-2">{user.stt}</td>
                                            <td className="px-4 py-2 font-semibold">{user.username}</td>
                                            <td className="px-4 py-2">{user.email}</td>
                                            <td className="px-4 py-2">
                                                {MEMBERSHIP_LABELS[user.membership] || user.membership}
                                            </td>
                                            <td className="px-4 py-2">
                                                <button
                                                    onClick={() => handleDeleteClick(user)}
                                                    className="text-red-600 hover:underline text-xs font-semibold"
                                                >
                                                    Xóa tài khoản
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {users.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                                            Không tìm thấy người dùng nào
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Pagination */}
                <div className="mt-6 flex items-center justify-center gap-3">
                    <span>
                        Trang <strong>{currentPage}</strong> / <strong>{lastPage}</strong>
                    </span>
                    <input
                        type="number"
                        min={1}
                        max={lastPage}
                        value={pageInput}
                        onChange={(e) => setPageInput(e.target.value)}
                        className="w-20 border rounded px-2 py-1 text-center"
                    />
                    <Button variant="secondary" size="sm" onClick={handleGoToPage}>
                        Đi tới
                    </Button>
                </div>
            </div>

            {/* Delete confirm modal */}
            {deleteTarget && (
                <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
                    <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 overflow-hidden">
                        <div className="bg-red-600 text-white px-6 py-4">
                            <h2 className="text-xl font-bold">Xác nhận xóa người dùng</h2>
                        </div>
                        <div className="p-6">
                            <p>
                                Bạn có chắc muốn xóa người dùng <strong>{deleteTarget.username}</strong> không?
                            </p>
                        </div>
                        <div className="flex gap-2 justify-end px-6 pb-6">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                disabled={deleting}
                                className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
                            >
                                Đóng
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                disabled={deleting}
                                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                            >
                                {deleting ? 'Đang xử lý...' : 'OK'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminUsersPage;