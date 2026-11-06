# Kiến thức chatbot phía khách

Đối chiếu frontend và backend ngày 04/11/2026. Chỉ mô tả hành vi khách thực sự làm được, không cấp hướng dẫn quản trị cho mô hình.

## Cấu trúc

- `website_knowledge.txt`: hiểu mục đích, giữ ngữ cảnh, cách hỏi lại, giới hạn thông tin và giọng tư vấn.
- `customer_layout.txt`: thứ tự các vùng, mục cha, nút, hộp và đường đi trên desktop/mobile. Không được coi bản đồ là ảnh chụp hiện tại.
- `customer_rules.txt`: điều kiện, hạn mức, trạng thái và kết quả thao tác. Giá trị `{{...}}` lấy từ các hằng số backend qua `CustomerWebsiteKnowledge`.
- `script_nodes.json`: nguồn kịch bản chung frontend/backend cho các lượt bấm nút. Cập nhật cả phần này nếu vị trí thao tác trong kịch bản thay đổi.
- `CustomerWebsiteKnowledge::PAGE_TOPICS`: các trang được hỗ trợ và nhóm quy định cần nhấn mạnh. Mọi lượt tư vấn vẫn nhận đầy đủ kiến thức để hiểu yêu cầu đổi trang/chủ đề; chỉ mục không phân loại ý định bằng từ khóa và không trả lời cố định.

Không query tài khoản, tồn kho, giá hoặc trạng thái đơn khi dựng kiến thức. Những dữ liệu riêng chỉ được dùng nếu luồng chat cung cấp đúng quyền; các tài liệu không chứng minh giá trị hiện tại.

## Bảng đối chiếu nguồn

Các đường dẫn trong bảng tương đối so với gốc repository. Kiểm tra cả handlers, điều kiện hiển thị nút và nhánh từ chối của backend; không suy khả năng chỉ từ tên trang hoặc comment.

