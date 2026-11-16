# Xưởng Font

Xưởng Font là công cụ tạo font tiêu đề in hoa tiếng Việt từ ảnh. Công cụ chạy trong Chrome hoặc Edge và xử lý ảnh trên thiết bị.

## Chạy trên Windows

Cài Node.js 18 trở lên, mở PowerShell trong thư mục repo và chạy:

```powershell
npm ci
npm run build
Start-Process .\dist\xuong-font.html
```

`dist/xuong-font.html` là bản mở trực tiếp. Để đưa lên hosting tĩnh, dùng thư mục `dist` với trang chính `index.html`.

## Từ ảnh đến font

1. Chọn ảnh PNG, JPG hoặc WebP. Với ảnh tiêu đề video, kéo trên ảnh để khoanh dòng chữ. Chọn chữ sáng hoặc tối rồi bật **Xem nét đã tách** để chỉnh ngưỡng.
2. Nhập chính xác các ký tự có mặt theo thứ tự đọc và chọn **Tách và thêm chữ**. Nếu nét dính nhau hoặc có dấu rời, khoanh riêng một chữ và dùng **Thêm một chữ**. Có thể lần lượt thêm chữ từ nhiều ảnh.
3. Chọn **Tạo dấu tiếng Việt** để ghép dấu từ các nguyên âm đã nhập. Dấu ghép dùng hình mẫu dựng sẵn và có thể thay bằng ký tự lấy trực tiếp từ ảnh. Chữ Đ, những thân chữ còn thiếu, số và dấu câu lấy từ ảnh riêng.
4. Thử tiêu đề, chỉnh khoảng cách và tải `.ttf`. Chữ thiếu được gạch chân chấm trong bản xem trước. Công cụ vẫn cho phép xuất bộ font đang làm dở.

Trình duyệt lưu nét chữ, tên font, tiêu đề thử và khoảng cách chữ nếu cho phép lưu cục bộ. Ảnh gốc cần mở lại sau khi tải lại trang.

Để thử nhanh, chọn **Thử ảnh mẫu → Tách và thêm chữ → Tạo dấu tiếng Việt → Tải font .TTF**.

## Nguồn mã

Các mô-đun vector hóa, tách vùng, định cỡ và xuất font được chuyển từ [draw-your-font](https://github.com/danilo-znamerovszkij/draw-your-font/tree/ef367bb2193b523a03e313b9219e31055558ae70). Thông báo MIT của mã gốc nằm trong `LICENSE`. Bản web dùng [esm-potrace-wasm 0.5.0](https://github.com/tomayac/esm-potrace-wasm) và Potrace theo GPL-2.0. Bản web đóng gói được phân phối theo GPL-2.0, xem `COPYING`. Bản đóng gói có đường dẫn về repo này để lấy mã nguồn và hướng dẫn dựng.
