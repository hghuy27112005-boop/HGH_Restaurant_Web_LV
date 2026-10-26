# Quy tắc song ngữ (vi/en) cho dự án này

Dự án: Laravel (backend) + React Vite (frontend) + i18next. Web có hai ngôn ngữ, đổi ngôn ngữ không được làm hỏng chức năng hay để sót chữ.

## Quy tắc bắt buộc khi viết code mới
1. Chữ hiển thị MỚI trong frontend phải dùng t('key.ngan.gon') của react-i18next. Key viết bằng tiếng Anh, thêm đủ vào CẢ HAI file locale vi.js và en.js. KHÔNG tạo thêm lời gọi translatePageText mới, KHÔNG viết chuỗi tiếng Việt hoặc tiếng Anh cứng trong JSX, props (title, placeholder, confirmText, secondaryText, tertiaryText, label, alt, aria-label) hay trong setAlertMessage/setError/toast. Phần code cũ dùng translatePageText thì để yên, không tự ý đổi.
2. Logic, state, API, database chỉ dùng ID hoặc code ổn định (ingredient_id, slot_key, enum). TUYỆT ĐỐI không so sánh, khớp hay làm key bằng chuỗi hiển thị.
3. Tên nguyên liệu, tên món hiển thị phải tra theo ID rồi chọn name_vi/name_en theo ngôn ngữ hiện tại lúc render. Không lưu chuỗi đã dịch vào state gửi lên server.
4. State của toast/modal lưu code hoặc key (kèm params), KHÔNG lưu chuỗi đã dịch, để đổi ngôn ngữ khi đang mở vẫn đúng.
5. Backend: response lỗi hoặc thành công mới phải trả thêm trường `code` ổn định (ví dụ DISH_NAME_INVALID) bên cạnh `message`.
6. Dữ liệu người dùng nhập (tên công thức, ghi chú) giữ nguyên văn, không dịch.
7. Database: bảng có cột song ngữ thì tên Việt ghi vào cột _vi, tên Anh ghi vào cột Anh. Không ghi chuỗi Việt vào cột Anh.
8. Gemini chỉ được gọi từ backend. Mọi hàm gọi Gemini phải kiểm tra output đủ trường, đủ số mục.

## Quy trình làm việc
- Trước khi sửa file, liệt kê file sẽ sửa và lý do, chờ người dùng đồng ý. Không sửa file ngoài danh sách đã duyệt.
- Không chạy npm, migrate hay lệnh artisan ghi dữ liệu, trừ khi người dùng yêu cầu rõ.
- Không refactor ngoài phạm vi yêu cầu.
- Sau khi sửa, nhắc người dùng chạy `npm run check:i18n` (trong thư mục frontend) và báo kết quả mong đợi.
- Nếu không chắc một chuỗi đã có trong locale chưa, tìm trước, không tự thêm key trùng nghĩa.
- Không bịa. Không chắc thì nói rõ.