| Trang / nhóm | Frontend | Backend / quy định đã rà |
| --- | --- | --- |
| Routes, khung chung, truy cập | `frontend/src/App.jsx`, `components/Layout.jsx`, `Navbar.jsx`, `ProtectedRoute.jsx`, `SessionEndedModal.jsx`, `hooks/useApi.js` | `backend/routes/api.php`, `AuthController`, middleware locked, `User::isLocked` |
| `/` Trang chủ | `pages/Home/HomeApp.jsx`, `components/Footer.jsx` | `DishController::index`, `DishRankingService`; có bestseller, không có danh sách sự kiện trên Home hiện tại |
| `/login` đăng nhập/đăng ký | `pages/Auth/LoginPage.jsx` | `AuthController::login/register/logout`, Google/Facebook auth; giới hạn đăng ký, duy nhất phiên đăng nhập |
| `/forgot-password` | `pages/Auth/ForgotPasswordPage.jsx` | `AuthController::sendResetOtp/verifyResetOtp/resetPassword`, `PasswordResetOtp`; hạn mã/gửi lại, số lần sai, khóa OTP khác khóa tài khoản |
| `/menu` | `pages/Menu/MenuPage.jsx`, `FavoriteRecommendations.jsx` | `DishController::index`, `RecommendationController`, `RatingController`; 1–3 yêu thích, tối đa 6 gợi ý, loại trừ đánh giá thấp |
| `/dish-details/:id?` | `pages/Menu/DishDetailPage.jsx` | `DishController::show`, `DishCustomizationController`, `DishCustomizationService`, `IngredientSubstitutionPolicy`, `PhoRecipeProfiles`, `RecipeIngredientSet`; đổi ít nhất một nguyên liệu, preview/lưu, hết hạn, sở hữu, trùng, xóa, snapshot đơn |
| `/cart` | `pages/Cart/CartLayout.jsx`, `utils/cartStorage.js` | Hai giỏ riêng theo tài khoản, tự chọn giỏ có việc; rỗng vẫn vào tab xem đơn cũ được |
| `/cart/bookings` | `pages/Booking/BookingsPage.jsx`, `EditBookingModal.jsx` | `BookingTableController`, `BillController`, `BookingTable`, `User`, `Stock`; 5 bước, giờ/ngày/bàn, mốc chuẩn bị cũ, thanh toán, sửa/hủy và lượt |
| `/cart/deliveries` | `pages/Delivery/DeliveriesPage.jsx`, `EditDeliveryModal.jsx` | `OrderController`, `DeliveryController`, `Delivery`, `DeliveryDistanceService`, `User`, `Stock`; địa chỉ/phí, hẹn giờ mới vs sửa, dời lịch, giao ngay khóa sửa |
| Thanh toán, ưu đãi, điểm | Hộp thanh toán ở Booking/Delivery, `pages/Payment/PaymentResultPage.jsx` | `BillController::payWithPointsByOrder`, `VnpayController`, `SaleOffEvent`, `User::updateMembership`, `Points`; thu riêng ship, thưởng theo hạng trước trả, thu hồi khi hủy |
| `/profile` | `pages/User/ProfileLayout.jsx`, `ProfilePage.jsx` | `UserController`; giới hạn sửa hồ sơ khác đăng ký, đổi/cắt/lưu avatar, đổi mật khẩu, điểm/lượt |
| `/profile/orders` | `pages/Order/OrdersPage.jsx`, `components/Chatbot/SaveInvoiceMenu.jsx` | `OrderController::myBillsJson`, `BillController::exportPDF`, `ChatbotController::saveInvoice`; xem/lưu hóa đơn, không có sửa đơn |
| `/profile/ratings` | `pages/Rating/RatingPage.jsx`, `components/CollapsibleSection.jsx` | `RatingController`, `CommunityRecipeController`, `RecipeIngredientSet`, `ContentModerationService`; đánh giá trực tiếp, cộng đồng bên dưới, trùng chia sẻ toàn cộng đồng vs trùng lưu cùng người/món |
| `/payment-result`, `/refund-result` | `pages/Payment/PaymentResultPage.jsx`, `pages/Refund/RefundResultPage.jsx` | `VnpayController`, `BillController`, các nhánh hủy Points; phân biệt kết quả tạm/chính thức, khoản hoàn/điểm thưởng bị thu hồi |
| Cài đặt, chuông | `components/SettingsMenu.jsx`, `NotificationCenter.jsx`, `i18n.js` | `UserController::updatePreferredLanguage`, `UserNotificationController`, `UserNotificationService`; công tắc đổi ngay, cài nhận tin cần Lưu, không có route riêng |
| Chat, ảnh, lịch sử | `components/Chatbot/ChatbotWidget.jsx`, `sendVisualJob.js`, `ImageLibrary.jsx`, `SaveInvoiceMenu.jsx` | `ChatbotController`, `ChatVisualContext`, `ChatImageStorage`, `SavedInvoiceLibrary`, `ContentModerationService`; phạm vi, sở hữu, ngày chat, ảnh mới/ảnh cũ, xóa ảnh khác hủy đơn |

## Những điểm cần giữ đúng khi thay đổi code

