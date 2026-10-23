import React, { useState, useEffect, useMemo } from 'react';
import { bookingService } from '../../services/api';
import { Modal } from '../../components/Shared';
import { translatePageText, translateTableSelectionLimit } from '../../pageTextTranslations';

// Modal chỉnh sửa đơn đặt bàn ĐÃ thanh toán: ngày giờ, số lượng + loại bàn, số thứ tự bàn.
// Dùng state riêng, không dùng chung với wizard đặt bàn mới ở BookingsPage (wizard gắn chặt
// với sessionStorage và createdOrderId). Giữ nguyên các ràng buộc của wizard.
// Không cho đổi món, không thanh toán lại; mỗi lần lưu tiêu hao 1 lượt chỉnh sửa trong tuần.

const HR_REGEX = /^([0-1]?[0-9]|2[0-3])$/;
const MIN_REGEX = /^[0-5]?[0-9]$/;

const TABLE_GROUPS = [
    { key: 'type5', name: 'Bàn nhỏ', cap: '≤ 5 người', range: '1 - 25', from: 1, count: 25 },
    { key: 'type10', name: 'Bàn vừa', cap: '≤ 10 người', range: '26 - 45', from: 26, count: 20 },
    { key: 'type15', name: 'Bàn lớn', cap: '≤ 15 người', range: '46 - 50', from: 46, count: 5 },
];

const pad = (v) => String(v).padStart(2, '0');

const getTableType = (num) => {
    if (num <= 25) return 'type5';
    if (num <= 45) return 'type10';
    return 'type15';
};

const countTypes = (tables) => tables.reduce(
    (acc, n) => {
        acc[getTableType(n)] += 1;
        return acc;
    },
    { type5: 0, type10: 0, type15: 0 },
);

const getDateKey = (value) => {
    if (!value) return '';
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// Lấy HH:MM từ mọi định dạng: "HH:MM", "HH:MM:SS", "YYYY-MM-DD HH:MM:SS", "YYYY-MM-DDTHH:MM:SS.000Z"
const formatTime = (t) => {
    if (!t) return '';
    if (t.includes('T')) return t.split('T')[1].substring(0, 5);
    if (t.includes(' ') && t.length > 8) return t.split(' ')[1].substring(0, 5);
    return t.substring(0, 5);
};

const formatDateOnly = (dateKey) => {
    if (!dateKey) return '—';
    const [year, month, day] = dateKey.split('-');
    return `${day}/${month}/${year}`;
};

const toLocalDateStr = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];

// Thông tin hiện tại của đơn (lấy từ bill.booking_table)
const getOriginal = (bill) => {
    const b = bill?.booking_table;
    const rawTables = b?.table_numbers?.length > 0 ? b.table_numbers : [b?.table_number];
    const tables = rawTables
        .filter((n) => n !== null && n !== undefined)
        .map(Number)
        .sort((a, c) => a - c);

    return {
        date: getDateKey(b?.booking_date),
        start: formatTime(b?.start_time),
        end: formatTime(b?.end_time),
        tables,
    };
};

// Trả về null nếu giờ nhập chưa đúng định dạng
const parseTimeRange = (sh, sm, eh, em) => {
    if (!HR_REGEX.test(String(sh)) || !HR_REGEX.test(String(eh))) return null;
    if (!MIN_REGEX.test(String(sm)) || !MIN_REGEX.test(String(em))) return null;

    return {
        sMin: Number(sh) * 60 + Number(sm),
        eMin: Number(eh) * 60 + Number(em),
        start: `${pad(sh)}:${pad(sm)}`,
        end: `${pad(eh)}:${pad(em)}`,
    };
};

/**
 * Props:
 *  - isOpen, bill (đơn đang sửa, có booking_table), attemptsLeft (số lượt sửa còn lại lúc mở)
 *  - getServerNow: () => Date (giờ server, giống wizard)
 *  - onClose: đóng modal
 *  - onSaved({ date, attemptsLeft }): gọi sau khi lưu thành công
 */
