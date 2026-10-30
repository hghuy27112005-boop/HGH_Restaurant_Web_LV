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
      { id: "order_food", labelKey: "chatbot.options.orderFood", intent: "Khách muốn đặt món ăn, đặt bàn hoặc đặt ship" },
      {
        id: "modify_dish",
        labelKey: "chatbot.options.modifyDish",
        intent: "Khách muốn biết cách bỏ bớt nguyên liệu không thích để tạo công thức riêng cho món ăn",
      },
      {
        id: "view_history",
        labelKey: "chatbot.options.viewHistory",
        intent: "Khách muốn xem lại lịch sử các đơn hàng đã đặt, hoặc xem/xuất hóa đơn",
        action: { type: "navigate", path: "/profile/orders" },
      },
      { id: "cancel_order", labelKey: "chatbot.options.cancelOrder", intent: "Khách muốn hủy 1 đơn hàng đã đặt" },
      {
        id: "view_profile",
        labelKey: "chatbot.options.viewProfile",
        intent: "Khách muốn xem hoặc chỉnh sửa thông tin tài khoản cá nhân",
        action: { type: "navigate", path: "/profile" },
      },
      { id: "logout", labelKey: "chatbot.options.logout", intent: "Khách muốn đăng xuất khỏi tài khoản" },
    ],
  },

  modify_dish: {
    intentSummary:
      "Giải thích cho khách: tại trang chi tiết mỗi món ăn, khách có thể bỏ những nguyên liệu không thích để tạo một công thức riêng cho món đó, đặt tên và lưu lại. Công thức đã lưu có thể chọn dùng lại ở những lần đặt món sau mà không cần chỉnh lại từ đầu.",
    options: [
      {
        id: "modify_dish.goto_menu",
        labelKey: "chatbot.options.gotoMenuTry",
        intent: "Khách muốn qua trang menu để bắt đầu tạo công thức riêng",
        action: { type: "navigate", path: "/menu" },
      },
      { id: "root", labelKey: "chatbot.options.backToRoot", intent: "Khách muốn quay lại danh sách chức năng chính" },
    ],
  },

  "modify_dish.goto_menu": {
    intentSummary:
      "Đã đưa khách tới trang thực đơn. Hướng dẫn khách chọn một món bất kỳ, mở trang chi tiết món đó, sau đó nhấn vào mục xem công thức thay thế để bắt đầu bỏ nguyên liệu và lưu công thức riêng.",
    options: [
      { id: "root", labelKey: "chatbot.options.backToRoot", intent: "Khách muốn quay lại danh sách chức năng chính" },
    ],
  },

  // ===================== LUỒNG ĐẶT MÓN =====================
  order_food: {
    intentSummary:
      "Khách muốn đặt món nhưng chưa nói rõ hình thức. Cần hỏi khách muốn đặt bàn tại quán hay đặt ship, giải thích nhà hàng có 2 hình thức đó. Khách có thể chọn món nhanh ngay trên trang Menu, hoặc mở trang chi tiết món để xem thông tin cụ thể trước khi đặt. Tại trang chi tiết món, khách cũng có thể tạo và lưu một công thức mới để dùng lại trong những lần đặt sau.",
    options: [
      { id: "order_food.booking", labelKey: "chatbot.options.orderBooking", intent: "Khách muốn đặt bàn ăn tại quán" },
      { id: "order_food.delivery", labelKey: "chatbot.options.orderDelivery", intent: "Khách muốn đặt đồ ăn giao tận nơi, không tới quán" },
      { id: "root", labelKey: "chatbot.options.backToRoot", intent: "Khách muốn quay lại danh sách chức năng chính, không đặt món nữa" },
    ],
  },

  // ----------- Nhánh: Đặt bàn tại quán -----------
  "order_food.booking": {
    intentSummary:
      "Xác nhận khách chọn đặt bàn tại quán. Cho biết sẽ hướng dẫn lần lượt 2 bước: (1) qua trang menu để chọn món, (2) qua trang đặt bàn để hoàn tất. Khi chọn món, khách có thể bỏ các nguyên liệu không thích và lưu thành công thức thay thế để dùng lại ở những lần đặt sau.",
    autoNext: "order_food.booking.ask_menu_done",
  },

  "order_food.booking.ask_menu_done": {
    intentSummary:
      "Hỏi khách đã thực hiện bước chọn món ở trang menu hay chưa, để biết hướng dẫn tiếp từ bước nào.",
    options: [
      {
        id: "order_food.booking.goto_menu",
        labelKey: "chatbot.options.notYetGoMenu",
        intent: "Khách chưa chọn món, chưa đặt món ở trang menu",
        action: { type: "navigate", path: "/menu" },
      },
      {
        id: "order_food.booking.goto_table",
        labelKey: "chatbot.options.doneChoosing",
        intent: "Khách đã chọn món xong ở trang menu rồi",
        action: { type: "navigate", path: "/cart/bookings" },
      },
    ],
  },

  "order_food.booking.goto_menu": {
    intentSummary:
      "Khách chưa đặt món. Mời khách qua trang Menu để chọn món nhanh hoặc mở trang chi tiết từng món để xem thông tin cụ thể. Tại trang chi tiết, khách có thể tạo và lưu công thức mới cho món để dùng lại ở những lần đặt sau. Sau khi chọn món xong, khách quay lại chat để tiếp tục hướng dẫn đặt bàn.",
    options: [
      {
        id: "order_food.booking.goto_table",
        labelKey: "chatbot.options.doneChoosingShort",
        intent: "Khách xác nhận đã hoàn tất chọn món ở trang menu",
        action: { type: "navigate", path: "/cart/bookings" },
      },
    ],
  },

  "order_food.booking.goto_table": {
    intentSummary:
      "Xác nhận khách đã chọn món xong, đã đưa khách tới trang đặt bàn. Cho biết các bước tiếp theo sẽ được liệt kê ngay dưới đây.",
    stepsKeys: [
      "chatbot.script.stepEditQty",
      "chatbot.script.stepPickDateTime",
      "chatbot.script.stepPickTables",
      "chatbot.script.stepConfirmBooking",
      "chatbot.script.stepPay",
    ],
    afterNoteKey: "chatbot.script.afterBooking",
    options: [
      { id: "root", labelKey: "chatbot.options.backToRoot", intent: "Khách muốn quay lại danh sách chức năng chính" },
    ],
  },

  // ----------- Nhánh: Đặt ship -----------
  "order_food.delivery": {
    intentSummary:
      "Xác nhận khách chọn đặt ship đồ ăn. Cho biết sẽ hướng dẫn lần lượt 2 bước: (1) qua trang menu để chọn món, (2) qua trang đặt ship để hoàn tất. Khi chọn món, khách có thể bỏ các nguyên liệu không thích và lưu thành công thức thay thế để dùng lại ở những lần đặt sau.",
    autoNext: "order_food.delivery.ask_menu_done",
  },

  "order_food.delivery.ask_menu_done": {
    intentSummary:
      "Hỏi khách đã thực hiện bước chọn món ở trang menu hay chưa, để biết hướng dẫn tiếp từ bước nào.",
    options: [
      {
        id: "order_food.delivery.goto_menu",
        labelKey: "chatbot.options.notYetGoMenu",
        intent: "Khách chưa chọn món, chưa đặt món ở trang menu",
        action: { type: "navigate", path: "/menu" },
      },
      {
        id: "order_food.delivery.goto_delivery",
        labelKey: "chatbot.options.doneChoosing",
        intent: "Khách đã chọn món xong ở trang menu rồi",
        action: { type: "navigate", path: "/cart/deliveries" },
      },
    ],
  },

  "order_food.delivery.goto_menu": {
    intentSummary:
      "Khách chưa đặt món. Mời khách qua trang Menu để chọn món nhanh hoặc mở trang chi tiết từng món để xem thông tin cụ thể. Tại trang chi tiết, khách có thể tạo và lưu công thức mới cho món để dùng lại ở những lần đặt sau. Sau khi chọn món xong, khách quay lại chat để tiếp tục hướng dẫn đặt ship.",
    options: [
      {
        id: "order_food.delivery.goto_delivery",
        labelKey: "chatbot.options.doneChoosingShort",
        intent: "Khách xác nhận đã hoàn tất chọn món ở trang menu",
        action: { type: "navigate", path: "/cart/deliveries" },
      },
    ],
  },

  "order_food.delivery.goto_delivery": {
    intentSummary:
      "Xác nhận khách đã chọn món xong, đã đưa khách tới trang đặt ship. Liệt kê lần lượt các bước.",
    stepsKeys: [
      "chatbot.script.stepEditQty",
      "chatbot.script.stepAddress",
      "chatbot.script.stepPickDeliveryTime",
      "chatbot.script.stepConfirmDelivery",
      "chatbot.script.stepPay",
    ],
    afterNoteKey: "chatbot.script.afterDelivery",
    options: [
      { id: "root", labelKey: "chatbot.options.backToRoot", intent: "Khách muốn quay lại danh sách chức năng chính" },
    ],
  },

  // ===================== CÁC CHỨC NĂNG KHÁC =====================
  view_history: {
    intentSummary:
      "Đã đưa khách tới mục Lịch sử giao dịch trong trang cá nhân. Cho khách biết ở đây có thể xem lại tất cả đơn hàng đã đặt, đồng thời xem và xuất hóa đơn PDF cho từng đơn.",
    options: [
      { id: "root", labelKey: "chatbot.options.backToRoot", intent: "Khách muốn quay lại danh sách chức năng chính" },
    ],
  },

  cancel_order: {
    intentSummary:
      "Khách muốn hủy đơn hàng nhưng chưa nói rõ là đơn đặt bàn hay đơn đặt ship. Cần hỏi rõ khách muốn hủy đơn nào.",
    options: [
      {
        id: "cancel_order.booking",
        labelKey: "chatbot.options.cancelBooking",
        intent: "Khách muốn hủy đơn đặt bàn tại quán",
        action: { type: "navigate", path: "/cart/bookings" },
      },
      {
        id: "cancel_order.delivery",
        labelKey: "chatbot.options.cancelDelivery",
        intent: "Khách muốn hủy đơn đặt ship đồ ăn",
        action: { type: "navigate", path: "/cart/deliveries" },
      },
      { id: "root", labelKey: "chatbot.options.backToRoot", intent: "Khách muốn quay lại danh sách chức năng chính, không hủy đơn nữa" },
    ],
  },

  "cancel_order.booking": {
    intentSummary:
      "Đã đưa khách tới trang đặt bàn để tìm đơn cần hủy. Nhắc khách rằng sau khi thanh toán, mỗi đơn hàng sẽ có mã hóa đơn riêng, khách nên chụp lại màn hình sau mỗi giao dịch để dễ tra cứu, tìm đúng đơn cần hủy bằng mã hóa đơn đó.",
    options: [
      { id: "root", labelKey: "chatbot.options.backToRoot", intent: "Khách muốn quay lại danh sách chức năng chính" },
    ],
  },

  "cancel_order.delivery": {
    intentSummary:
      "Đã đưa khách tới trang đặt ship để tìm đơn cần hủy. Nhắc khách rằng sau khi thanh toán, mỗi đơn hàng sẽ có mã hóa đơn riêng, khách nên chụp lại màn hình sau mỗi giao dịch để dễ tra cứu, tìm đúng đơn cần hủy bằng mã hóa đơn đó.",
    options: [
      { id: "root", labelKey: "chatbot.options.backToRoot", intent: "Khách muốn quay lại danh sách chức năng chính" },
    ],
  },

  view_profile: {
    intentSummary:
      "Đã đưa khách tới trang cá nhân. Cho khách biết ngoài việc xem các thông tin cơ bản, khách cũng có thể xem điểm tích lũy và bậc thành viên hiện tại ngay ở trang này, và chuyển sang các mục Lịch sử giao dịch, Đánh giá dịch vụ.",
    options: [
      { id: "root", labelKey: "chatbot.options.backToRoot", intent: "Khách muốn quay lại danh sách chức năng chính" },
    ],
  },

  logout: {
    intentSummary: "Xác nhận khách muốn đăng xuất khỏi tài khoản.",
    options: [
      { id: "root", labelKey: "chatbot.options.noBackToRoot", intent: "Khách đổi ý, không muốn đăng xuất nữa" },
      { id: "logout.confirm", labelKey: "chatbot.options.confirmLogout", intent: "Khách xác nhận chắc chắn muốn đăng xuất", action: { type: "logout" } },
    ],
  },
  "logout.confirm": {
    intentSummary: "Đã đăng xuất thành công, tạm biệt khách.",
    options: [],
  },
};

export default chatbotCustomerScripts;