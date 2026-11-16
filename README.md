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

## Dựng chữ theo ảnh trước, suy đoán sau

1. Thêm ảnh mẫu, kiểm tra kết nối Gemini rồi bấm **1. Dựng chữ có mẫu**. Gemini đọc ảnh và định vị chữ thực sự nhìn thấy. Xưởng Font dùng vùng ảnh gốc để lấy đường viền. Ký tự đọc được nhưng chưa tách rõ vẫn nằm trong danh sách có mẫu.
2. Khi không còn ảnh bổ sung, bấm **2. Suy đoán chữ thiếu**. Gemini dùng đường viền các ký tự đã lấy nét làm mẫu neo và thiết kế các ký tự chưa thấy. Các nét AI cũ thiếu vùng đối chiếu không làm mẫu neo.
3. Nếu dừng giữa phần suy đoán, bấm lại nút đó để tiếp tục. Kiểm tra dáng chữ trong **Thử tiêu đề** trước khi tải `.TTF`.

**Xem chỉ dẫn gửi Gemini** hiển thị đúng câu lệnh của hai bước. Những ảnh mẫu dùng để xử lý được gửi tới Gemini khi bấm nút tương ứng.

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
