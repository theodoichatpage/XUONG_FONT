# Luồng Xưởng Font

Dự án hiện tại: https://xuong-font.vercel.app/ ; mã nguồn theodoichatpage/XUONG_FONT. Kiểm tra mã hiện hành trước sửa, vì các nút có thể thay đổi.

## Người dùng thao tác

1. Mở **Bộ sưu tập Font**, chọn font hoặc kiểu trong family.
2. Bấm **Mở để chỉnh sửa** để đưa bộ chữ vào tab **Tạo font mới**. Giữ nguyên tên khi muốn cập nhật kiểu đó.
3. Mở **Chỉnh dấu** ở Bộ ký tự; chọn phạm vi, tăng khoảng hở hoặc scale dấu. Xem trước rồi áp dụng. Hoàn tác khi chưa hợp mắt.
4. Kiểm các dấu kép và cặp râu ngoài bộ xem trước tối đa sáu chữ. Nút hiện tại dịch/scale nhóm contour dấu rời, chưa tự sửa khoảng giữa hai tầng dấu và không tách dấu đã hàn vào thân.
5. Xuất TTF để kiểm, rồi quay bộ sưu tập bấm **Lưu font đang làm**. Xác nhận style vẫn ở đúng family.

## Điểm nối khi sửa mã

- `site/mark-spacing.js`: chỉnh contour dấu rời, giữ advance. Khi thay thuật toán, kiểm dấu trên, dấu dưới, counter thân, râu và dấu hàn vào thân.
- `site/vietnamese.js`: ghép chữ Việt và dấu. Không ghi đè glyph nhập đã được người dùng sửa nếu chưa được yêu cầu.
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
