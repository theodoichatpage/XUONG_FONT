# Kiểm tra bộ chữ tiếng Việt

Nguồn đối chiếu tính năng: https://colorme.vn/tools/vietnamese-font-check . Xưởng triển khai bộ đọc và kiểm tra trực tiếp, không nhúng hoặc gửi file sang ColorME. Giữ liên kết để người dùng kiểm chéo độc lập.

## Hai nơi sử dụng

- Dưới Thử tiêu đề: đánh giá file vừa xuất từ font đang làm, xem lỗi rồi chỉnh dấu/cân nét tiếp.
- Tab Kiểm tra font tiếng Việt: nhận file mới hoặc font thành phẩm mà không cần cài vào máy. Báo cáo và câu xem thử tách riêng với trình sửa. Chỉ đưa font vào trình sửa khi người dùng bấm Mở font này để chỉnh sửa; việc kiểm không tự thay bộ chữ.

## Bộ 146 ký tự

Tạo đủ sáu thanh cho 12 nguyên âm a ă â e ê i o ô ơ u ư y, ở cả hai trường hợp hoa/thường; thêm Đ và đ. Dùng NFC để loại trùng; xác nhận đúng 146 mã khác nhau. Không tự thêm thanh vào Đ/đ.

Phân biệt bốn trạng thái:

1. Có glyph: cmap trỏ tới glyph có outline; chưa chứng minh đúng hình hoặc đẹp.
2. Thiếu: không có glyph ghép sẵn và không đủ thành phần NFD để thử.
3. Rỗng: có mã trong cmap nhưng không có nét.
4. Có thành phần ghép: không có glyph NFC, nhưng chữ gốc và mọi dấu NFD có nét. Đây là khả năng ghép chưa xác minh, không tính là đạt shaping.

Giữ chữ thiếu hiển thị rõ; không lấy font dự phòng để che trong câu mẫu. Xem riêng mã Đ U+0110, đ U+0111, tránh nhầm Ð U+00D0. Kiểm lại file thành phẩm sau xuất và từng kiểu trong family, không suy từ Regular sang toàn bộ 16 kiểu.

## Giới hạn và bằng chứng

Bộ đọc hiện kiểm TTF, OTF, WOFF. WOFF2 cần chuyển sang TTF/OTF tương ứng; phải báo giới hạn, không giả vờ đã đọc được. File tối đa 30 MB trong giao diện kiểm độc lập. Việc kiểm chạy trên trình duyệt, không cài font hệ thống. Kiểm cmap/outline không chứng minh đầy đủ GPOS/GSUB hoặc định vị dấu NFD; cần thử hiển thị và ứng dụng. Không dùng kết quả đủ 146 glyph để khẳng định chất lượng thẩm mỹ, quyền thương mại hoặc mức sẵn sàng bán font.

Chạy `npm run check:quality` khi thay logic kiểm: có các ca glyph thiếu, glyph rỗng, thành phần ghép chưa xác minh, bảng 146 duy nhất, WOFF và các phép đo outline.
