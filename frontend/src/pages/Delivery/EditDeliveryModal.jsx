import React, { useState, useEffect, useMemo } from 'react';
import { deliveryService } from '../../services/api';
import { Modal } from '../../components/Shared';
import { translatePageText } from '../../pageTextTranslations';

// Modal chỉnh sửa đơn ship ĐÃ thanh toán: địa chỉ giao và thời điểm muốn nhận hàng (bật/tắt được giờ hẹn).
// Không đổi món, không thanh toán lại, phí ship thu riêng khi nhận hàng nên không đổi giá đơn.
// Mỗi lần lưu tiêu hao 1 lượt chỉnh sửa trong tuần. Backend tính toán và kiểm tra (previewModify / modify),
// frontend chỉ hiển thị kết quả, giống cách đặt đơn ship mới.

const pad = (v) => String(v).padStart(2, '0');

// "09:30:00" -> "09:30"; null/'' -> null
const toHHMM = (value) => (value ? String(value).substring(0, 5) : null);

const formatDateTime = (value) => (value
    ? new Date(value).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    })
    : '—');

const formatShortTime = (value) => (value
    ? new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : '—');

// Thông tin hiện tại của đơn (lấy từ bill.delivery)
const getOriginal = (bill) => {
    const d = bill?.delivery;
    return {
        deliveryId: d?.delivery_id,
        address: (d?.address || '').trim(),
        pref: toHHMM(d?.preferred_delivery_time),
        cookingAt: d?.cooking_at,
        shipAt: d?.ship_at,
        arrivalAt: d?.estimated_completion_at,
    };
};

/**
 * Props:
 *  - isOpen, bill (đơn ship đang sửa, có bill.delivery), attemptsLeft (số lượt sửa còn lại lúc mở)
 *  - onClose: đóng modal
 *  - onSaved({ attemptsLeft }): gọi sau khi lưu thành công
 */
