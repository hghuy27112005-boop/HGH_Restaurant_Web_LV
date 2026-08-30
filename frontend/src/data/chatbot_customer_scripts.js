// =====================================================================
// KỊCH BẢN CHATBOT - PHÍA KHÁCH HÀNG
// - intentSummary: khung ý chính, gửi AI viết câu trả lời tự nhiên
// - options: lựa chọn tại bước đó (intent: ý nghĩa riêng, dùng để AI so khớp khi gõ tự do)
// - autoNext: tự động chuyển tiếp, không cần đợi người dùng
// - stepsList: danh sách bước cố định, KHÔNG qua AI, tự nối vào cuối tin nhắn
// =====================================================================

const chatbotCustomerScripts = {

  root: {
    intentSummary:
      "Chào khách, giới thiệu ngắn gọn có thể giúp gì, liệt kê các chức năng chính để khách chọn.",
    options: [
      { id: "order_food", label: "Đặt món", intent: "Khách muốn đặt món ăn, đặt bàn hoặc đặt ship" },
      {
        id: "view_history",
        label: "Xem lịch sử giao dịch",
        intent: "Khách muốn xem lại lịch sử các đơn hàng đã đặt, hoặc xem/xuất hóa đơn",
        action: { type: "navigate", path: "/orders" },
      },
      { id: "cancel_order", label: "Hủy đơn hàng", intent: "Khách muốn hủy 1 đơn hàng đã đặt" },
      {
        id: "view_profile",
        label: "Xem, sửa thông tin cá nhân",
        intent: "Khách muốn xem hoặc chỉnh sửa thông tin tài khoản cá nhân",
        action: { type: "navigate", path: "/profile" },
      },
      { id: "logout", label: "Đăng xuất", intent: "Khách muốn đăng xuất khỏi tài khoản" },
    ],
  },

  // ===================== LUỒNG ĐẶT MÓN =====================
  order_food: {
    intentSummary:
      "Khách muốn đặt món nhưng chưa nói rõ hình thức. Cần hỏi khách muốn đặt bàn tại quán hay đặt ship, giải thích nhà hàng có 2 hình thức đó.",
    options: [
      { id: "order_food.booking", label: "Đặt bàn tại quán", intent: "Khách muốn đặt bàn ăn tại quán" },
      { id: "order_food.delivery", label: "Đặt ship đồ ăn", intent: "Khách muốn đặt đồ ăn giao tận nơi, không tới quán" },
      { id: "root", label: "Quay lại menu chính", intent: "Khách muốn quay lại danh sách chức năng chính, không đặt món nữa" },
    ],
  },

  // ----------- Nhánh: Đặt bàn tại quán -----------
  "order_food.booking": {
    intentSummary:
      "Xác nhận khách chọn đặt bàn tại quán. Cho biết sẽ hướng dẫn lần lượt 2 bước: (1) qua trang menu để chọn món, (2) qua trang đặt bàn để hoàn tất.",
    autoNext: "order_food.booking.ask_menu_done",
  },

  "order_food.booking.ask_menu_done": {
    intentSummary:
      "Hỏi khách đã thực hiện bước chọn món ở trang menu hay chưa, để biết hướng dẫn tiếp từ bước nào.",
    options: [
      {
        id: "order_food.booking.goto_menu",
        label: "Chưa, đưa tôi qua trang menu",
        intent: "Khách chưa chọn món, chưa đặt món ở trang menu",
        action: { type: "navigate", path: "/menu" },
      },
      {
        id: "order_food.booking.goto_table",
        label: "Rồi, tôi đã chọn món xong",
        intent: "Khách đã chọn món xong ở trang menu rồi",
        action: { type: "navigate", path: "/bookings" },
      },
    ],
  },

  "order_food.booking.goto_menu": {
    intentSummary:
      "Khách chưa đặt món. Mời khách qua trang menu để chọn món, sau khi xong quay lại chat để tiếp tục hướng dẫn đặt bàn.",
    options: [
      {
        id: "order_food.booking.goto_table",
        label: "Tôi đã chọn món xong",
        intent: "Khách xác nhận đã hoàn tất chọn món ở trang menu",
        action: { type: "navigate", path: "/bookings" },
      },
    ],
  },

  "order_food.booking.goto_table": {
    intentSummary:
      "Xác nhận khách đã chọn món xong, đã đưa khách tới trang đặt bàn. Cho biết các bước tiếp theo sẽ được liệt kê ngay dưới đây.",
    stepsList: [
      "Chỉnh sửa số lượng của mỗi món nếu cần",
      "Chọn ngày giờ đến ăn",
      "Chọn (các) bàn bạn muốn đặt",
      "Xác nhận thông tin đặt bàn",
      "Thanh toán",
    ],
    afterNote: "Sau khi thanh toán xong, bạn có thể hủy đơn đặt bàn nếu cần.",
    options: [
      { id: "root", label: "Quay lại menu chính", intent: "Khách muốn quay lại danh sách chức năng chính" },
    ],
  },

  // ----------- Nhánh: Đặt ship -----------
  "order_food.delivery": {
    intentSummary:
      "Xác nhận khách chọn đặt ship đồ ăn. Cho biết sẽ hướng dẫn lần lượt 2 bước: (1) qua trang menu để chọn món, (2) qua trang đặt ship để hoàn tất.",
    autoNext: "order_food.delivery.ask_menu_done",
  },

  "order_food.delivery.ask_menu_done": {
    intentSummary:
      "Hỏi khách đã thực hiện bước chọn món ở trang menu hay chưa, để biết hướng dẫn tiếp từ bước nào.",
    options: [
      {
        id: "order_food.delivery.goto_menu",
        label: "Chưa, đưa tôi qua trang menu",
        intent: "Khách chưa chọn món, chưa đặt món ở trang menu",
        action: { type: "navigate", path: "/menu" },
      },
      {
        id: "order_food.delivery.goto_delivery",
        label: "Rồi, tôi đã chọn món xong",
        intent: "Khách đã chọn món xong ở trang menu rồi",
        action: { type: "navigate", path: "/deliveries" },
      },
    ],
  },

  "order_food.delivery.goto_menu": {
    intentSummary:
      "Khách chưa đặt món. Mời khách qua trang menu để chọn món, sau khi xong quay lại chat để tiếp tục hướng dẫn đặt ship.",
    options: [
      {
        id: "order_food.delivery.goto_delivery",
        label: "Tôi đã chọn món xong",
        intent: "Khách xác nhận đã hoàn tất chọn món ở trang menu",
        action: { type: "navigate", path: "/deliveries" },
      },
    ],
  },

  "order_food.delivery.goto_delivery": {
    intentSummary:
      "Xác nhận khách đã chọn món xong, đã đưa khách tới trang đặt ship. Cho biết các bước tiếp theo sẽ được liệt kê ngay dưới đây.",
    stepsList: [
      "Chỉnh sửa số lượng của mỗi món nếu cần",
      "Nhập địa chỉ giao hàng",
      "Xác nhận thông tin đặt hàng",
      "Thanh toán",
    ],
    afterNote: "Sau khi thanh toán xong, bạn có thể hủy đơn hàng, hoặc chờ nhà hàng duyệt và giao hàng đến.",
    options: [
      { id: "root", label: "Quay lại menu chính", intent: "Khách muốn quay lại danh sách chức năng chính" },
    ],
  },

  // ===================== CÁC CHỨC NĂNG KHÁC =====================
  view_history: {
    intentSummary:
      "Đã đưa khách tới trang lịch sử giao dịch. Cho khách biết ở đây có thể xem lại tất cả đơn hàng đã đặt, đồng thời xem và xuất hóa đơn PDF cho từng đơn.",
    options: [
      { id: "root", label: "Quay lại menu chính", intent: "Khách muốn quay lại danh sách chức năng chính" },
    ],
  },

  cancel_order: {
    intentSummary:
      "Khách muốn hủy đơn hàng nhưng chưa nói rõ là đơn đặt bàn hay đơn đặt ship. Cần hỏi rõ khách muốn hủy đơn nào.",
    options: [
      {
        id: "cancel_order.booking",
        label: "Hủy đơn đặt bàn",
        intent: "Khách muốn hủy đơn đặt bàn tại quán",
        action: { type: "navigate", path: "/bookings" },
      },
      {
        id: "cancel_order.delivery",
        label: "Hủy đơn đặt ship",
        intent: "Khách muốn hủy đơn đặt ship đồ ăn",
        action: { type: "navigate", path: "/deliveries" },
      },
      { id: "root", label: "Quay lại menu chính", intent: "Khách muốn quay lại danh sách chức năng chính, không hủy đơn nữa" },
    ],
  },

  "cancel_order.booking": {
    intentSummary:
      "Đã đưa khách tới trang đặt bàn để tìm đơn cần hủy. Nhắc khách rằng sau khi thanh toán, mỗi đơn hàng sẽ có mã hóa đơn riêng, khách nên chụp lại màn hình sau mỗi giao dịch để dễ tra cứu, tìm đúng đơn cần hủy bằng mã hóa đơn đó.",
    options: [
      { id: "root", label: "Quay lại menu chính", intent: "Khách muốn quay lại danh sách chức năng chính" },
    ],
  },

  "cancel_order.delivery": {
    intentSummary:
      "Đã đưa khách tới trang đặt ship để tìm đơn cần hủy. Nhắc khách rằng sau khi thanh toán, mỗi đơn hàng sẽ có mã hóa đơn riêng, khách nên chụp lại màn hình sau mỗi giao dịch để dễ tra cứu, tìm đúng đơn cần hủy bằng mã hóa đơn đó.",
    options: [
      { id: "root", label: "Quay lại menu chính", intent: "Khách muốn quay lại danh sách chức năng chính" },
    ],
  },

  view_profile: {
    intentSummary:
      "Đã đưa khách tới trang cá nhân. Cho khách biết ngoài việc xem các thông tin cơ bản, khách cũng có thể xem điểm tích lũy và bậc thành viên hiện tại ngay ở trang này.",
    options: [
      { id: "root", label: "Quay lại menu chính", intent: "Khách muốn quay lại danh sách chức năng chính" },
    ],
  },

  logout: {
    intentSummary: "Xác nhận khách muốn đăng xuất khỏi tài khoản.",
    options: [
      { id: "root", label: "Không, quay lại menu chính", intent: "Khách đổi ý, không muốn đăng xuất nữa" },
      { id: "logout.confirm", label: "Đồng ý đăng xuất", intent: "Khách xác nhận chắc chắn muốn đăng xuất", action: { type: "logout" } },
    ],
  },
  "logout.confirm": {
    intentSummary: "Đã đăng xuất thành công, tạm biệt khách.",
    options: [],
  },
};

export default chatbotCustomerScripts;