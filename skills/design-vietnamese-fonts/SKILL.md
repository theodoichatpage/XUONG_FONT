---
name: design-vietnamese-fonts
description: Thiết kế, Việt hóa, sửa và kiểm tra font tiếng Việt trong Xưởng Font; dùng khi dựng chữ từ ảnh, thêm dấu, sửa dấu sát thân chữ, cân râu ơ ư, sửa Đ đ, tạo family Light/Bold hoặc chuẩn bị bộ font để xuất. Giữ phong cách mẫu, phân biệt chỉnh dấu với kerning và kiểm tra file xuất thực tế.
---

# Thiết kế font Việt cho Xưởng Font

Đọc [quy tắc thiết kế](references/design-rules.md) trước khi sửa hình chữ. Dùng [chuẩn đo dấu](references/mark-standards.md) khi cần số cụ thể: cỡ, độ dày, khoảng hở, nặng, râu theo từng loại font. Trước khi dựng dấu, phân loại font nét đều, sans thường hay thanh-đậm bằng độ tương phản nét; dấu phải theo đúng loại đó. Đọc [luồng Xưởng Font](references/xuong-font-workflow.md) để nối thao tác với ứng dụng. Dùng [bộ thử](references/proof-corpus.md) khi kiểm tra kết quả. Đọc [kiểm tra bộ chữ](references/checking-coverage.md) khi phân tích font mới hoặc font thành phẩm.

## Xác định đầu vào

1. Phân loại: ảnh chữ mẫu, file font, hay một kiểu trong family đang sửa.
2. Ghi tên family, style, weight, UPM, baseline, cap-height, x-height, advances, bảng mã và đường nét gốc trước khi đổi.
3. Chọn chữ neo có bằng chứng từ mẫu. Đánh dấu chữ suy đoán; không gọi phần suy đoán là bản sao đã được xác minh.
4. Nếu nhiệm vụ là đọc, đo hoặc viết quy tắc, không tự tạo ảnh. Chỉ gọi tạo ảnh khi đó là một bước cần thiết đã được người dùng yêu cầu.

## Chọn đúng loại sửa

