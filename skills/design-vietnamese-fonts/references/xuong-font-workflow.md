# Luồng Xưởng Font

Dự án hiện tại: https://xuong-font.vercel.app/ ; mã nguồn theodoichatpage/XUONG_FONT. Kiểm tra mã hiện hành trước sửa, vì các nút có thể thay đổi.

## Người dùng thao tác

1. Mở **Bộ sưu tập Font**, chọn font hoặc kiểu trong family.
2. Bấm **Mở để chỉnh sửa** để đưa bộ chữ vào tab **Tạo font mới**. Giữ nguyên tên khi muốn cập nhật kiểu đó.
3. Mở **Chỉnh dấu** ở Bộ ký tự; chọn phạm vi, tăng khoảng hở hoặc scale dấu. Xem trước rồi áp dụng. Hoàn tác khi chưa hợp mắt.
4. Kiểm các dấu kép và cặp râu ngoài bộ xem trước tối đa sáu chữ. Nút hiện tại dịch/scale nhóm contour dấu rời, chưa tự sửa khoảng giữa hai tầng dấu và không tách dấu đã hàn vào thân.
5. Xuất TTF để kiểm, rồi quay bộ sưu tập bấm **Lưu font đang làm**. Xác nhận style vẫn ở đúng family.

## Bộ sưu tập và bản Việt hóa

- Mọi font Xưởng xuất ra (lưu, tải, family tự sinh) tự mang tiền tố `XFVN - ` ở tên trong bộ sưu tập và tên family bên trong file (ví dụ `XFVN - Poppins-ThinItalic`, family `XFVN - Poppins`), để cài cạnh font gốc không trùng tên. Font gốc người dùng nhập vào giữ nguyên tên. Không cần nút đổi tên.
- Danh sách hiển thị hai cột **Font gốc | Việt hóa**; tiêu đề family ghi tiến độ "Việt hóa N/M". Ghép cặp theo tên đã bỏ tiền tố, bỏ "Việt hóa", bỏ dấu gạch/khoảng trắng. Bản Việt hóa cũ mang tên lệch (đặt theo ô Tên bộ font lúc làm, ví dụ "XFVN - Gilroy Thin" của "SVN-Gilroy Thin") được ghép theo kiểu chữ trong cùng family và tự đổi tên trong bộ sưu tập thành `XFVN - <tên font gốc>`; nhiều bản cùng kiểu thì lấy bản lưu sau cùng, bản còn lại để người dùng tự xóa.
- **Font gốc đã có tiếng Việt** (ví dụ font SVN-...): bấm **Việt hóa** như thường. Xưởng kiểm bảng mã, thấy đủ chữ tiếng Việt thì không ghép dấu, chỉ lưu bản sao mang tiền tố XFVN (đổi tên trong file, outline giữ nguyên). Nếu cùng family còn font đã có tiếng Việt mà chưa có bản XFVN, Xưởng hỏi làm luôn cả family. Không thêm nút riêng cho việc này. Bản XFVN chỉ thay mục cùng tên, không thay theo ô kiểu (Black và Heavy cùng ô Black nhưng là hai font khác nhau).
- Hỏi xác nhận bằng hộp trong trang (`site/ask.js`), không dùng `window.confirm`: trình duyệt có thể chặn hộp thoại của trang sau vài lần hỏi, khi đó nút như bị liệt mà không có thông báo.
- **Cập nhật bản Việt hóa cũ theo quy tắc mới:** chọn bản XFVN, bấm **Mở để chỉnh sửa**, bấm **Tạo dấu tiếng Việt**, rồi **Lưu font đang làm**. Không cần xóa font cũ. Xưởng so với font gốc cùng hàng: chữ font gốc không có là do Xưởng ghép, được ghép lại; dấu mẫu Xưởng đã dựng được dựng lại. Font gốc phải còn trong Bộ sưu tập; thiếu thì Xưởng giữ mọi chữ như nét gốc và báo. Chỉnh tay trước đó trên các chữ này sẽ bị thay.

## Điểm nối khi sửa mã

- `site/mark-spacing.js`: chỉnh contour dấu rời, giữ advance. Khi thay thuật toán, kiểm dấu trên, dấu dưới, counter thân, râu và dấu hàn vào thân.
- `site/vietnamese.js`: ghép chữ Việt và dấu. Không ghi đè glyph nhập đã được người dùng sửa nếu chưa được yêu cầu. Dấu font gốc không có (thường là râu, nặng, hỏi) được dựng theo nét của chính font, không dùng hình mẫu cố định.
- `site/mark-standards.js`: số chuẩn dấu đo từ font chuyên nghiệp ([chuẩn đo dấu](mark-standards.md)). Đổi số ở đây, rồi chạy `npm run check:marks` để so lại với dấu gốc của nhà thiết kế.
- `site/font-import.js`: đọc outline/mã/metrics. Đừng làm mất alias Unicode.
- `site/font-family.js`: sinh weight; phải kiểm lại từng style và đọc lại file xuất.
- `src/vietnamese-design-rules.mjs`: chỉ dẫn thiết kế dùng trong các bước AI. Giữ nguồn và các số heuristic được phân biệt.
- `site/font-collection.js`: lưu bản sửa đúng id/family/style, tránh nhân bản.
- `src/assemble.js`: xuất TTF; giữ tên family/style/weight và advance đã kiểm tra.

Bộ quy tắc không thay thế thuật toán kiểm va chạm. Chỉ nói tính năng tự động có thật khi mã đã thực hiện và kết quả đã được kiểm chứng. Không gọi AI chỉ để kiểm tra việc nối prompt; dùng kiểm tra tĩnh trước, chỉ dùng dịch vụ trả phí khi nằm trong tác vụ đã được cho phép.

## Rà soát theo quy tắc

Trong Bộ sưu tập, chọn Đánh giá font hoặc Đánh giá family; dưới Thử tiêu đề có Đánh giá font đang làm; tab Kiểm tra font tiếng Việt nhận file độc lập. `site/font-quality.js` đọc file font, rà cmap/metadata, lấy khoảng gần nhất contour dấu rời, giao outline của cặp thử và chỉ báo chênh đỉnh râu. Báo rõ mục cần duyệt bằng mắt, chưa đo được và chưa xác minh shaping NFD.

Mỗi quy tắc có SVG nguyên bản trong `site/references/vector`, cùng thông tin nguồn và hash hình học. Phần SVG của font đang kiểm chỉ sao lại outline font đó. Không dịch, vẽ thêm dấu vào mẫu chuẩn để làm kết quả trông đạt.

## Dựng font từ ảnh trên máy, không gọi AI

`tools/image-to-font/image_to_font.py` dựng TTF từ một ảnh chữ mẫu cùng file nội dung chữ (mỗi dòng ảnh một dòng). Script vector hóa bằng Potrace từ pixel gốc và ghép chữ Việt thiếu từ thân chữ cùng dấu có mẫu. Kết quả gồm `report.json` (chữ lấy từ ảnh, chữ ghép, chữ thiếu kèm lý do) và `proof.png`. Dùng khi Gemini lỗi hoặc hết hạn mức, hoặc khi ảnh không được gửi ra ngoài. Chữ ghép và chữ tự tách khỏi chỗ dính là suy luận, cần soát theo [quy tắc thiết kế](design-rules.md). Không gọi bản này là bản sao đã xác minh. Cách chạy xem `tools/image-to-font/README.md`.
