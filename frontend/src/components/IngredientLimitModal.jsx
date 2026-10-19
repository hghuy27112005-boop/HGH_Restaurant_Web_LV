import React from 'react';
import { Modal } from './Shared';

// Modal báo lỗi vượt định lượng dùng chung (giỏ hàng / đặt ship / đặt bàn):
// - overLimit: [{ ingredient_name, requested, dish_names[] }] — nguyên liệu bị yêu cầu vượt 50
const IngredientLimitModal = ({
    isOpen,
    onClose,
    message,
    overLimit = [],
    formatIngredient = (name) => name,
}) => (
    <Modal
        isOpen={isOpen}
        title="Vượt định lượng tối đa"
        onClose={onClose}
        cancelText="Đóng"
        className="max-w-2xl"
    >
        <div className="space-y-4 text-sm text-gray-700">
            {message && <p>{message}</p>}

            {overLimit.length > 0 && (
                <div>
                    <p className="mb-2 text-gray-600">
                        Mỗi nguyên liệu chỉ dùng tối đa 50 phần cho một đơn. Nguyên liệu trùng giữa các món được cộng dồn.
                    </p>
                    <table className="w-full text-sm bg-white border border-black border-t-4 border-t-red-600">
                        <thead>
                            <tr>
                                <th className="text-left py-2 px-3 font-semibold text-gray-700 border border-black">Nguyên liệu</th>
                                <th className="text-left py-2 px-3 font-semibold text-gray-700 border border-black">Các món dùng nguyên liệu này</th>
                                <th className="text-center py-2 px-3 font-semibold text-gray-700 border border-black">Tổng cần</th>
                            </tr>
                        </thead>
                        <tbody>
                            {overLimit.map((item, i) => (
                                <tr key={i}>
                                    <td className="py-2 px-3 border border-black">{formatIngredient(item.ingredient_name)}</td>
                                    <td className="py-2 px-3 border border-black">{(item.dish_names || []).join(', ')}</td>
                                    <td className="py-2 px-3 text-center font-bold text-red-600 border border-black">{item.requested} / 50</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    </Modal>
);

export default IngredientLimitModal;