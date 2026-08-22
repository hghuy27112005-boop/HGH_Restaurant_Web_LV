# Cấu trúc thư mục React

```
resources/js/
├── app.jsx                     # Entry point - đăng ký tất cả component
├── bootstrap.js                # Axios config
│
├── components/                 # Shared components (dùng chung nhiều trang)
│   ├── ui/                     # Các UI element nhỏ
│   │   ├── Button.jsx
│   │   ├── Modal.jsx
│   │   └── ...
│   └── layout/                 # Layout components nếu cần
│
└── pages/                      # Mỗi trang là 1 thư mục riêng
    ├── Home/
    │   └── HomeApp.jsx         # Component chính của trang chủ
    ├── Menu/
    │   └── MenuApp.jsx
    ├── Cart/
    │   └── CartApp.jsx
    ├── Profile/
    │   └── ProfileApp.jsx
    └── Admin/
        ├── AdminMenuManagementApp.jsx
        └── TransactionManagementApp.jsx
```

## Cách dùng (trong app.jsx)

```js
import HomeApp from './pages/Home/HomeApp';
mountComponent('react-home', HomeApp);
```

## Cách Laravel truyền data sang React (trong Blade)

```blade
<div id="react-home" data-props='@json($highlights)'></div>
```