| Hiện tượng | Can thiệp |
| --- | --- |
| Dấu sát thân chữ | Khoảng hở dấu–thân, vị trí neo, kích thước dấu |
| Sắc/huyền/hỏi/ngã chạm mũ/trăng | Khoảng hở giữa hai tầng dấu, vị trí ngang của dấu thanh |
| Cả cụm dấu quá nặng hoặc nhỏ | Kích thước và độ dày dấu; không đổi nét thân chữ |
| ƯT, ƠT hoặc dấu chạm chữ kế tiếp | Hình râu, độ vươn, sau đó kiểm tra kerning cặp |
| "hương", "ưng" thưa ở chỗ râu | Advance của ơ ư: râu lấn sang lề phải, chỉ cộng 0.2 × đoạn râu chìa ra cho ư Ư, 0 cho ơ Ơ ([chuẩn đo](references/mark-standards.md#râu-ơ-ư)) |
| Khoảng cách giữa hai chữ sai | Sidebearings, advance và kerning; không dịch dấu để che lỗi |
| Chữ Đ hiện thành font khác | Bảng mã/cmap và glyph xuất; không vẽ lại Đ trước khi kiểm tra mã |
| Dấu bị cắt ở đầu dòng | Vertical metrics và vùng hiển thị; không tự thu nhỏ cả font |

## Dựng và chỉnh

- Tách quyết định về thân chữ, dấu cấu tạo và dấu thanh. Giữ râu ơ/ư, gạch Đ/đ gắn với thân.
- Chọn hệ vị trí dấu phù hợp mẫu; áp dụng nhất quán, không bắt mọi thiết kế dùng một vị trí cứng.
- Dùng chỉnh quang học khi tâm hình học không hợp mắt. Không kéo giãn chữ gốc chỉ để chứa dấu.
- Khi sửa dấu trong file nhập, giữ nguyên thân chữ, baseline, advance và kerning trừ khi nhiệm vụ yêu cầu sửa chúng.
- Nếu còn cấu trúc component/anchor, sửa tại anchor. Nếu chỉ còn outline, chỉ biến đổi contour đã nhận diện chắc chắn là dấu. Không cắt outline dính thân theo một đường ngang tùy ý.
- Nếu dấu đã dính thân và không phân tách an toàn, ghi rõ ký tự bị bỏ qua. Chỉ dựng lại từ chữ gốc và dấu mẫu khi có đủ dữ liệu đối chiếu; yêu cầu xem trước trước khi thay hình gốc.
- Xem trước trước/sau với cùng cỡ, baseline và viewBox. Chỉ ghi vào bộ chữ khi áp dụng. Giữ khả năng hoàn tác.
- Phân biệt khoảng hở thân–dấu với khoảng hở dấu–dấu. Di chuyển cả cụm dấu chỉ sửa được loại thứ nhất.

## Tạo family

Dùng mẫu mặc định 18 vị trí: Thin 100, ExtraLight 200, Light 300, Regular 400, Medium 500, SemiBold 600, Bold 700, ExtraBold 800, Black 900; mỗi mức có kiểu đứng và Italic. Không tuyên bố mọi family đều bắt buộc có đủ 18 kiểu. Đọc độ đậm gốc rồi chọn mốc tương ứng; không mặc định Medium trùng Regular. Kiểu nghiêng tạo bằng shear là bản nháp oblique, không phải thiết kế Italic hoàn chỉnh. Kiểm flags italic, góc nghiêng và metadata khi xuất hoặc sửa lại.

Kiểm tra lại mỗi weight, không chỉ Regular. Offset làm dày có thể bít counter, nối dấu vào thân, làm dấu nặng quá lớn hoặc tăng độ vươn râu. Đánh dấu kết quả tự động là bản nháp đến khi kiểm tra xong. Giữ cùng tên family, tên style rõ và weight metadata đúng. Không đổi sidebearings toàn bộ để xử lý một va chạm dấu.

## Kiểm tra trước xuất

1. Kiểm tra từng ký tự có trong bộ thử, NFC và chuỗi phân rã NFD. Nếu không hỗ trợ shaping NFD, ghi rõ hạn chế; đừng tuyên bố hỗ trợ chỉ vì có glyph NFC.
2. So toàn bộ cmap đầu vào/đầu ra; giữ mọi mã cùng trỏ một glyph, đặc biệt Đ, đ và các alias.
3. So hình thân chữ và advance trước/sau thao tác chỉnh dấu; chỉ phần được yêu cầu mới đổi.
4. Kiểm tra ở cỡ nhỏ, cỡ sử dụng và cỡ phóng lớn. Xem cặp sát nhau, hai dòng và mọi weight.
5. Đọc lại file TTF/OTF thực tế; kiểm tên family/style/weight, không chỉ nhìn canvas.
6. Thử cài hoặc mở bằng một ứng dụng dùng font thật khi điều kiện cho phép. Phân biệt kiểm tra parser, kiểm tra hiển thị và kiểm tra ứng dụng.

Không tuyên bố đạt chuẩn thương mại, không lỗi va chạm toàn bộ hay giữ mọi tính năng OpenType nếu chỉ kiểm tra ảnh mẫu. Bảo toàn font gốc; nêu các bảng shaping chưa được giữ khi dựng lại file.

## Báo kết quả

Trả ngắn gọn: ký tự/nhóm đã sửa, phép biến đổi, phần bị bỏ qua, kiểm tra đã chạy và cách lưu lại đúng style trong family. Với thông số, nói rõ nguồn: số đo từ font chuyên nghiệp ([chuẩn đo dấu](references/mark-standards.md)) hay mức tự chọn của Xưởng Font; không gọi chúng là con số do tài liệu nguồn quy định.

## Mẫu tham khảo và giới hạn kiểm định

Giữ SVG gốc của tác giả làm minh họa chuẩn tham khảo. Không tự vẽ lại mẫu đúng/sai hoặc tự nhận đã có chuyên gia duyệt. Khi chưa đọc được mã gốc, báo người dùng thay vì phỏng dựng mẫu. Có thể hiển thị outline thực tế của font đang kiểm, nhưng gắn nhãn đối tượng kiểm tra, không coi đó là mẫu chuẩn.

Dùng phép đo để báo thiếu mã, metadata, khoảng gần nhất và giao outline. Ghi rõ đường cong được xấp xỉ khi đo; ngưỡng tùy chọn chỉ là bộ lọc rà soát. Không dùng điểm tự chấm để xác nhận chất lượng thẩm mỹ hoặc khả năng bán font. Không dùng đường nét trong SVG tham khảo làm nguyên liệu sinh font đầu ra.