export default function EditBookingModal({ isOpen, bill, attemptsLeft, getServerNow, onClose, onSaved }) {
    const orderId = bill?.order_id;
    const original = useMemo(() => getOriginal(bill), [bill]);

    const [bookingDate, setBookingDate] = useState('');
    const [startH, setStartH] = useState('');
    const [startM, setStartM] = useState('');
    const [endH, setEndH] = useState('');
    const [endM, setEndM] = useState('');

    const [totalTables, setTotalTables] = useState(1);
    const [tableTypes, setTableTypes] = useState({ type5: 1, type10: 0, type15: 0 });
    const [selectedTables, setSelectedTables] = useState([]);

    const [unavailableTables, setUnavailableTables] = useState([]);
    const [isCheckingOverlap, setIsCheckingOverlap] = useState(false);
    const [hint, setHint] = useState('');

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);

    // Mỗi lần mở modal: điền sẵn thông tin hiện tại của đơn
    useEffect(() => {
        if (!isOpen || !bill) return;
        const o = getOriginal(bill);
        const [sh = '', sm = ''] = o.start.split(':');
        const [eh = '', em = ''] = o.end.split(':');

        setBookingDate(o.date);
        setStartH(sh);
        setStartM(sm);
        setEndH(eh);
        setEndM(em);
        setTotalTables(Math.min(3, Math.max(1, o.tables.length)));
        setTableTypes(countTypes(o.tables));
        setSelectedTables(o.tables);
        setUnavailableTables([]);
        setHint('');
        setConfirmOpen(false);
        setSaving(false);
        setSaveError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, orderId]);

    const range = parseTimeRange(startH, startM, endH, endM);
    const startTimeStr = range?.start ?? '';
    const endTimeStr = range?.end ?? '';

    // Khi ngày/giờ đổi: tải lại danh sách bàn đã bị đơn khác đặt (bỏ qua chính đơn này),
    // đồng thời bỏ những bàn đang chọn nhưng giờ mới đã bị chiếm.
    useEffect(() => {
        if (!isOpen || !orderId) return undefined;

        if (!bookingDate || !range || range.eMin <= range.sMin) {
            setIsCheckingOverlap(false);
            return undefined;
        }

        let cancelled = false;
        setIsCheckingOverlap(true);

        const timer = setTimeout(async () => {
            try {
                const res = await bookingService.getOccupiedTables({
                    date: bookingDate,
                    start_time: range.start,
                    end_time: range.end,
                    order_id: orderId,
                });
                if (cancelled) return;
                const occupied = (res.data.occupied_tables || []).map(Number);
                setUnavailableTables(occupied);
                setSelectedTables((prev) => prev.filter((n) => !occupied.includes(n)));
            } catch (err) {
                if (cancelled) return;
                console.warn('Không thể tải danh sách bàn đã đặt:', err);
                setUnavailableTables([]);
            } finally {
                if (!cancelled) setIsCheckingOverlap(false);
            }
        }, 400);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, orderId, bookingDate, startTimeStr, endTimeStr]);

    // Ngày nhỏ nhất/lớn nhất được phép chọn (theo giờ server, khớp giới hạn backend 60 ngày)
    const serverNow = getServerNow();
    const minDate = toLocalDateStr(serverNow);
    const maxDate = toLocalDateStr(new Date(serverNow.getTime() + 60 * 24 * 60 * 60 * 1000));

    const typesTotal = tableTypes.type5 + tableTypes.type10 + tableTypes.type15;
    const sortedSelected = [...selectedTables].sort((a, b) => a - b);

    const changed = bookingDate !== original.date
        || startTimeStr !== original.start
        || endTimeStr !== original.end
        || sortedSelected.join(',') !== original.tables.join(',');

    // Cùng bộ ràng buộc với các bước 1 -> 4 của wizard đặt bàn.
    // Tách theo cụm để hiện lỗi ngay đúng cụm có lỗi (khỏi phải cuộn lên xuống).
    const getDateTimeError = () => {
        if (!bookingDate) return 'Vui lòng chọn ngày đặt.';
        if (bookingDate < minDate) return 'Không thể đặt bàn cho ngày trong quá khứ.';
        if (bookingDate > maxDate) return 'Bạn chỉ có thể đặt bàn trong vòng 60 ngày tới.';
        if (!range) return 'Định dạng giờ không hợp lệ.';
        if (range.sMin < 7 * 60) return 'Giờ mở cửa là từ 07:00 sáng. Vui lòng chọn giờ khác.';
        if (range.eMin > 22 * 60) return 'Giờ đóng cửa là 22:00. Vui lòng nhập giờ về không quá 22:00.';
        if (range.eMin <= range.sMin) return 'Giờ về phải sau giờ đến.';
        if (range.eMin - range.sMin > 90) return 'Chỉ được đặt bàn tối đa 90 phút. Vui lòng chỉnh lại thời gian.';

        const bookingDateTime = new Date(`${bookingDate}T${range.start}:00`);
        if (bookingDateTime < new Date(serverNow.getTime() + 60 * 60000)) {
            return 'Giờ đến phải sau thời điểm hiện tại ít nhất 60 phút.';
        }
        return null;
    };

    const dateTimeError = getDateTimeError();
    const tableTypesError = typesTotal !== totalTables
        ? `Vui lòng chọn đúng ${totalTables} bàn ở phần loại bàn. Bạn đang chọn ${typesTotal} bàn.`
        : null;
    // Lỗi chọn bàn chỉ báo khi phần loại bàn đã đúng (tránh báo trùng ở 2 cụm)
    const tableSelectError = !tableTypesError && selectedTables.length !== totalTables
        ? `Vui lòng chọn đủ ${totalTables} bàn (đang chọn ${selectedTables.length}/${totalTables}).`
        : null;

    const hasError = Boolean(dateTimeError || tableTypesError || tableSelectError);
    const canSave = changed && !hasError && !isCheckingOverlap && !saving;
    const handleTotalChange = (num) => {
        setTotalTables(num);
        setTableTypes({ type5: num, type10: 0, type15: 0 });
        setSelectedTables([]); // reset bàn đã chọn vì tổng số bàn vừa thay đổi
        setHint('');
    };

    const handleTableTypeChange = (type, amount) => {
        const newValue = tableTypes[type] + amount;
        if (newValue < 0) return;

        const newTypes = { ...tableTypes, [type]: newValue };
        if (newTypes.type5 + newTypes.type10 + newTypes.type15 > totalTables) return;

        setTableTypes(newTypes);
        setSelectedTables([]); // reset bàn đã chọn vì loại bàn vừa thay đổi
        setHint('');
    };

    const handleTableSelect = (num) => {
        if (unavailableTables.includes(num)) return;
        setHint('');

        if (selectedTables.includes(num)) {
            setSelectedTables(selectedTables.filter((t) => t !== num));
            return;
        }

        if (selectedTables.length >= totalTables) {
            setHint(translateTableSelectionLimit(totalTables));
            return;
        }

        const type = getTableType(num);
        const selectedOfType = selectedTables.filter((t) => getTableType(t) === type).length;
        if (selectedOfType >= tableTypes[type]) {
            setHint(translateTableSelectionLimit(tableTypes[type], type));
            return;
        }

        setSelectedTables([...selectedTables, num].sort((a, b) => a - b));
    };

    const handleClose = () => {
        if (saving) return;
        setHint('');
        onClose?.();
    };

    const handleSave = async () => {
        if (!canSave) return;
        setSaving(true);
        setSaveError(null);
        try {
            const res = await bookingService.modifyBooking({
                order_id: orderId,
                tables: sortedSelected,
                start_date: bookingDate,
                start_time: startTimeStr,
                end_time: endTimeStr,
            });
            setConfirmOpen(false);
            onSaved?.({ date: bookingDate, attemptsLeft: res.data?.modify_attempts_left });
        } catch (err) {
            const data = err.response?.data;
            setConfirmOpen(false);
            if (data?.stock_status === 'insufficient') {
                setSaveError(translatePageText("Không đủ nguyên liệu cho đơn này vào ngày giờ mới. Vui lòng chọn ngày hoặc giờ khác, hoặc giữ nguyên lịch cũ."));
            } else {
                setSaveError(data?.message || err.message || 'Không thể chỉnh sửa đơn. Vui lòng thử lại.');
            }
        } finally {
            setSaving(false);
        }
    };

    const timeBoxClass = 'flex items-center gap-1 border p-2 rounded bg-white w-fit focus-within:ring-2 focus-within:ring-red-500';
    const timeInputClass = 'w-10 text-center outline-none bg-transparent';
    const stepBtnClass = 'w-8 h-8 rounded-full border border-red-600 text-red-600 font-bold';

    return (
        <>
            <Modal
                isOpen={isOpen}
                title={translatePageText("Chỉnh sửa thông tin đặt bàn")}
                className="max-w-2xl"
                onClose={handleClose}
                cancelText="Đóng"
                onConfirm={() => setConfirmOpen(true)}
                confirmText="Lưu thay đổi"
                confirmDisabled={!canSave}
            >
                <div className="space-y-6 text-sm">
                    <div className="bg-gray-50 border border-gray-200 rounded p-3 space-y-1">
                        <div className="font-bold text-gray-800">{translatePageText("Đơn hàng") + " "}{bill?.order_stt || bill?.order_id}{translatePageText(": thông tin hiện tại") + " "}</div>
                        <div className="text-gray-600">{translatePageText("Ngày") + " "}<strong>{formatDateOnly(original.date)}</strong>, {original.start} - {original.end}{translatePageText(", bàn") + " "}<strong>{original.tables.join(', ') || '—'}</strong>
                        </div>
                        <div className="text-xs text-gray-500">{translatePageText("Mỗi lần lưu tiêu hao 1 lượt chỉnh sửa trong tuần (hiện còn") + " "}{attemptsLeft}{" " + translatePageText("lượt). Không thể thay đổi món ăn và không cần thanh toán lại.") + " "}</div>
                    </div>

                    {saveError && (
                        <div className="text-sm font-semibold text-red-700 bg-red-100 border border-red-200 p-3 rounded">
                            {saveError}
                        </div>
                    )}

                    {/* Cụm 1: ngày giờ */}
                    <div>
                        <h3 className="font-bold text-base text-red-600 mb-1">{translatePageText("1. Ngày & giờ")}</h3>
                        <p className="text-gray-600 mb-3">{translatePageText("Giờ hoạt động: 07:00 - 22:00.") + " "}<strong className="text-red-600">{translatePageText("Chỉ được đặt bàn tối đa 90'.")}</strong>
                        </p>
                        <div className="space-y-4">
                            <div>
                                <label className="block font-semibold mb-1">{translatePageText("Ngày đặt")}</label>
                                <input
                                    type="date"
                                    min={minDate}
                                    max={maxDate}
                                    value={bookingDate}
                                    onChange={(e) => setBookingDate(e.target.value)}
                                    className="w-full border p-2 rounded"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block font-semibold mb-1">{translatePageText("Giờ đến")}</label>
                                    <div className={timeBoxClass}>
                                        <input type="text" maxLength="2" inputMode="numeric" placeholder="07" value={startH} onChange={(e) => setStartH(e.target.value.replace(/\D/g, ''))} className={timeInputClass} />
                                        <span className="font-bold text-gray-500">:</span>
                                        <input type="text" maxLength="2" inputMode="numeric" placeholder="00" value={startM} onChange={(e) => setStartM(e.target.value.replace(/\D/g, ''))} className={timeInputClass} />
                                    </div>
                                </div>
                                <div>
                                    <label className="block font-semibold mb-1">{translatePageText("Giờ về")}</label>
                                    <div className={timeBoxClass}>
                                        <input type="text" maxLength="2" inputMode="numeric" placeholder="08" value={endH} onChange={(e) => setEndH(e.target.value.replace(/\D/g, ''))} className={timeInputClass} />
                                        <span className="font-bold text-gray-500">:</span>
                                        <input type="text" maxLength="2" inputMode="numeric" placeholder="30" value={endM} onChange={(e) => setEndM(e.target.value.replace(/\D/g, ''))} className={timeInputClass} />
                                    </div>
                                </div>
                            </div>
                            {dateTimeError && (
                                <p className="text-sm font-semibold text-red-600">{dateTimeError}</p>
                            )}
                        </div>
                    </div>

                    {/* Cụm 2: số lượng và loại bàn */}
                    <div>
                        <h3 className="font-bold text-base text-red-600 mb-1">{translatePageText("2. Số lượng & loại bàn")}</h3>
                        <p className="text-gray-600 mb-3">{translatePageText("Bạn muốn đặt bao nhiêu bàn? (Tối đa 3 bàn)")}</p>
                        <div className="flex justify-center gap-4 mb-4">
                            {[1, 2, 3].map((num) => (
                                <button
                                    type="button"
                                    key={num}
                                    onClick={() => handleTotalChange(num)}
                                    className={`w-14 h-14 text-xl font-bold rounded-lg border-2 ${totalTables === num ? 'border-red-600 text-red-600 bg-red-50' : 'border-gray-200 text-gray-400 hover:border-red-300'}`}
                                >
                                    {num}
                                </button>
                            ))}
                        </div>
                        <p className="text-gray-600 mb-2">{translatePageText("Phân bổ số lượng theo sức chứa. Tổng:") + " "}<b>{totalTables}</b>{" " + translatePageText("bàn.")}</p>
                        <div className="space-y-3">
                            {TABLE_GROUPS.map((g) => (
                                <div key={g.key} className="flex justify-between items-center bg-white p-3 border rounded-lg">
                                    <div>
                                        <div className="font-bold">{translatePageText(g.name)} ({translatePageText(g.cap)})</div>
                                        <div className="text-xs text-gray-500">{translatePageText("STT từ") + " "}{g.range}</div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button type="button" onClick={() => handleTableTypeChange(g.key, -1)} className={stepBtnClass}>-</button>
                                        <span className="font-bold w-4 text-center">{tableTypes[g.key]}</span>
                                        <button type="button" onClick={() => handleTableTypeChange(g.key, 1)} className={stepBtnClass}>+</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {tableTypesError && (
                            <p className="mt-3 text-sm font-semibold text-red-600">{tableTypesError}</p>
                        )}
                    </div>

                    {/* Cụm 3: chọn số thứ tự bàn */}
                    <div>
                        <h3 className="font-bold text-base text-red-600 mb-1">{translatePageText("3. Chọn bàn trống")}</h3>
                        <p className="text-gray-600 mb-1">{translatePageText("Vui lòng chọn") + " "}<b>{totalTables}</b>{" " + translatePageText("bàn. Đã chọn") + " "}{selectedTables.length}/{totalTables}.
                        </p>
                        <p className="text-gray-500 mb-2 text-xs">
                            <span className="inline-block w-3 h-3 bg-gray-400 rounded-sm align-middle mr-1"></span>{translatePageText("Bàn xám: đã có người đặt trong khung giờ này") + " "}</p>
                        {isCheckingOverlap && (
                            <p className="text-gray-500 mb-2">{translatePageText("Đang kiểm tra bàn trống...")}</p>
                        )}

                        <div className="border p-2 bg-white rounded">
                            {TABLE_GROUPS.map((g) => tableTypes[g.key] > 0 && (
                                <div key={g.key} className="mb-4">
                                    <div className="font-bold text-sm mb-2 text-gray-700 border-b pb-1">
                                        {translatePageText(g.name)} ({g.range.replace(' - ', '-')}{translatePageText(") - Cần chọn") + " "}{tableTypes[g.key]}{" " + translatePageText("bàn") + " "}</div>
                                    <div className="grid grid-cols-5 gap-2">
                                        {Array.from({ length: g.count }, (_, i) => i + g.from).map((num) => {
                                            const occupied = unavailableTables.includes(num);
                                            const selected = selectedTables.includes(num);
                                            return (
                                                <button
                                                    type="button"
                                                    key={num}
                                                    onClick={() => handleTableSelect(num)}
                                                    disabled={occupied}
                                                    className={`p-2 text-xs border rounded transition ${
                                                        occupied
                                                            ? 'bg-gray-400 text-white border-gray-400 cursor-not-allowed opacity-80'
                                                            : selected
                                                                ? 'bg-red-600 text-white border-red-600 font-bold'
                                                                : 'bg-white hover:border-red-600'
                                                    }`}
                                                >
                                                    {num}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                            {typesTotal === 0 && (
                                <p className="text-gray-500 p-2">{translatePageText("Hãy chọn loại bàn ở phần 2 trước.")}</p>
                            )}
                        </div>
                        {tableSelectError && (
                            <p className="mt-2 text-sm font-semibold text-red-600">{tableSelectError}</p>
                        )}
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={confirmOpen}
                title={translatePageText("Xác nhận chỉnh sửa đơn")}
                onClose={() => { if (!saving) setConfirmOpen(false); }}
                cancelText="Quay lại"
                onConfirm={handleSave}
                confirmText={saving ? translatePageText("Đang lưu...") : translatePageText("Xác nhận")}
                confirmDisabled={saving}
            >
                <p className="text-gray-700 mb-3">{translatePageText("Bạn có chắc muốn lưu các thay đổi cho đơn hàng") + " "}{bill?.order_stt || bill?.order_id}{" " + translatePageText("không?") + " "}</p>
                <p className="text-sm bg-yellow-50 border border-yellow-200 text-yellow-800 rounded p-3">{translatePageText("Việc chỉnh sửa sẽ tiêu hao") + " "}<strong>{translatePageText("1 lượt chỉnh sửa đơn")}</strong>{" " + translatePageText("trong tuần (hiện còn") + " "}<strong>{attemptsLeft}</strong>{" " + translatePageText("lượt). Đơn không cần thanh toán lại.") + " "}</p>
            </Modal>
            <Modal
                isOpen={Boolean(hint)}
                title={translatePageText("Thông báo")}
                onClose={() => setHint('')}
                cancelText="Đóng"
            >
                <p className="text-gray-700">{hint}</p>
            </Modal>
        </>
    );
}