export default function EditDeliveryModal({ isOpen, bill, attemptsLeft, onClose, onSaved }) {
    const original = useMemo(() => getOriginal(bill), [bill]);
    const deliveryId = original.deliveryId;

    const [address, setAddress] = useState('');
    const [gpsCoords, setGpsCoords] = useState(null);
    const [gpsLoading, setGpsLoading] = useState(false);

    const [prefEnabled, setPrefEnabled] = useState(false);
    const [prefH, setPrefH] = useState('');
    const [prefM, setPrefM] = useState('');

    // Kết quả preview từ backend, chỉ hợp lệ khi previewedSig khớp với dữ liệu đang nhập
    const [preview, setPreview] = useState(null);
    const [previewedSig, setPreviewedSig] = useState('');
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState(null);

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);

    // Mỗi lần mở modal: điền sẵn thông tin hiện tại của đơn
    useEffect(() => {
        if (!isOpen || !bill) return;
        const o = getOriginal(bill);
        const [h = '', m = ''] = o.pref ? o.pref.split(':') : [];

        setAddress(o.address);
        setGpsCoords(null);
        setGpsLoading(false);
        setPrefEnabled(Boolean(o.pref));
        setPrefH(h);
        setPrefM(m);
        setPreview(null);
        setPreviewedSig('');
        setPreviewLoading(false);
        setPreviewError(null);
        setConfirmOpen(false);
        setSaving(false);
        setSaveError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, deliveryId]);

    const addrTrim = address.trim();

    const prefValid = /^\d{1,2}$/.test(String(prefH)) && /^\d{1,2}$/.test(String(prefM))
        && Number(prefH) <= 23 && Number(prefM) <= 59;
    const prefStr = prefEnabled && prefValid ? `${pad(prefH)}:${pad(prefM)}` : null;
    const prefIncomplete = prefEnabled && !prefValid;

    // "Chữ ký" dữ liệu đang nhập: preview chỉ dùng được khi khớp chữ ký này
    const sig = `${addrTrim}|${prefStr ?? ''}|${gpsCoords ? `${gpsCoords.lat},${gpsCoords.lng}` : ''}`;

    // Lỗi do đơn không còn sửa được (hết hạn, đang chuẩn bị...) hiện ở đầu form, còn lỗi địa chỉ hiện ở cụm địa chỉ
    const handleRequestError = (err, fallback, isPreview) => {
        const status = err.response?.status;
        const message = err.response?.data?.message || err.message || fallback;
        if (status === 400 || status === 403 || status === 404) {
            setSaveError(message);
        } else if (isPreview) {
            setPreviewError(message);
        } else {
            setSaveError(message);
        }
    };

    // Tự kiểm tra địa chỉ + lịch giao sau khi khách ngừng nhập 800ms, tránh gọi API theo từng ký tự
    useEffect(() => {
        if (!isOpen || !deliveryId) return undefined;

        if (!addrTrim) {
            setPreview(null);
            setPreviewError(null);
            setPreviewLoading(false);
            return undefined;
        }

        // Giờ hẹn đang nhập dở thì chờ nhập xong
        if (prefIncomplete) {
            setPreviewLoading(false);
            return undefined;
        }

        // Đã có preview đúng cho dữ liệu này (vừa lấy từ GPS...) thì không tra cứu lại
        if (previewedSig === sig) {
            setPreviewLoading(false);
            return undefined;
        }

        let cancelled = false;
        setPreviewLoading(true);
        setPreviewError(null);

        const timer = setTimeout(async () => {
            try {
                const res = await deliveryService.previewModify(deliveryId, {
                    address: addrTrim,
                    ...(gpsCoords ? { lat: gpsCoords.lat, lng: gpsCoords.lng } : {}),
                    preferred_delivery_time: prefStr,
                });
                if (cancelled) return;
                setPreview(res.data.data);
                setPreviewedSig(sig);
            } catch (err) {
                if (cancelled) return;
                setPreview(null);
                handleRequestError(err, translatePageText("Không thể kiểm tra địa chỉ này."), true);
            } finally {
                if (!cancelled) setPreviewLoading(false);
            }
        }, 800);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, deliveryId, sig, prefIncomplete]);

    const handleAddressChange = (value) => {
        setAddress(value);
        setGpsCoords(null); // khách gõ tay lại địa chỉ thì không còn tin toạ độ GPS cũ
    };

    const handleUseCurrentLocation = () => {
        if (!navigator.geolocation) {
            setPreviewError(translatePageText("Trình duyệt của bạn không hỗ trợ lấy vị trí hiện tại."));
            return;
        }

        setGpsLoading(true);
        setPreviewError(null);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                try {
                    const res = await deliveryService.previewModify(deliveryId, {
                        lat: latitude,
                        lng: longitude,
                        preferred_delivery_time: prefStr,
                    });
                    const data = res.data.data;
                    const newAddress = (data.address || '').trim();

                    setAddress(newAddress);
                    setGpsCoords({ lat: data.lat, lng: data.lng });
                    setPreview(data);
                    setPreviewedSig(`${newAddress}|${prefStr ?? ''}|${data.lat},${data.lng}`);
                } catch (err) {
                    handleRequestError(err, translatePageText("Không thể xác định vị trí giao hàng từ vị trí hiện tại."), true);
                } finally {
                    setGpsLoading(false);
                }
            },
            () => {
                setGpsLoading(false);
                setPreviewError(translatePageText("Không thể lấy vị trí hiện tại. Vui lòng cho phép quyền truy cập vị trí hoặc nhập địa chỉ thủ công."));
            }
        );
    };

    const previewReady = Boolean(preview) && previewedSig === sig && !previewLoading;
    const schedule = previewReady ? preview.schedule : null;

    const changed = addrTrim !== original.address || prefStr !== original.pref;

    // Lỗi theo từng cụm (hiện ngay tại cụm có lỗi)
    const addressError = !addrTrim ? 'Vui lòng nhập địa chỉ giao hàng.' : previewError;

    const earliestTime = schedule ? formatShortTime(schedule.earliest_arrival_at) : '—';
    const tooEarly = schedule?.preferred_time_too_early === true;
    const timeError = prefIncomplete && (prefH || prefM)
        ? 'Vui lòng nhập thời gian giao hàng hợp lệ trong khoảng từ 00:00 đến 23:59.'
        : (tooEarly ? `Thời điểm bạn chọn quá sớm. Hàng của bạn sẽ tới sớm nhất là ${earliestTime}.` : null);

    const afterClosing = prefStr ? Number(prefH) * 60 + Number(prefM) > 22 * 60 : false;

    const cookingAt = schedule?.cooking_at ? new Date(schedule.cooking_at) : null;
    const shipAt = schedule?.ship_at ? new Date(schedule.ship_at) : null;
    const arrivalAt = schedule?.estimated_completion_at ? new Date(schedule.estimated_completion_at) : null;
    const cookingNow = cookingAt ? cookingAt.getTime() <= Date.now() + 5 * 60000 : false;
    const cookingNotToday = cookingAt ? cookingAt.toDateString() !== new Date().toDateString() : false;

    const canSave = changed && previewReady && !addressError && !timeError && !prefIncomplete && !saving;

    const handleClose = () => {
        if (saving) return;
        onClose?.();
    };

    const handleSave = async () => {
        if (!canSave) return;
        setSaving(true);
        setSaveError(null);
        try {
            const res = await deliveryService.modifyDelivery(deliveryId, {
                address: addrTrim,
                ...(gpsCoords ? { lat: gpsCoords.lat, lng: gpsCoords.lng } : {}),
                preferred_delivery_time: prefStr,
            });
            setConfirmOpen(false);
            onSaved?.({ attemptsLeft: res.data?.modify_attempts_left });
        } catch (err) {
            const data = err.response?.data;
            setConfirmOpen(false);
            if (data?.stock_status === 'insufficient') {
                setSaveError(translatePageText("Không đủ nguyên liệu cho đơn này theo lịch mới. Vui lòng chọn thời điểm khác hoặc giữ nguyên lịch cũ."));
            } else {
                setSaveError(data?.message || err.message || 'Không thể chỉnh sửa đơn. Vui lòng thử lại.');
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Modal
                isOpen={isOpen}
                title={translatePageText("Chỉnh sửa thông tin đơn ship")}
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
                        <div className="text-gray-600">{translatePageText("Địa chỉ:") + " "}<strong>{original.address || '—'}</strong>
                        </div>
                        <div className="text-gray-600">{translatePageText("Giờ muốn nhận hàng:") + " "}<strong>{original.pref || translatePageText("Không hẹn giờ")}</strong>
                            {' · '}{translatePageText("Bắt đầu nấu:") + " "}{formatDateTime(original.cookingAt)}
                            {' · '}{translatePageText("Hàng tới:") + " "}{formatDateTime(original.arrivalAt)}
                        </div>
                        <div className="text-xs text-gray-500">{translatePageText("Mỗi lần lưu tiêu hao 1 lượt chỉnh sửa trong tuần (hiện còn") + " "}{attemptsLeft}{" " + translatePageText("lượt). Không thể thay đổi món ăn và không cần thanh toán lại. Chỉ sửa được khi đơn chưa tới giờ bắt đầu chuẩn bị.") + " "}</div>
                    </div>

                    {saveError && (
                        <div className="text-sm font-semibold text-red-700 bg-red-100 border border-red-200 p-3 rounded">
                            {saveError}
                        </div>
                    )}

                    {/* Cụm 1: địa chỉ giao hàng */}
                    <div>
                        <h3 className="font-bold text-base text-red-600 mb-2">{translatePageText("1. Địa chỉ giao hàng")}</h3>
                        <input
                            type="text"
                            value={address}
                            onChange={(e) => handleAddressChange(e.target.value)}
                            className="w-full border p-2 rounded focus:border-red-600 focus:outline-none"
                            placeholder={translatePageText("Nhập địa chỉ cụ thể (số nhà, đường, phường/xã, tỉnh/thành)...")}
                        />
                        <button
                            type="button"
                            onClick={handleUseCurrentLocation}
                            disabled={gpsLoading || saving}
                            className="mt-2 text-sm font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50 flex items-center gap-1"
                        >
                            <i className={`fas ${gpsLoading ? 'fa-spinner fa-spin' : 'fa-location-crosshairs'}`}></i>
                            {gpsLoading ? translatePageText("Đang lấy vị trí...") : translatePageText("Tự động lấy vị trí hiện tại")}
                        </button>

                        {previewLoading && (
                            <p className="mt-2 text-gray-500">{translatePageText("Đang kiểm tra địa chỉ...")}</p>
                        )}

                        {!previewLoading && addressError && (
                            <p className="mt-2 font-semibold text-red-600">{addressError}</p>
                        )}

                        {previewReady && (
                            <div className="mt-3 bg-blue-50 border border-blue-200 rounded p-3 space-y-1">
                                <div className="flex justify-between gap-4">
                                    <span className="text-gray-600">{translatePageText("Khoảng cách:")}</span>
                                    <span className="font-semibold">{preview.distance_km} km</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <span className="text-gray-600">{translatePageText("Thời gian giao dự kiến:")}</span>
                                    <span className="font-semibold">{preview.duration_minutes}{" " + translatePageText("phút")}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <span className="text-gray-600">{translatePageText("Phí ship (thu riêng khi nhận hàng):")}</span>
                                    <span className="font-bold text-red-600">{Number(preview.shipping_fee ?? 0).toLocaleString('vi-VN')}{translatePageText("đ")}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Cụm 2: thời điểm muốn nhận hàng */}
                    <div>
                        <h3 className="font-bold text-base text-red-600 mb-2">{translatePageText("2. Thời điểm muốn nhận hàng")}</h3>
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-3">
                                    <span className="font-semibold text-gray-700">{translatePageText("Thời điểm giao hàng mong muốn")}</span>
                                    <button
                                        type="button"
                                        onClick={() => setPrefEnabled((value) => !value)}
                                        className={`relative inline-flex items-center w-14 h-7 rounded-full border-2 border-white shadow-inner transition-colors duration-200 flex-shrink-0 ${prefEnabled ? 'bg-green-500' : 'bg-gray-400'}`}
                                        aria-label={translatePageText("Bật thời điểm giao hàng mong muốn")}
                                    >
                                        <span className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform duration-200 ${prefEnabled ? 'translate-x-8' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                                <p className="mt-1 text-xs text-gray-500">
                                    {prefEnabled ? translatePageText("Bạn muốn hàng được giao tới lúc mấy giờ?") : translatePageText("Đang tắt: đơn được chuẩn bị và giao sớm nhất có thể.")}
                                </p>
                            </div>
                            {prefEnabled && (
                                <div>
                                    <div className="flex items-center gap-1 border p-2 rounded bg-white w-fit focus-within:ring-2 focus-within:ring-red-500">
                                        <input type="text" maxLength="2" inputMode="numeric" placeholder="07" value={prefH} onChange={(e) => setPrefH(e.target.value.replace(/\D/g, ''))} className="w-10 text-center outline-none bg-transparent" />
                                        <span className="font-bold text-gray-500">:</span>
                                        <input type="text" maxLength="2" inputMode="numeric" placeholder="30" value={prefM} onChange={(e) => setPrefM(e.target.value.replace(/\D/g, ''))} className="w-10 text-center outline-none bg-transparent" />
                                    </div>
                                    <p className="mt-1 text-xs text-gray-500">
                                        {schedule ? `Sớm nhất: ${earliestTime} — muộn nhất: 22:00` : translatePageText("Muộn nhất: 22:00")}
                                    </p>
                                </div>
                            )}
                        </div>

                        {timeError && (
                            <p className="mt-2 font-semibold text-red-600">{timeError}</p>
                        )}

                        {afterClosing && (
                            <p className="mt-2 text-sm bg-yellow-50 border border-yellow-200 text-yellow-800 rounded p-3">{translatePageText("Nhà hàng đóng cửa lúc 22h và không giao hàng sau giờ đóng cửa. Nhà hàng sẽ bắt đầu chuẩn bị đơn vào 7h30 sáng hôm sau.") + " "}</p>
                        )}
                    </div>

                    {/* Cụm 3: lịch dự kiến sau khi sửa */}
                    <div>
                        <h3 className="font-bold text-base text-red-600 mb-2">{translatePageText("3. Lịch dự kiến sau khi sửa")}</h3>
                        {schedule && cookingAt ? (
                            <div className="bg-white border border-gray-200 rounded p-3 space-y-2">
                                <div className="flex justify-between gap-4">
                                    <span className="text-gray-600">{translatePageText("Bắt đầu nấu (dự kiến):")}</span>
                                    <span className="font-semibold">{cookingNow ? translatePageText("Ngay sau khi lưu") : formatDateTime(cookingAt)}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <span className="text-gray-600">{translatePageText("Bắt đầu giao (dự kiến):")}</span>
                                    <span className="font-semibold">{formatDateTime(shipAt)}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <span className="text-gray-600">{translatePageText("Hàng tới (dự kiến):")}</span>
                                    <span className="font-semibold">{formatDateTime(arrivalAt)}</span>
                                </div>
                                {cookingNotToday && (
                                    <p className="text-sm bg-yellow-50 border border-yellow-200 text-yellow-800 rounded p-3">{translatePageText("Đơn hàng này dự kiến không thể hoàn tất giao trong hôm nay, nên nhà hàng sẽ bắt đầu chuẩn bị vào") + " "}<strong>{formatDateTime(cookingAt)}</strong>.
                                    </p>
                                )}
                                {cookingNow && (
                                    <p className="text-sm bg-yellow-50 border border-yellow-200 text-yellow-800 rounded p-3">{translatePageText("Sau khi lưu, đơn sẽ được chuẩn bị ngay nên bạn sẽ không thể chỉnh sửa thêm.") + " "}</p>
                                )}
                            </div>
                        ) : (
                            <p className="text-gray-500">{translatePageText("Lịch dự kiến sẽ hiện sau khi địa chỉ và thời điểm nhận hàng hợp lệ.")}</p>
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
                <p className="text-sm bg-yellow-50 border border-yellow-200 text-yellow-800 rounded p-3">{translatePageText("Việc chỉnh sửa sẽ tiêu hao") + " "}<strong>{translatePageText("1 lượt chỉnh sửa đơn")}</strong>{" " + translatePageText("trong tuần (hiện còn") + " "}<strong>{attemptsLeft}</strong>{" " + translatePageText("lượt). Đơn không cần thanh toán lại, phí ship vẫn thu riêng khi nhận hàng.") + " "}</p>
            </Modal>
        </>
    );
}
