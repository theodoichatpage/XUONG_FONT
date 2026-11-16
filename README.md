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

## Dựng chữ theo ảnh

Thêm ảnh mẫu và bấm **Dựng chữ có mẫu** để Gemini đọc và định vị các ký tự gửi từ ảnh. Xưởng Font dựng đường viền từ vùng ảnh gốc. Nếu còn ký tự thiếu, bổ sung ảnh mẫu. Kiểm tra dáng chữ trong **Thử tiêu đề** trước khi tải `.TTF`.

## AI kiểm tra nét

Bấm vào ký tự đã có nét, chọn **AI kiểm tra nét**, rồi xem ảnh gốc, nét đã vẽ và hình chồng nét. Với ký tự đã tạo trước khi có chức năng này, hãy khoanh đúng một chữ trên ảnh mẫu trước. Vùng khoanh thủ công được ưu tiên nếu có.

Nhập khóa Gemini API do bạn quản lý và bấm **Gửi Gemini kiểm tra**. Hai ảnh đối chiếu được gửi qua một Vercel Function đến Gemini. Khóa được chuyển cùng yêu cầu. Khi chọn **Ghi nhớ khóa trên trình duyệt này**, khóa được lưu cục bộ sau lần kết nối thành công. Bỏ chọn để xóa khóa đã lưu. Kết quả là nhận xét để duyệt, không cập nhật nét hay file font. Bản HTML chạy trực tiếp hỗ trợ xem đối chiếu, còn gửi Gemini cần bản web trên Vercel.

## Nguồn mã

Các mô-đun vector hóa, tách vùng, định cỡ và xuất font được chuyển từ [draw-your-font](https://github.com/danilo-znamerovszkij/draw-your-font/tree/ef367bb2193b523a03e313b9219e31055558ae70). Thông báo MIT của mã gốc nằm trong `LICENSE`. Bản web dùng [esm-potrace-wasm 0.5.0](https://github.com/tomayac/esm-potrace-wasm) và Potrace theo GPL-2.0. Bản web đóng gói được phân phối theo GPL-2.0, xem `COPYING`. Bản đóng gói có đường dẫn về repo này để lấy mã nguồn và hướng dẫn dựng.

## Kiểm định font xuất bằng Font Bakery

Cài Font Bakery trong môi trường Python hoặc qua pipx, sau đó chạy lệnh trên file TTF đã tải từ Xưởng Font.

```sh
pipx install 'fontbakery[typenetwork]==1.1.0'
npm run check:font -- --json font-audit.json path/to/font.ttf
```

Lệnh kiểm tra các điểm lệch đường chuẩn, đoạn thẳng cùng hướng, chỗ gãy, đường gần ngang hoặc gần đứng và đoạn rất ngắn. Đọc cảnh báo theo mã Unicode rồi đối chiếu với mẫu phóng lớn để giữ các góc và chi tiết có chủ ý của kiểu chữ.
