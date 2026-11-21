# Quy tắc hình chữ Việt

Nguồn: Donny Trương, Vietnamese Typography, [Design Challenges](https://vietnamesetypography.com/design-challenges/), cùng ảnh chụp trang do người dùng cung cấp ngày 19/11/2026. Đọc thêm [Diacritical Details](https://vietnamesetypography.com/diacritical-details/), [Modified Letters](https://vietnamesetypography.com/modified-letters/) và [Tone Marks](https://vietnamesetypography.com/tone-marks/). Đây là diễn giải để làm việc trong Xưởng Font, không sao chép ảnh minh họa hoặc biến khuyến nghị thị giác thành tiêu chuẩn số cố định.

## Chín nhóm kiểm tra từ trang và ảnh chụp

1. **Vị trí:** chọn một hệ đặt sắc/huyền/hỏi quanh mũ; có thể đặt bên phải, chia hai phía hoặc xếp trên. Bố cục bên phải hỗ trợ sự nhất quán; không coi đó là phương án bắt buộc. Xếp trên cần kiểm chiều cao dòng.
2. **Va chạm:** nhìn cả từ. Trong ví dụ Bất/đồng, dấu có thể đúng với nguyên âm nhưng vẫn đâm vào t hoặc đ kế bên. Kiểm va chạm với cả chữ trước lẫn sau.
3. **Kerning có dấu:** đo khoảng trống của cả hình chữ và dấu. Các cặp như Vì, Kỳ, Tù có thể cần điều chỉnh khác chữ không dấu. Không lấy kerning của chữ gốc làm bằng chứng rằng bản có dấu đã ổn.
4. **Kerning râu:** nhìn ƯT và ƠT. Râu quá vươn làm xuất hiện khoảng hở lớn; siết khoảng cách quá mức lại che râu. Ưu tiên xem lại độ vươn hình râu trước khi ép cặp chữ. Advance của ơ ư không cộng đủ đoạn râu: râu lấn sang lề phải (lề phải thường âm), để "ươ", "ưn" thưa xấp xỉ "uo", "un".
5. **Cặp râu:** đối chiếu ƯƠ và ươ trong cùng hàng. Giữ ngôn ngữ hình dáng và độ cao đầu râu tương hợp; không lấy một râu in hoa thu nhỏ máy móc làm mặc định cho chữ thường.
6. **Kích thước/độ đậm:** dấu phải đọc rõ ở weight đang xét. Nhìn bộ thử có hỏi, sắc, mũ ở Bold/Black; tránh dấu yếu so với thân hoặc dày thành một khối. Thu nhỏ dấu không tự đồng nghĩa với cân nét.
7. **Hòa hợp:** nối phong cách dấu với tương phản, góc nét, đầu nét và nhịp của font. So khoảng hở theo thị giác; không chỉ cân bằng bounding box.
8. **Chữ hoa:** giữ dấu đọc được trong chiều cao dòng. Có thể chỉnh riêng kích thước và góc của dấu hoa. Khoảng hở có thể chặt hơn chữ thường nhưng dấu rời không được dính vào thân.
9. **Chữ i:** dấu thanh cần rõ. Cách bỏ chấm i trong nhiều font số là quy ước người đọc đã quen; không tự thêm chấm trở lại hàng loạt. Với ị, phân biệt chấm i phía trên và dấu nặng phía dưới.

## Phân loại dấu để tránh sửa nhầm

- Dấu sắc/huyền/hỏi/ngã là dấu thanh phía trên; nặng ở dưới. Ngang không thêm dấu.
- Mũ của â/ê/ô và trăng của ă là dấu cấu tạo tách rời; có thể còn một dấu thanh khác bên trên.
- Trăng phải nhận ra là cung cong, không biến thành góc nhọn của caron.
- Râu của ơ/ư là phần nối vào thân; gạch của Đ/đ cũng vậy. Không dùng nút tăng khoảng hở dấu để tách chúng khỏi chữ.
- Với ậ/ặ/ệ/ộ, có cả dấu cấu tạo trên và dấu nặng dưới. Với ợ/ự, giữ râu và chỉ chỉnh dấu thanh cần thiết.

## Các mức số do Xưởng Font chọn để thử

Số đo cỡ, độ dày, khoảng hở, nặng và râu từ 20 font đã Việt hóa nằm ở [chuẩn đo dấu](mark-standards.md); dùng số đó trước các mức dưới đây. Không lấy số nào làm kết luận từ trang nguồn:

- Chuẩn hóa việc đo sang UPM 1000.
- Thử tăng khoảng hở thêm 20 đơn vị, sau đó so trước/sau; cỡ dùng nhỏ có thể cần mức khác.
- Thử scale dấu 90–110% trước khi mở rộng lựa chọn; scale không phải phép cân độ dày nét độc lập.
- Xem riêng mũ–sắc, mũ–huyền, mũ–hỏi, mũ–ngã; không chỉ đo dấu dưới cùng với thân.
- Bounding box chỉ giúp tìm ứng viên. Xác nhận giao nhau bằng outline/raster khi cần kết luận va chạm; đừng báo lỗi chắc chắn chỉ vì hai hộp chồng lên nhau.

## Chi tiết từ ảnh chụp Diacritical Details

Dùng khi vẽ hoặc duyệt từng bộ dấu; xét hình mẫu thực tế thay vì áp một kiểu serif/sans chung:

| Thành phần | Điều cần duyệt |
| --- | --- |
| Sắc và huyền | Giữ hình thức tương ứng theo hai hướng; đầu dưới thường hẹp hơn đầu trên. Kiểm góc nghiêng và phần vượt ngang ở hoa/thường riêng. |
| Mũ | Giữ hình chevron có tương phản nét hợp font. Có thể điều chỉnh khi đi cùng sắc/huyền/hỏi/ngã; kiểm độ rộng theo nguyên âm. Không dùng caron thay mũ. |
| Trăng | Giữ đáy cong, phần đáy có trọng lượng hợp thân; hai đầu không biến thành góc nhọn. Cần khoảng hở với a và với dấu thanh tầng trên. |
| Râu | Nối ở vùng trên bên phải o/u. Vị trí nối có thể khác theo thiết kế; xét độ cân của chữ hoàn chỉnh và sự tương hợp ơ/ư. |
| Hỏi | Giữ dấu hỏi thanh gọn, khác dấu câu hỏi nguyên chiếc; kiểm đoạn móc/đuôi nhỏ ở cỡ sử dụng. Khi có mũ/trăng, đặt hỏi thành tầng dấu thanh rõ ràng. |
| Ngã | Giữ nhịp uốn, nét giữa và hai đầu hợp tương phản của font; không biến thành một vệt răng cưa hoặc đường trang trí tùy ý. |
| Nặng | Canh theo khối thân chữ, có thể đối chiếu dấu chấm và chấm i về độ lớn. Với y, xem lại vị trí ngang để tránh đuôi y; không ép tâm hình học nếu gây đụng. |
| Đ/đ | Giữ gạch đủ đọc ở cỡ nhỏ và không vươn ngang quá xa. Với Đ, xét vị trí gạch trong cap-height; với đ, xét khoảng giữa x-height và ascender. Đối chiếu độ vươn hai bên theo mẫu, không biến Đ thành D có một dấu nổi phía trên. |
| ₫ | Dùng ký tự đồng U+20AB: hình đ và gạch dưới của ký hiệu tiền tệ. So tương quan với số, baseline và dòng giá; không thay bằng đ thường hoặc dấu gạch ghép bằng văn bản. |

Không mặc định mọi dấu có cùng tỷ lệ ở mọi chữ. Ưu tiên cùng ngôn ngữ thiết kế, còn vị trí và kích thước có thể cần biến thể quang học cho hoa, thường, mũ kép và các weight.
