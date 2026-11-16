# Xưởng Font

Xưởng Font là công cụ tạo font tiêu đề chữ hoa và chữ thường tiếng Việt từ ảnh. Công cụ chạy trong Chrome hoặc Edge và xử lý ảnh trên thiết bị.

## Chạy trên Windows

Cài Node.js 18 trở lên, mở PowerShell trong thư mục repo và chạy:

```powershell
npm ci
npm run build
Start-Process .\dist\xuong-font.html
```

`dist/xuong-font.html` là bản mở trực tiếp. Để đưa lên hosting tĩnh, dùng thư mục `dist` với trang chính `index.html`.

## AI vẽ và hoàn thiện font

1. Thêm ảnh mẫu, kiểm tra kết nối Gemini rồi bấm **AI vẽ và hoàn thiện font**.
2. Gemini nhận các ảnh mẫu và trả đường viền SVG cho từng ký tự theo nhóm. Ô **AI theo ảnh** là ký tự Gemini cho biết có mẫu trực tiếp. **AI suy đoán** là nét thiết kế từ phong cách chung. Xưởng Font kiểm tra cú pháp đường viền, lưu nhóm hợp lệ rồi dùng các nét đó để xuất TrueType.
3. Nếu dừng hoặc chạm hạn mức, bấm nút AI để tiếp tục từ các ký tự chưa có bản dựng AI. Kiểm tra dáng chữ bằng phần **Thử tiêu đề** trước khi tải `.TTF`.

Ảnh mẫu và phần nét đã lưu được giữ trên cùng trình duyệt. Khi bấm dựng bằng AI, các ảnh mẫu được gửi đến Gemini. Có thể lấy nét thủ công từ một vùng ảnh khi cần thay một ký tự.

## AI kiểm tra nét

Bấm vào ký tự đã có nét, chọn **AI kiểm tra nét**, rồi xem ảnh gốc, nét đã vẽ và hình chồng nét. Với ký tự đã tạo trước khi có chức năng này, hãy khoanh đúng một chữ trên ảnh mẫu trước. Vùng khoanh thủ công được ưu tiên nếu có.

Nhập khóa Gemini API do bạn quản lý và bấm **Gửi Gemini kiểm tra**. Hai ảnh đối chiếu được gửi qua một Vercel Function đến Gemini. Khóa được chuyển cùng yêu cầu. Khi chọn **Ghi nhớ khóa trên trình duyệt này**, khóa được lưu cục bộ sau lần kết nối thành công. Bỏ chọn để xóa khóa đã lưu. Kết quả là nhận xét để duyệt, không cập nhật nét hay file font. Bản HTML chạy trực tiếp hỗ trợ xem đối chiếu, còn gửi Gemini cần bản web trên Vercel.

## Nguồn mã

Các mô-đun vector hóa, tách vùng, định cỡ và xuất font được chuyển từ [draw-your-font](https://github.com/danilo-znamerovszkij/draw-your-font/tree/ef367bb2193b523a03e313b9219e31055558ae70). Thông báo MIT của mã gốc nằm trong `LICENSE`. Bản web dùng [esm-potrace-wasm 0.5.0](https://github.com/tomayac/esm-potrace-wasm) và Potrace theo GPL-2.0. Bản web đóng gói được phân phối theo GPL-2.0, xem `COPYING`. Bản đóng gói có đường dẫn về repo này để lấy mã nguồn và hướng dẫn dựng.
