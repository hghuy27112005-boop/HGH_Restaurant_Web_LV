<?php

namespace App\Services;

use App\Models\{Bill, ChatMessage, ChatSession, Points};

class SavedInvoiceLibrary
{
    public function catalog(int $userId, ?string $requestedCode = null): array
    {
        $sessionId = ChatSession::where('user_id', $userId)->value('session_id');
        if (!$sessionId && !$requestedCode) return [];
        $images = ChatMessage::where('session_id', $sessionId)->where('sender', 'user')->whereNotNull('image_path')
            ->orderByDesc('message_id')->get();
        $references = [];
        foreach ($images as $image) {
            $code = $image->invoice_bill_id;
            // Receipts saved before the reference column was introduced.
            if (!$code && preg_match('/^(?:Hóa đơn|Invoice) ([A-Za-z0-9-]{1,40})$/u', $image->content ?? '', $match)) $code = $match[1];
            if ($code && !isset($references[$code]) && app(ChatImageStorage::class)->resolve($image->image_path)) $references[$code] = $image;
        }
        if ($requestedCode && !isset($references[$requestedCode])) $references[$requestedCode] = null;
        if (!$references) return [];
        // The first ledger entry is the payment award; later entries may be refunds.
        $awards = Points::where('user_id', $userId)->whereIn('bill_id', array_keys($references))
            ->orderBy('point_id')->get()->unique('bill_id')->keyBy('bill_id');
        // The receipt image is an index, never proof of ownership or current status.
        return Bill::whereIn('bill_id', array_keys($references))
            ->whereHas('order', fn ($query) => $query->where('user_id', $userId))
            ->with('order.items.dish.priceProfile')->orderByDesc('created_at')->limit(60)->get()->map(function ($bill) use ($references, $awards) {
                $image = $references[$bill->bill_id];
                return [
                    'image_message_id' => $image?->message_id,
                    'invoice_code' => $bill->bill_id,
                    'saved_at' => $image?->created_at?->toIso8601String(),
                    'ordered_at' => $bill->created_at?->toIso8601String(),
                    'order_type' => $bill->order->order_type,
                    'order_type_vi' => $bill->order->isBooking() ? 'Đặt bàn' : ($bill->order->isDelivery() ? 'Đặt ship' : 'Chưa xác định'),
                    'order_type_en' => $bill->order->isBooking() ? 'Table booking' : ($bill->order->isDelivery() ? 'Delivery' : 'Unknown'),
                    'subtotal' => $bill->order->subtotal_price,
                    'payment_method' => $bill->payment_method,
                    'paid_amount' => $bill->total_price,
                    'discount_percentage' => $bill->sale_off_percentage,
                    'discounted_total' => $bill->sale_off_total_price,
                    'points_awarded_at_payment' => isset($awards[$bill->bill_id]) ? (int) $awards[$bill->bill_id]->points_earned : null,
                    'points_redeemed' => $bill->payment_method === 'Points' ? (int) floor(($bill->sale_off_total_price ?? $bill->order->subtotal_price) / 100) : 0,
                    'items' => $bill->order->items->map(fn ($item) => [
                        'dish' => $item->dish?->dish_name,
                        'dish_en' => $item->dish?->dish_name_en,
                        'quantity' => $item->quantity,
                        'price_tier' => $item->price_tier,
                        'has_price_options' => $item->dish?->priceProfile !== null,
                        'recipe' => $item->customization_name,
                    ])->all(),
                ];
            })->all();
    }
}
