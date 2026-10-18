import React, { useState, useEffect, useRef } from 'react';

const pad = (n) => String(n).padStart(2, '0');

export const formatDmy = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

// Bộ lọc ngày: mode 'day' (nhiều ngày lẻ, dd/mm/yyyy) hoặc 'month' (mm/yyyy)
export const emptyDateFilter = () => ({ mode: 'day', dates: [], month: '' });
export const todayDateFilter = () => ({ mode: 'day', dates: [formatDmy(new Date())], month: '' });

// Đổi bộ lọc ngày thành tham số gửi backend (prefix: '' hoặc 'created_' / 'arrival_')
export const dateFilterToParams = (filter, prefix = '') => {
    if (filter.mode === 'month' && filter.month) return { [`${prefix}month`]: filter.month };
    if (filter.mode === 'day' && filter.dates.length > 0) return { [`${prefix}dates`]: filter.dates.join(',') };
    return {};
};

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export const DateFilter = ({ label, value, onChange }) => {
    const [open, setOpen] = useState(false);
    const [view, setView] = useState(() => new Date());
    const ref = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const year = view.getFullYear();
    const month = view.getMonth();
    const firstOffset = (new Date(year, month, 1).getDay() + 6) % 7; // tuần bắt đầu từ T2
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [
        ...Array(firstOffset).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];

    // Đổi chế độ thì xóa lựa chọn của chế độ còn lại (ngày và tháng loại trừ nhau)
    const switchMode = (mode) => {
        if (mode !== value.mode) onChange({ mode, dates: [], month: '' });
    };

    const toggleDay = (day) => {
        const key = formatDmy(new Date(year, month, day));
        const dates = value.dates.includes(key)
            ? value.dates.filter((d) => d !== key)
            : [...value.dates, key];
        onChange({ ...value, dates });
    };

    const pickMonth = (m) => {
        const key = `${pad(m + 1)}/${year}`;
        onChange({ ...value, month: value.month === key ? '' : key });
    };

    const move = (delta) => {
        setView(value.mode === 'month'
            ? new Date(year + delta, month, 1)
            : new Date(year, month + delta, 1));
    };

    let summary;
    if (value.mode === 'month') {
        summary = value.month ? `Tháng ${value.month}` : 'Tất cả';
    } else if (value.dates.length === 0) {
        summary = 'Tất cả';
    } else if (value.dates.length === 1) {
        summary = value.dates[0];
    } else {
        summary = `${value.dates.length} ngày đã chọn`;
    }

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                title={value.mode === 'day' ? value.dates.join(', ') : undefined}
                className="flex items-center gap-2 border border-gray-300 rounded px-3 py-2 bg-white text-sm hover:border-red-600"
            >
                <i className="far fa-calendar text-red-600"></i>
                <span className="text-gray-500">{label}:</span>
                <span className="font-semibold text-gray-800">{summary}</span>
            </button>

            {open && (
                <div className="absolute left-0 top-full mt-2 z-30 w-72 bg-white border border-gray-200 rounded-lg shadow-xl p-4">
                    <div className="flex items-center gap-2 mb-3 text-sm">
                        <span className="text-gray-600">Lọc theo:</span>
                        <div className="inline-flex rounded border border-red-600 overflow-hidden">
                            {[['day', 'Ngày'], ['month', 'Tháng']].map(([mode, text]) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => switchMode(mode)}
                                    className={`px-3 py-1 font-semibold ${value.mode === mode ? 'bg-red-600 text-white' : 'bg-white text-red-600'}`}
                                >
                                    {text}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-between mb-2">
                        <button type="button" onClick={() => move(-1)} className="w-8 h-8 rounded hover:bg-gray-100 font-bold">‹</button>
                        <span className="font-semibold text-gray-800">
                            {value.mode === 'month' ? `Năm ${year}` : `Tháng ${month + 1}/${year}`}
                        </span>
                        <button type="button" onClick={() => move(1)} className="w-8 h-8 rounded hover:bg-gray-100 font-bold">›</button>
                    </div>

                    {value.mode === 'day' ? (
                        <>
                            <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-1">
                                {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                                {cells.map((day, idx) => {
                                    if (!day) return <div key={`blank-${idx}`} />;
                                    const selected = value.dates.includes(formatDmy(new Date(year, month, day)));
                                    return (
                                        <button
                                            key={day}
                                            type="button"
                                            onClick={() => toggleDay(day)}
                                            className={`h-8 rounded text-sm ${selected ? 'bg-red-600 text-white font-bold' : 'hover:bg-red-50 text-gray-700'}`}
                                        >
                                            {day}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <div className="grid grid-cols-3 gap-2">
                            {Array.from({ length: 12 }, (_, m) => {
                                const selected = value.month === `${pad(m + 1)}/${year}`;
                                return (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => pickMonth(m)}
                                        className={`py-2 rounded text-sm ${selected ? 'bg-red-600 text-white font-bold' : 'hover:bg-red-50 text-gray-700 border border-gray-200'}`}
                                    >
                                        Tháng {m + 1}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="flex justify-between items-center mt-3 pt-3 border-t text-sm">
                        <button
                            type="button"
                            onClick={() => onChange({ ...value, dates: [], month: '' })}
                            className="text-gray-500 hover:text-red-600 font-semibold"
                        >
                            Xóa chọn
                        </button>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="px-3 py-1 rounded bg-red-600 text-white font-semibold hover:bg-red-700"
                        >
                            Xong
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// Phân trang: ô nhập số trang + nút "Đi tới"
export const Pagination = ({ currentPage, lastPage, onChange }) => {
    const [input, setInput] = useState(String(currentPage));

    useEffect(() => {
        setInput(String(currentPage));
    }, [currentPage]);

    if (lastPage <= 1) return null;

    const go = () => {
        let page = parseInt(input, 10);
        if (isNaN(page) || page < 1) page = 1;
        if (page > lastPage) page = lastPage;
        setInput(String(page));
        onChange(page);
    };

    return (
        <div className="flex justify-center items-center gap-2 mt-4 pt-4 border-t text-sm">
            <span>Trang</span>
            <input
                type="number"
                min={1}
                max={lastPage}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
                className="w-16 px-2 py-1 border border-gray-300 rounded text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span>/ {lastPage}</span>
            <button onClick={go} className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700">
                Đi tới
            </button>
        </div>
    );
};

// ===== Xuất Excel =====
export const EXPORT_LIMIT = 2000; // quá số đơn này thì báo trước, không cho xuất

// Lấy toàn bộ đơn khớp bộ lọc (lặp qua các trang, mỗi trang 200 đơn)
export const fetchAllRows = async (fetchPage) => {
    const rows = [];
    let page = 1;
    let lastPage = 1;
    do {
        const res = await fetchPage(page, 200);
        rows.push(...(res.data?.data || []));
        lastPage = res.data?.pagination?.last_page || 1;
        page += 1;
    } while (page <= lastPage);
    return rows;
};

// ===== Xuất XLSX =====
// columns: [{ header, width, type }], type: 'text' | 'number' | 'money' | 'datetime'
const XLSX_FORMATS = {
    text: '@',
    number: '0',
    money: '#,##0 "VNĐ"',
    datetime: 'dd/mm/yyyy hh:mm:ss',
};

const toXlsxValue = (value, type) => {
    if (value == null || value === '') return null;
    if (type === 'datetime') {
        const d = new Date(value);
        if (isNaN(d.getTime())) return null;
        // Excel không có múi giờ nên phải bù để hiển thị đúng giờ địa phương
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    }
    if (type === 'number' || type === 'money') {
        const n = Number(value);
        return isNaN(n) ? null : n;
    }
    return String(value);
};

export const downloadXlsx = async (filename, sheetName, columns, rows) => {
    const mod = await import('exceljs');
    const ExcelJS = mod.default || mod;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName);

    sheet.columns = columns.map((c) => ({ header: c.header, width: c.width || 15 }));
    sheet.getRow(1).font = { bold: true };

    rows.forEach((r) => {
        const row = sheet.addRow(r.map((v, i) => toXlsxValue(v, columns[i].type)));
        columns.forEach((c, i) => {
            row.getCell(i + 1).numFmt = XLSX_FORMATS[c.type] || '@';
        });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
};