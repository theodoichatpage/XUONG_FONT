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

## AI đọc ảnh và dựng chữ

Nhập khóa Gemini API và bấm **Kiểm tra kết nối**. Khi đã kết nối, thêm ảnh mẫu và bấm **AI đọc ảnh và dựng chữ**. Gemini định vị và đọc trực tiếp ảnh mẫu. Xưởng Font lấy đường nét từ pixel gốc khi phân tách đủ rõ. Nếu kết nối lỗi giữa chừng, lượt AI dừng và giữ kết quả trước đó. Các nét đã có được giữ lại. Chỉ những vùng chưa đọc chắc hoặc chưa tách được mới hiện mặc định trong phần duyệt. Sửa hoặc điền chữ ngay cạnh ảnh, rồi bấm **Lấy nét từ các từ đã chọn**. Ký tự chưa có mẫu vẫn hiện **Còn thiếu**.

## Quét nhiều ảnh trên web

1. Mở [Xưởng Font](https://xuong-font.vercel.app/) và đưa các ảnh vào danh sách, rồi bấm **Quét OCR thủ công**. Nếu một ảnh có nhiều chi tiết, hãy khoanh vùng chữ trước khi quét.
2. So sánh từ OCR với hình cắt bên cạnh. Sửa ký tự đọc sai, giữ nguyên số ký tự của từ, hoặc bỏ chọn vùng bị tách sai.
3. Bấm **Lấy nét từ các từ đã chọn**. Web dùng nét từ pixel ảnh gốc và giữ các nét đã thêm trước đó. Với nhiều nguồn cho cùng một chữ, công cụ ưu tiên vùng OCR có độ tin cậy cao nhất trong các từ được chọn.
4. Kiểm tra ô **Còn thiếu**, lấy thêm nét hoặc dùng **Tạo dấu tiếng Việt**, rồi tải `.ttf`.

Tesseract.js nhận diện tiếng Việt trong trình duyệt. Tệp chương trình, WebAssembly và dữ liệu ngôn ngữ đi kèm bản web, nên ảnh không phải gửi lên dịch vụ OCR. Tính năng quét cần mở trang qua HTTP hoặc HTTPS. Bản HTML mở trực tiếp vẫn dùng được quy trình thủ công.

## Từ ảnh đến font

1. Chọn hoặc kéo nhiều ảnh PNG, JPG hoặc WebP cùng lúc. Có thể sao chép ảnh hoặc chụp màn hình vào clipboard rồi bấm **Ctrl+V** trên trang để thêm ảnh. Dùng danh sách **Ảnh đang xử lý** hoặc hai nút mũi tên để chuyển ảnh. Khung chọn, chữ đã nhập và ngưỡng được giữ riêng cho từng ảnh trong phiên đang mở. Với ảnh tiêu đề video, kéo trên ảnh để khoanh dòng chữ. Chọn chữ sáng hoặc tối rồi bật **Xem nét đã tách** để chỉnh ngưỡng.
2. Nhập chính xác các ký tự có mặt theo thứ tự đọc và chọn **Tách và thêm chữ**. Nếu nét dính nhau hoặc có dấu rời, khoanh riêng một chữ và dùng **Thêm một chữ**. Có thể lần lượt thêm chữ từ nhiều ảnh.
3. Chọn **Tạo dấu tiếng Việt** để ghép dấu từ các nguyên âm đã nhập. Dấu ghép dùng hình mẫu dựng sẵn và có thể thay bằng ký tự lấy trực tiếp từ ảnh. Chữ Đ, những thân chữ còn thiếu, số và dấu câu lấy từ ảnh riêng.
4. Thử tiêu đề, chỉnh khoảng cách và tải `.ttf`. Chữ thiếu được gạch chân chấm trong bản xem trước. Công cụ vẫn cho phép xuất bộ font đang làm dở.

Trình duyệt lưu nét chữ, tên font, tiêu đề thử và khoảng cách chữ nếu cho phép lưu cục bộ. Ảnh mẫu, vùng chọn và phần duyệt OCR được lưu trên cùng trình duyệt để mở lại sau khi tải trang.

Để thử nhanh, chọn **Thử ảnh mẫu → Tách và thêm chữ → Tạo dấu tiếng Việt → Tải font .TTF**.

## AI kiểm tra nét

Bấm vào ký tự đã có nét, chọn **AI kiểm tra nét**, rồi xem ảnh gốc, nét đã vẽ và hình chồng nét. Với ký tự đã tạo trước khi có chức năng này, hãy khoanh đúng một chữ trên ảnh mẫu trước. Vùng khoanh thủ công được ưu tiên nếu có.

Nhập khóa Gemini API do bạn quản lý và bấm **Gửi Gemini kiểm tra**. Hai ảnh đối chiếu được gửi qua một Vercel Function đến Gemini. Khóa được chuyển cùng yêu cầu. Khi chọn **Ghi nhớ khóa trên trình duyệt này**, khóa được lưu cục bộ sau lần kết nối thành công. Bỏ chọn để xóa khóa đã lưu. Kết quả là nhận xét để duyệt, không cập nhật nét hay file font. Bản HTML chạy trực tiếp hỗ trợ xem đối chiếu, còn gửi Gemini cần bản web trên Vercel.

## Nguồn mã

Các mô-đun vector hóa, tách vùng, định cỡ và xuất font được chuyển từ [draw-your-font](https://github.com/danilo-znamerovszkij/draw-your-font/tree/ef367bb2193b523a03e313b9219e31055558ae70). Thông báo MIT của mã gốc nằm trong `LICENSE`. Bản web dùng [esm-potrace-wasm 0.5.0](https://github.com/tomayac/esm-potrace-wasm) và Potrace theo GPL-2.0. Bản web đóng gói được phân phối theo GPL-2.0, xem `COPYING`. Bản đóng gói có đường dẫn về repo này để lấy mã nguồn và hướng dẫn dựng.
