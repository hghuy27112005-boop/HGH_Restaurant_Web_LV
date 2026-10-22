import React, { useState } from 'react';

// Vùng có thể thu gọn / mở rộng. Nội dung chỉ được dựng khi mở lần đầu,
// sau đó giữ nguyên (chỉ ẩn đi) để không mất bộ lọc đã chọn.
const CollapsibleSection = ({ title, icon, children, defaultOpen = false }) => {
    const [open, setOpen] = useState(defaultOpen);
    const [everOpened, setEverOpened] = useState(defaultOpen);

    const toggle = () => {
        setOpen((o) => !o);
        setEverOpened(true);
    };

    return (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 overflow-hidden">
            <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                className="w-full flex items-center justify-between gap-3 px-4 sm:px-6 py-4 text-left hover:bg-red-50 transition"
            >
                <span className="flex items-center gap-3 text-lg font-semibold text-red-600">
                    {icon && <i className={`fas ${icon}`}></i>}
                    {title}
                </span>
                <i className={`fas fa-chevron-down text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}></i>
            </button>
            <div className={open ? 'border-t border-gray-100 px-4 sm:px-6 py-4 min-h-[340px]' : 'hidden'}>
                {everOpened && children}
            </div>
        </section>
    );
};

export default CollapsibleSection;