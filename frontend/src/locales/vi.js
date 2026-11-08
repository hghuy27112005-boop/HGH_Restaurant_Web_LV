const vi = {
    common: {
        close: 'Đóng',
        closeMenu: 'Đóng menu',
        openMenu: 'Mở menu',
        restaurantName: 'NHÀ HÀNG HGH',
        allRightsReserved: 'Mọi quyền được bảo lưu.',
        homeTagline: 'Hương vị cơm gia đình thuần túy',
        viewMenu: 'Xem thực đơn',
        aboutRestaurant: 'Về Nhà Hàng HGH',
        home: 'Trang chủ',
        dateLabel: 'Ngày:',
        menu: 'Thực đơn',
        cart: 'Giỏ hàng',
        login: 'Đăng nhập/Đăng ký',
        loginShort: 'Đăng nhập',
        settings: 'Cài đặt',
        notifications: 'Thông báo',
        profile: 'Trang cá nhân của {{name}}',
        admin: 'Quản trị viên',
        user: 'Người dùng',
        guest: 'Khách',
    },
    apiErrors: {
        serverError: 'Đã xảy ra lỗi. Vui lòng thử lại.',
        bookingConflictCheckFailed: 'Không thể kiểm tra tình trạng bàn. Vui lòng thử lại.',
        tableAvailabilityCheckFailed: 'Không thể tải danh sách bàn trống. Vui lòng thử lại.',
        bookingRequestFailed: 'Không thể xử lý yêu cầu đặt bàn. Vui lòng thử lại.',
        deliveryRequestFailed: 'Không thể xử lý yêu cầu giao hàng. Vui lòng thử lại.',
        orderRequestFailed: 'Không thể xử lý đơn hàng. Vui lòng thử lại.',
        notificationEmailFailed: 'Không thể gửi email. Vui lòng thử lại.',
        invalidFilter: 'Có bộ lọc không hợp lệ.',
        tableOccupied: 'Bàn vừa được đặt. Vui lòng chọn bàn hoặc thời gian khác.',
        stockUnavailable: 'Một số nguyên liệu không khả dụng. Vui lòng kiểm tra giỏ hàng rồi thử lại.',
        deliveryRouteUnavailable: 'Không thể tính tuyến giao hàng. Vui lòng kiểm tra địa chỉ rồi thử lại.',
    },
    navigation: {
        dashboard: 'Bảng điều khiển',
        events: 'Quản lý sự kiện',
        users: 'Quản lý người dùng',
        stocks: 'Quản lý kho hàng',
        dishes: 'Quản lý thực đơn',
        orders: 'Quản lý đơn hàng',
    },
    settings: {
        light: 'Sáng',
        dark: 'Tối',
        language: 'Ngôn ngữ',
        vietnamese: 'Việt',
        english: 'Anh',
        notifications: 'Cài đặt thông báo',
        bookingReminder: 'Nhắc đặt bàn',
        deliveryPreparing: 'Đơn giao hàng đang chuẩn bị',
        accountLocked: 'Tài khoản bị khóa',
        accountUnlocked: 'Tài khoản được mở khóa',
        inApp: 'Trên website',
        email: 'Email',
        loading: 'Đang tải cài đặt...',
        save: 'Lưu cài đặt',
        saving: 'Đang lưu...',
        loadError: 'Không thể tải cài đặt thông báo.',
        saveError: 'Không thể lưu cài đặt thông báo.',
        languageSaveError: 'Không thể lưu tùy chọn ngôn ngữ vào tài khoản.',
    },
    notifications: {
        unreadCount: 'Thông báo, {{count}} chưa đọc',
        close: 'Đóng thông báo',
        markAllRead: 'Đánh dấu đã đọc',
        loading: 'Đang tải thông báo...',
        empty: 'Bạn chưa có thông báo nào.',
        unread: 'Chưa đọc',
        loadError: 'Không thể tải thông báo.',
        markReadError: 'Không thể cập nhật trạng thái thông báo.',
        markAllReadError: 'Không thể đánh dấu đã đọc.',
    },
    menuRecommend: {
        optionLabel: "🎯 Đề xuất theo tên món",
        chooseFavorites: "Chọn món yêu thích",
        reset: "Đặt lại",
        confirm: "Xác nhận",
        selectedTitle: "Món yêu thích đã chọn",
        resultsTitle: "Các món đề xuất",
        intro: "Chọn tối đa 3 món yêu thích để nhận tối đa 6 món đề xuất phù hợp từ thực đơn đang bán.",
        selectionHelp: "Chọn từ 1 đến 3 món yêu thích. Các món được chọn sẽ không lặp lại trong danh sách đề xuất.",
        selectedCount: "Đã chọn {{count}}/3 món",
        searching: "Đang tìm món phù hợp...",
        loadingMenu: "Đang tải các món đang bán...",
        emptyMenu: "Hiện chưa có món ăn đang bán.",
        emptyResults: "Chưa có món khác đủ phù hợp với lựa chọn của bạn. Bạn có thể chọn lại món yêu thích.",
        errorMenu: "Không thể tải thực đơn. Vui lòng đóng và mở lại để thử lại.",
        errorSelection: "Một món đã chọn không còn được bán hoặc lựa chọn không hợp lệ. Vui lòng đóng và chọn lại.",
        errorUnavailable: "Không thể gợi ý món lúc này. Vui lòng thử lại.",
        errorGeneric: "Không thể tải gợi ý món ăn. Vui lòng thử lại.",
        orderDelivery: "Đặt Ship",
        orderBooking: "Đặt Bàn",
    },
    chatbot: {
        visualUploading: "Đang gửi ảnh và tin nhắn…",
        visualReading: "Đã gửi. Tôi đang xem ảnh và câu hỏi của bạn…",
        visualReplyFailed: "Ảnh đã được lưu nhưng chưa nhận được trả lời. Bạn có thể bấm Gửi lại, không cần tải ảnh lần nữa.",
        visualUploadFailed: "Chưa gửi xong lượt này. Ảnh và lời nhắn vẫn được giữ ở đây để bạn gửi lại.",
        retrySend: "Gửi lại",
        imageDeleteFailed: "Chưa thể xóa ảnh. Bạn vui lòng thử lại.",
        imageNone: "Chưa có hình ảnh đã gửi.",
        imageDelete: "Xóa hình ảnh",
        imageBack: "Quay lại",
        imageDeleteShort: "Xóa",
        imageConfirmCount: "Chắc chắn xóa {{count}} ảnh?",
        imageDeleteWarning: "Các file ảnh này sẽ bị xóa vĩnh viễn. Đơn hàng vẫn được giữ lại.",
        imageClose: "Đóng",
        imageDeleting: "Đang xóa…",
        imageConfirm: "Xác nhận",
        imageDeleteOne: "Xóa {{filename}}",
        imageDeselect: "Bỏ chọn {{filename}}",
        imageSelect: "Chọn {{filename}}",
        visualUnavailable: 'Tôi chưa mở được ảnh này. Bạn chọn lại ảnh hoặc chụp lại phần cần hỗ trợ rồi gửi nhé.',
        textSendErrorTitle: 'Không thể gửi tin nhắn',
        textSendFailed: 'Không thể gửi tin nhắn. Vui lòng thử lại.',
        processingImages: 'Đang xử lý hình ảnh...',
        dropTitle: 'Thả ảnh vào đây',
        contentSuspended: 'Chatbot và đánh giá bị khóa đến hết hôm nay do vi phạm quy tắc nội dung hai lần.',
        dropImages: 'Thả tối đa 5 ảnh vào đây (JPG, PNG, WebP; 10 MB/ảnh).', saveInvoice: 'Lưu hóa đơn', savePdf: 'Lưu pdf hóa đơn', saveChat: 'Lưu ảnh vào chat', savingInvoice: 'Đang lưu…', invoiceFailed: 'Không thể lưu hóa đơn. Vui lòng thử lại.',
        script: {
            stepLabel: 'Bước {{n}}: {{text}}',
            stepEditQty: 'Chỉnh sửa số lượng của mỗi món nếu cần',
            stepPickDateTime: 'Chọn ngày giờ đến ăn',
            stepPickTables: 'Chọn (các) bàn bạn muốn đặt',
            stepConfirmBooking: 'Xác nhận thông tin đặt bàn',
            stepPay: 'Thanh toán',
            stepAddress: 'Nhập địa chỉ giao hàng',
            stepPickDeliveryTime: 'Chọn giờ hàng tới nếu muốn (giờ sau 22:00 sẽ bắt đầu chuẩn bị lúc 07:30 sáng hôm sau)',
            stepConfirmDelivery: 'Xác nhận thông tin đặt hàng',
            afterBooking: 'Sau khi thanh toán xong, bạn có thể hủy đơn đặt bàn nếu cần.',
            afterDelivery: 'Nhà hàng sẽ bắt đầu giao hàng cho bạn sau khi chuẩn bị xong món ăn.',
            autoHint: 'Trả lời bằng tiếng Việt.',
        },
        historyToday: 'Đoạn chat hôm nay',
        historyDate: 'Đoạn chat ngày {{date}}',
        historyOptionsAria: 'Tùy chọn {{label}}',
        imagesToday: 'Hình ảnh hôm nay',
        imagesDate: 'Hình ảnh ngày {{date}}',
        imageLibraryFallback: 'Ảnh trong thư viện',
        imagePendingLabel: 'Ảnh chờ gửi {{n}}',
        imagePreviewAria: 'Xem ảnh {{filename}}',
        pendingImageAria: 'Xem ảnh chờ gửi {{n}}',
        imageViewAria: 'Xem {{label}} {{n}}',
        imageUploadFailed: 'Không thể lưu hình ảnh. Vui lòng thử lại.',
        nav: {
            addressMap: 'Mở bản đồ tìm địa chỉ',
            menu: 'Tới trang thực đơn',
            dishDetail: 'Xem chi tiết món',
            orders: 'Xem lịch sử giao dịch',
            profile: 'Tới trang cá nhân',
            related: 'Tới trang liên quan',
        },
        options: {
            orderFood: 'Đặt món',
            modifyDish: 'Sửa đổi món ăn',
            viewHistory: 'Xem lịch sử giao dịch',
            cancelOrder: 'Hủy đơn hàng',
            viewProfile: 'Xem, sửa thông tin cá nhân',
            logout: 'Đăng xuất',
            gotoMenuTry: 'Đi tới thực đơn để thử',
            backToRoot: 'Quay lại menu chính',
            orderBooking: 'Đặt bàn tại quán',
            orderDelivery: 'Đặt ship đồ ăn',
            notYetGoMenu: 'Chưa, đưa tôi qua trang menu',
            doneChoosing: 'Rồi, tôi đã chọn món xong',
            doneChoosingShort: 'Tôi đã chọn món xong',
            cancelBooking: 'Hủy đơn đặt bàn',
            cancelDelivery: 'Hủy đơn đặt ship',
            noBackToRoot: 'Không, quay lại menu chính',
            confirmLogout: 'Đồng ý đăng xuất',
        },
    },
    adminDish: {
        addIngredient: "Thêm nguyên liệu",
        removeIngredient: "Xóa dòng nguyên liệu {{count}}",
        emptyIngredient: "Vui lòng nhập tên cho tất cả các dòng nguyên liệu.",
        fixedCostPerServing: "Chi phí nguyên liệu cố định / phần (đ)",
        fixedCostPerServingAria: "Chi phí nguyên liệu cố định mỗi phần (đồng)",
        quantityCategoryAria: "Phân loại định lượng",
        quantityUnitAria: "Đơn vị định lượng",
        costPerUnitAria: "Giá nhập mỗi đơn vị (đồng)",
        costPerUnitPlaceholder: "Giá / đơn vị (đ)",
        quantityStepAria: "Bước định lượng",
        quantityStepPlaceholder: "Bước",
        quantityMinimumAria: "Định lượng tối thiểu đã duyệt mỗi phần",
        quantityMinimumPlaceholder: "Tối thiểu / phần",
        quantityMaximumAria: "Định lượng tối đa đã duyệt mỗi phần",
        quantityMaximumPlaceholder: "Tối đa / phần",
        quantityRangeHelp: "Các mức không giảm khi giá tăng; một nguyên liệu có thể giữ nguyên nếu bước tăng vượt ngân sách. Khoảng cần đủ ít nhất một bước tăng.",
        noVariableIngredientsNote: "Món này chưa có nguyên liệu biến đổi; cả ba mức giá sẽ dùng cùng định lượng. Chọn “Thành phần chính khác” nếu muốn thay đổi một nguyên liệu khác theo giá.",
        quantitySettingsIncomplete: "Kiểm tra đơn giá, bước tăng và khoảng tối thiểu/tối đa của từng nguyên liệu biến đổi; khoảng cần đủ ít nhất một bước tăng.",
        completeFieldsBeforeSave: "Vui lòng điền đủ thông tin món, nguyên liệu, khoảng định lượng và công thức trước khi lưu.",
        aiUnavailable: "Gemini đang bận hoặc phản hồi quá chậm. Vui lòng thử lại; bạn vẫn có thể nhập và chỉnh nguyên liệu thủ công.",

        titleDetail: 'Chi tiết món ăn',
        titleNew: 'Thêm món ăn mới',
        labelNameFixed: 'Tên món (không thể thay đổi)',
        labelName: 'Tên món',
        labelType: 'Loại món',
        selectType: '-- Chọn loại món --',
        labelPrice: 'Giá thành',
        labelImage: 'Hình ảnh',
        labelIngredients: 'Nguyên liệu',
        labelRecipe: 'Công thức nấu',
        btnAnalyze: 'Nhận nguyên liệu',
        btnAnalyzing: 'Đang nhận nguyên liệu...',
        btnConfirm: 'Xác nhận nguyên liệu',
        btnConfirming: 'Đang xác nhận nguyên liệu và tạo công thức...',
        confirmedNote: 'Đã xác nhận nguyên liệu; nguyên liệu sẽ vào kho khi lưu món ăn.',
        ingredientNameVi: 'Tên nguyên liệu tiếng Việt',
        ingredientNameEn: 'Tên nguyên liệu tiếng Anh',
        ingredientRole: 'Phân loại nguyên liệu',
        roleReplaceable: 'Bắt buộc, có thể thay thế',
        roleFixed: 'Bắt buộc, không thể thay thế',
        roleOptional: 'Có thể bỏ',
        noRecipe: 'Chưa có công thức nấu',
        btnBack: 'Quay lại',
        btnEdit: 'Chỉnh sửa',
        btnSaving: 'Đang lưu...',
        btnSaveChanges: 'Lưu thay đổi',
        btnClose: 'Đóng',
        btnCancel: 'Hủy',
        btnCreating: 'Đang tạo phiên bản còn lại của món ăn',
        btnCreate: 'Tạo món',
        placeholderNameEn: 'Nhập tên món bằng tiếng Anh',
        placeholderNameVi: 'Nhập tên món bằng tiếng Việt',
        ingredientsHintEdit: 'Nhấn nhận nguyên liệu để cập nhật danh sách theo tên và hình món',
        ingredientsHintNew: 'Vui lòng điền tên và tải ảnh lên để lấy nguyên liệu',
        recipeHintEdit: 'Xác nhận nguyên liệu để tạo công thức mới',
        recipeHintNew: 'Xác nhận nguyên liệu để tạo công thức',
        recipeAria: 'Xác nhận nguyên liệu để tạo công thức',
        errImageInvalid: 'Vui lòng chọn một file ảnh hợp lệ!',
        errImageConvert: 'Không thể chuyển hình ảnh sang định dạng JPG. Vui lòng chọn ảnh khác.',
        errNeedImage: 'Vui lòng tải lên một hình ảnh!',
        errNeedConfirm: 'Vui lòng nhận, xác nhận nguyên liệu và tạo công thức trước khi lưu món.',
        errNeedTieredRecipe: 'Vui lòng tạo, kiểm tra và duyệt công thức cùng định lượng cho ba mức giá trước khi lưu.',
        errNeedReconfirm: 'Vui lòng nhận và xác nhận lại nguyên liệu để tạo công thức trước khi lưu.',
        errNeedNameAndImage: 'Vui lòng nhập tên món và tải hình ảnh trước.',
        nameInvalid: 'Tên món sai chính tả, không hợp lệ hoặc không đúng ngôn ngữ đang chọn. Vui lòng kiểm tra lại tên món.',
        nameDuplicate: 'Đã có món ăn trùng tên này.',
        imageRejected: 'Hình ảnh không phù hợp. Vui lòng chọn hình khác.',
        translationUnavailable: 'Hiện chưa thể dịch. Món ăn chưa được lưu; vui lòng thử lại.',
        saveFailed: 'Không thể lưu món ăn. Vui lòng thử lại.',
        analyzeFailed: 'Không thể nhận diện nguyên liệu. Vui lòng thử lại.',
        confirmFailed: 'Không thể xác nhận nguyên liệu hoặc tạo công thức. Vui lòng thử lại.',
        updated: 'Cập nhật món ăn thành công!',
        created: 'Thêm món ăn thành công!',
        confirmHide: 'Ẩn món "{{dish}}" khỏi thực đơn?',
        confirmShow: 'Hiện món "{{dish}}" trong thực đơn?',
        confirmDelete: 'Xóa vĩnh viễn món này khỏi hệ thống?',
        hidden: 'Đã ẩn món ăn thành công.',
        shown: 'Đã hiện món ăn thành công.',
        deleted: 'Đã xóa món ăn thành công!',
        statusUpdateFailed: 'Không thể cập nhật trạng thái món ăn. Vui lòng thử lại.',
        deleteFailed: 'Không thể xóa món ăn. Vui lòng thử lại.',
        deleteNotFound: 'Không tìm thấy món ăn này.',
        deleteHasOrders: 'Không thể xóa món ăn vì món đã có đơn hàng.',
        deleteReferenced: 'Món ăn vẫn đang được tham chiếu nên không thể xóa.',
    },
    adminStock: {
        restockNeeded: 'Cần nhập thêm hàng',
        loadError: 'Lỗi tải kho hàng: {{details}}',
        historyError: 'Lỗi tải lịch sử nguyên liệu: {{details}}',
    },
    booking: {
        tableCountMismatch: 'Vui lòng chọn đúng {{required}} bàn. Bạn đang chọn {{selected}} bàn.',
        tableCountMissing: 'Vui lòng chọn đủ {{required}} bàn.',
        tableLimit_other: 'Bạn chỉ được chọn tối đa {{count}} bàn.',
        tableLimit_one: 'Bạn chỉ được chọn tối đa {{count}} bàn.',
        tableTypeLimit_other: 'Bạn chỉ được chọn tối đa {{count}} bàn loại {{tableType}}.',
        tableTypeLimit_one: 'Bạn chỉ được chọn tối đa {{count}} bàn loại {{tableType}}.',
        tableTypeSmall: 'nhỏ',
        tableTypeMedium: 'vừa',
        tableTypeLarge: 'lớn',
    },
    orders: {
        total: 'Tổng cộng:',
        exportingPdf: 'Đang xuất PDF...',
        pointsLoadError: 'Không thể lấy thông tin điểm: {{details}}',
        noOrdersWithStatus: 'Chưa có đơn với trạng thái "{{status}}"',
        modifyBookingSuccess_other: 'Chỉnh sửa đơn đặt bàn thành công. Bạn còn {{remaining}} lượt chỉnh sửa trong tuần này.',
        modifyBookingSuccess_one: 'Chỉnh sửa đơn đặt bàn thành công. Bạn còn {{remaining}} lượt chỉnh sửa trong tuần này.',
        modifyDeliverySuccess_other: 'Chỉnh sửa đơn giao hàng thành công. Bạn còn {{remaining}} lượt chỉnh sửa trong tuần này.',
        modifyDeliverySuccess_one: 'Chỉnh sửa đơn giao hàng thành công. Bạn còn {{remaining}} lượt chỉnh sửa trong tuần này.',
    },
    auth: {
        accountLocked: 'Tài khoản của bạn đã bị khóa. Lý do: vi phạm chính sách nội quy Nhà hàng.',
        accountLockedUntil: 'Tài khoản của bạn đã bị khóa đến {{until}}. Lý do: vi phạm chính sách nội quy Nhà hàng.',
        otpDigitAria: 'Chữ số thứ {{count}}',
    },
    admin: {
        sortDescending: 'Sắp xếp {{label}} theo thứ tự giảm dần',
        sortAscending: 'Sắp xếp {{label}} theo thứ tự tăng dần',
    },
    recipeEditing: {
        notification: "Thông báo",
        saveDuplicate: "Công thức “{{recipe}}” đã có trong danh sách của bạn.\nKhông thể lưu trùng lặp công thức.",

        optionsUnavailable: "Chưa thể tải các nguyên liệu phù hợp để thay thế. Vui lòng thử lại.",
        addOns: "Nguyên liệu bổ sung",
        previewUnavailable: "Chưa thể tạo hướng dẫn nấu cho món này lúc này. Vui lòng thử lại sau.",
        deleteRecipe: "Xóa công thức",
        deleteConfirm: "Xóa công thức “{{recipe}}” khỏi danh sách của bạn?",
        deleteFailed: "Không thể xóa công thức. Vui lòng thử lại.",

        "backToOriginal": "Quay lại",
        "ruleHint": "Nguyên liệu tối thiểu được giữ lại hoặc thay bằng lựa chọn phù hợp với món. Danh sách tự cập nhật theo nguyên liệu đang chọn; nhấn Quay lại để phục hồi nguyên liệu gốc."
},
    pricing: {
        noSurcharge: 'Không phụ thu',
        surcharge: 'Phụ thu {{amount}} cho nguyên liệu thêm',
        selectedPortion: 'Khẩu phần: {{portion}}',
        priceUnavailable: 'Công thức này hiện không thể áp dụng mức giá. Vui lòng chọn công thức khác.',
        selectedPrice: 'Giá phần đã chọn: {{amount}}',
        portionSizes: 'Chọn khẩu phần',
        addToCart: 'Thêm vào giỏ hàng',
        portionLow: 'Ít',
        portionStandard: 'Vừa',
        portionHigh: 'Nhiều',
    },
    dishCommunity: {
        duplicateRecipe: "Công thức “{{recipe}}” đã được chia sẻ bởi {{author}}.\nKhông thể chia sẻ trùng lặp công thức.",
        "choose": "Chọn món để đánh giá",
        "prompt": "Vui lòng chọn món ăn để đánh giá",
        "reviews": "Đánh giá từ khách hàng",
        "recipes": "Công thức thay thế",
        "share": "Chia sẻ công thức",
        "noReviews": "Chưa có đánh giá cho món này.",
        "noRecipes": "Chưa có công thức được chia sẻ.",
        "search": "Tìm kiếm theo tên món",
        "type": "Loại món",
        "allTypes": "Tất cả loại món",
        "sortByVotes": "Phiếu",
        "votesAscending": "Số phiếu tăng dần",
        "votesDescending": "Số phiếu giảm dần",
        "switchVotesAscending": "Đang sắp xếp giảm dần; nhấn để chuyển sang tăng dần",
        "switchVotesDescending": "Đang sắp xếp tăng dần; nhấn để chuyển sang giảm dần",
        "noDishes": "Không tìm thấy món ăn phù hợp.",
        "yourReview": "Đánh giá của bạn",
        "reviewComment": "Viết nhận xét (không bắt buộc)",
        "submit": "Gửi / cập nhật đánh giá",
        "saved": "Đã lưu đánh giá.",
        "more": "Xem thêm",
        "loading": "Đang tải...",
        "error": "Không thể tải hoặc lưu dữ liệu. Vui lòng thử lại.",
        "none": "Không có",
        "selectRecipe": "Chọn công thức đã lưu",
        "shareHint": "Chia sẻ công thức bạn đã tạo từ trang chỉnh sửa món để mọi người cùng sử dụng.",
        "createRecipe": "Tạo / chỉnh sửa công thức món ăn",
        "author": "Người chia sẻ",
        "removed": "Nguyên liệu bỏ đi",
        "replaced": "Nguyên liệu thay thế",
        "added": "Nguyên liệu thêm vào",
        "ingredients": "Nguyên liệu của công thức mới",
        "instructions": "Công thức mới",
        "likes": "lượt thích",
        "comments": "bình luận",
        "useRecipe": "Lưu để sử dụng",
        "recipeSaved": "Đã lưu công thức vào danh sách của bạn.",
        "writeComment": "Viết bình luận",
        "sendComment": "Gửi bình luận"
        ,"voteTitle": "Bầu chọn thêm món"
        ,"voteTickets": "Thẻ vote hiện có"
        ,"receiveTicket": "Nhận lượt vote hàng ngày"
        ,"claimToday": "Đã nhận lượt vote hôm nay"
        ,"phoneRequired": "Hãy thêm số điện thoại vào thông tin cá nhân để tham gia bầu chọn. Mỗi số chỉ dùng được cho một tài khoản bình chọn trong tháng."
        ,"proposeDish": "Đề xuất món mới"
        ,"proposalName": "Tên món"
        ,"proposer": "Khách hàng đề xuất"
        ,"proposalNameEn": "Tên món (tiếng Anh)"
        ,"proposalImage": "Đường dẫn hình ảnh"
        ,"proposalIngredients": "Nguyên liệu (phân cách bằng dấu phẩy)"
        ,"proposalIngredientsEn": "Nguyên liệu (tiếng Anh)"
        ,"proposalRecipe": "Công thức chế biến"
        ,"proposalRecipeEn": "Công thức chế biến (tiếng Anh)"
        ,"aiIngredientsOnly": "AI chỉ hỗ trợ nhận diện nguyên liệu và tạo công thức; nội dung đề xuất chưa được dịch."
        ,"submitProposal": "Đề xuất món"
        ,"editComplete": "Chỉnh sửa và hoàn thiện món"
        ,"confirmReject": "Từ chối món khách hàng đề xuất này?"
        ,"submittedInEnglish": "Khách đề xuất bằng tiếng Anh; nội dung chưa được dịch."
        ,"submittedInVietnamese": "Khách đề xuất bằng tiếng Việt; nội dung chưa được dịch."
        ,"sendProposal": "Gửi đề xuất"
        ,"vote": "Bình chọn"
        ,"votes": "phiếu"
        ,"closesAt": "Kết thúc lúc"
        ,"noProposals": "Chưa có món được đề xuất trong tháng này."
        ,"proposalValidationUnavailable": "Hiện chưa thể kiểm tra tên và ảnh món. Vui lòng thử lại sau ít phút."
        ,"proposalImageMismatch": "Ảnh chưa phù hợp với tên món. Vui lòng chọn ảnh rõ và đúng món đã nhập."
        ,"proposalLimit": "Mỗi người được đề xuất một món mỗi tháng."
        ,"proposalSent": "Đã gửi món đề xuất."
          ,"proposePrompt": "Chia sẻ ý tưởng món mới với nhà hàng"
          ,"proposalUsed": "Đã đề xuất tháng này"
          ,"proposalSuccess": "Món ăn đã được thêm vào bầu chọn đề xuất"
          ,"duplicateSold": "Không thể đề xuất trùng với món đã bán"
          ,"duplicateProposed": "Không thể đề xuất trùng với món đã được đề xuất"
          ,"processing": "Đang xử lý..."
          ,"viewDetails": "Xem chi tiết"
          ,"close": "Đóng"
          ,"votePhoneHint": "Phiếu có thể tích lũy đến ngày cuối tháng. Mỗi phiếu được lưu riêng theo người và ngày."
          ,"voteHours": "Chỉ bình chọn được từ 07:00 đến trước 22:00 mỗi ngày."
          ,"voteHoursClosed": "Đã hết giờ bình chọn hôm nay. Bạn có thể bình chọn từ 07:00 đến trước 22:00."
          ,"phoneAlreadyUsed": "Số điện thoại này đã được dùng để vote bởi tài khoản khác trong tháng."
          ,"phoneLocked": "Bạn đã vote bằng số điện thoại khác trong tháng này; không thể đổi số để vote tiếp."
          ,"voteClosed": "Đợt vote tháng này đã kết thúc"
          ,"voteForDish": "Bình chọn món ăn"
          ,"voteQuantity": "Số phiếu muốn bình chọn"
          ,"back": "Quay lại"
          ,"decreaseVote": "Giảm số phiếu"
          ,"increaseVote": "Tăng số phiếu"
          ,"winnerTie": "Tháng này có nhiều món đồng hạng nhất nên không có món được chọn."
          ,"winnerNoVotes": "Tháng này không có món trúng giải vì không có phiếu bình chọn."
          ,"ballotNotClosed": "Chỉ có thể chốt bình chọn sau 22:00 ngày cuối tháng của đợt bình chọn."
          ,"receiveWinner": "Nhận món giải nhất"
          ,"winnerReceived": "Đã nhận món trúng giải. Mở mục Món ăn được khách hàng đề xuất để hoàn thiện món."
          ,"addToMenu": "Thêm món"
          ,"addingToMenu": "Đang thêm món…"
          ,"addedToMenu": "Thêm món thành công."
          ,"winnerUnavailable": "Chưa có món thắng duy nhất để nhận."
        ,"adminSuggestions": "Món ăn được khách hàng đề xuất"
        ,"approve": "Duyệt và thêm vào menu"
        ,"reject": "Từ chối"
        ,"menuPrice": "Giá bán"
        ,"menuType": "Loại món"
},
    rating: {
        starAria: '{{count}} sao',
    },
    revenue: {
        revenueTooltip: 'Doanh thu: {{amount}}M',
        targetTooltip: 'Mục tiêu: {{amount}}M',
    },
    dishDetail: {
        noReviews: 'Chưa có đánh giá',
        allDishes: 'Tất cả các món',
        filterOtherDishes: 'Lọc món ăn theo loại',
        duplicateIngredients: 'Trùng lặp nguyên liệu với công thức: "{{recipe}}".',
    },
};

export default vi;