- Một tính năng phải có cả vị trí lẫn điều kiện; hỏi nhiều phần không chỉ trả phần lý do.
- “Chưa thấy” cần đường tìm từ mốc khách đang thấy. Không thấy trong viewport không đồng nghĩa không tồn tại.
- Rating → phần đánh giá → bên dưới mới là Công thức thay thế; nút Chia sẻ ở đầu nội dung mục này; lưu bản công khai nằm trong hộp chi tiết. Trình chỉnh nguyên liệu chỉ ở Chi tiết món.
- Sửa/hủy bàn phải trước mốc chuẩn bị 60 phút tính theo lịch cũ (backend từ chối cả khi đúng mốc); lịch mới hợp lệ không khôi phục hạn cũ.
- Ship mới tính giờ hẹn với 45 phút chờ thanh toán; sửa đơn đã trả dùng 15 phút đệm. Không áp khoảng chờ 45 phút để hứa giao ngay vẫn có thời gian sửa.
- Không hẹn giờ trong giờ phục vụ và kịp giao hôm đó thì nấu ngay sau thanh toán; ngoài giờ/cận đóng cửa có thể dời lịch. Dựa mốc nấu thật, không chỉ nhãn chờ chuẩn bị.
- Ship nhập giờ/phút, không chọn ngày nhận tự do. Cả ngày/giờ giao dự kiến có thể thay đổi theo lịch.
- Điều kiện đủ điểm thu hồi để hủy VNPay không được áp thành chặn hủy Points; hai nhánh xử lý khác nhau.
- Sửa hồ sơ không dùng giới hạn email/điện thoại/tên của đăng ký.
- Lưu hóa đơn là dropdown PDF/chat; ngôn ngữ là công tắc, không phải item English để bấm.
- Nội dung mẫu không được quảng cáo thành đánh giá khách đã mua/trải nghiệm được xác minh.

## Kiểm tra

Chạy từ `backend`:

```powershell
php artisan test --filter='CustomerWebsiteKnowledgeTest|ChatbotLayoutGuidanceTest'
```

Các test không migrate/seed: kiểm kê routes frontend và whitelist ngữ cảnh, điền giới hạn từ backend, nhóm thông tin liên quan giữa trang, dựng prompt Anh/Việt và ảnh mới không lẫn ngữ cảnh lỗi cũ. HTTP được giả lập: đây là kiểm tra đường truyền kiến thức, không chứng minh mô hình luôn suy luận đúng.

Khi thử trực tiếp Gemini, dùng tình huống giả lập không chứa thông tin cá nhân, ghi cả các lần không nhận phản hồi và câu trả lời sai/thiếu. Không gọi kết quả đạt chỉ vì request HTTP thành công. Bộ tình huống nên phủ:

1. Menu: tìm đề xuất, chưa chọn yêu thích; chọn đủ 3; ô tìm bị khóa; kết quả ít/trống.
2. Chi tiết món: tìm nút công thức ở dưới các bước nấu; giữ nguyên chưa tạo được; preview không khớp/hết hạn; trùng bản riêng; vị trí nút xóa.
3. Rating: chưa chọn món; đã chọn nhưng chỉ thấy đánh giá; thu gọn; tìm lưu bản cộng đồng khác tìm chia sẻ; trùng chia sẻ vs trùng lưu; thật/giả.
4. Bàn: chưa có món; đổi số/loại bàn từ sơ đồ; bàn bị chiếm; quá giờ thanh toán; quá mốc cũ dù muốn dời lịch mới.
5. Ship: nơi nhận khác GPS; bị từ chối quyền vị trí; không có tuyến; hẹn quá sớm; không hẹn giờ vừa trả không sửa được; dời sáng hôm sau; lịch sau sửa nấu ngay.
6. Điểm/hủy: trả bằng điểm vẫn thưởng hạng; 0đ không miễn phí; dùng chung lượt; chờ hoàn; VNPay thiếu điểm thu hồi; ảnh cũ không xác nhận trạng thái hiện tại.
7. Hồ sơ/auth: hồ sơ khác đăng ký; lưu avatar khác lưu thông tin; OTP hết hạn/nhập sai; phiên kết thúc khác khóa tài khoản/khóa chat.
8. Lịch sử/kết quả/cài đặt/chat: tìm PDF hoặc ảnh hóa đơn; muốn sửa từ lịch sử; kết quả chưa xác nhận; công tắc ngôn ngữ vs lưu thông báo; ảnh/lịch sử theo ngày, xóa ảnh không xóa đơn.

Thử tiếp nối nhiều lượt và cách diễn đạt khác, cả hai ngôn ngữ, ảnh cắt, mobile và sáng/tối; không chỉ một câu mẫu đã ghi trong kiến thức.
