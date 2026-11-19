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


## Family từ ảnh và phục dựng trực tiếp

Trong **Tạo font mới**, dùng ngay ô **Tên bộ font** trên thanh trên, vùng **Ảnh mẫu và dựng chữ** và nút **Tạo bộ font**. Không nhập lại tên, không tải lại ảnh và không cần tạo dự án riêng. Nút này tự lưu Family, phân tích ảnh, phục dựng và đối chiếu, rồi đưa kết quả về Bộ ký tự / Thử tiêu đề. Chỉ ảnh chưa phân loại chắc chắn mới cần xác nhận hoặc bỏ qua rồi bấm Tiếp tục tạo bộ font. Ma trận và công cụ kỹ thuật nằm trong Chỉnh sửa và soát chữ (nâng cao) ở dưới màn hình. Phân loại dựa hình dạng không có nhãn luôn cần xác nhận. Không sinh 16 kiểu từ một outline bằng offset/shear.

Glyph trực tiếp: threshold có kiểm soát → Potrace WASM (không morphology, không tối ưu gộp Bézier) → một scale đồng nhất → SVG path → TTF. Không AI vẽ lại ảnh mẫu. Chữ dính không tách an toàn, watermark che nét và nguồn thiếu phải được duyệt hoặc cung cấp ảnh tốt hơn. Không có cách tự phục hồi chắc chắn nét bị che.

Chọn glyph để xem ảnh gốc/vector/glyph render từ TTF, overlay và các phép đo riêng. Đây là ngưỡng rà soát của Xưởng, không phải chứng nhận giống tuyệt đối. Duyệt/khóa chỉ sau đối chiếu; glyph khóa không bị phục dựng lại tự động. Có lịch sử 10 outline/glyph. Ghép dấu chỉ dùng contour dấu có mẫu, đánh dấu suy luận. Các ký tự chưa đủ thành phần giữ trống.

Dự án ở IndexedDB `xuong-font-family-projects` v1, độc lập với `xuong-font-collection` và `xuong-font-references`; không migration phá dữ liệu. Backup JSON chứa ảnh, glyph và lịch sử; khôi phục thành bản riêng. Bấm lưu TTF vào Bộ sưu tập để dùng luồng cũ; bấm mở Style và lưu phần sửa về Style để chuyển qua lại. Font xuất thiếu ký tự được ghi là DRAFT. Family chỉ xuất các Style đã qua điều kiện kỹ thuật, duyệt glyph và người dùng xác nhận thử ứng dụng.

Kiểm thử: `npm run check:quality`, `npm run check:family`, `npm run check:reconstruction`. Bài raster reconstruction cần `@napi-rs/canvas` trong môi trường kiểm thử (hoặc runtime do Work cung cấp), không cần cho website hay máy người dùng. Có thể truyền đường dẫn ảnh screenshot được chú giải như trong `scripts/check-reconstruction.cjs`. Xem [báo cáo ảnh thực](reports/reconstruction-2026-11-19.md) và [tình trạng triển khai](reports/implementation-2026-11-19.md).


### Kiểm giữ nét mảnh và chữ i từ ảnh thực

`npm run check:fidelity` kiểm hàm đối chiếu sản phẩm với cutoff 0, hai polarity, contour chéo, mất serif nhỏ và proof cũ. Truyền đường dẫn ảnh “Ba tên Việt trên nền trắng(4).png” để chạy 13 glyph trực tiếp theo các crop chú giải. Bài này cần runtime rasterizer như check:reconstruction. [Báo cáo bổ sung](reports/lowercase-reference-2026-11-19.md) phân biệt rõ ị trực tiếp và i suy luận bằng tái sử dụng hai contour, không vẽ lại thân.

Trong Family, bấm **Đối chiếu toàn Style từ ảnh gốc** rồi duyệt các glyph vượt ngưỡng. Khi đổi ngưỡng ảnh, cần vector hóa lại trước khi duyệt. **Ghép glyph thiếu từ thành phần có mẫu** có thể suy ra i từ ị khi có đúng ba contour tách rõ và dấu nặng ở dưới baseline. Nếu không đủ chắc chắn, giữ thiếu; không cắt vào contour liền thân.

### Ảnh nền trắng và bộ tách dòng

Nút Tạo bộ font dùng ảnh đen–trắng sạch trực tiếp; với nền phức tạp, gọi lại `/api/font-image` để Gemini dựng ảnh nền trắng rồi lưu như ảnh con riêng, không thay ảnh gốc. Các outline đó mang nguồn `inferred/ai-redraw`. Lựa chọn Style trong tên được giữ. Gemini cung cấp phiên âm và vùng dòng; bộ tách dùng khoảng trắng thật để định vị từ và thành phần nét để tách chữ.

`npm run check:clean` chạy fixture ảnh ChatGPT đã tạo trong hội thoại: 40 ký tự có outline, 29 qua ngưỡng hình học. Vùng dòng/phiên âm trong fixture được chú giải, chưa phải nghiệm thu Gemini nhận diện thực tế. Xem `reports/co-tet-clean-2026-11-19.md`.
