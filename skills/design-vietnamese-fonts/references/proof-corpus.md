# Bộ thử của Xưởng Font

Dùng các chuỗi tự xây dựng dưới đây, không coi chúng là bộ mẫu được trích từ sách. Giữ cùng nội dung khi so các kiểu.

## Bao phủ dấu

```
a à á ả ã ạ | ă ằ ắ ẳ ẵ ặ | â ầ ấ ẩ ẫ ậ
e è é ẻ ẽ ẹ | ê ề ế ể ễ ệ | i ì í ỉ ĩ ị
o ò ó ỏ õ ọ | ô ồ ố ổ ỗ ộ | ơ ờ ớ ở ỡ ợ
u ù ú ủ ũ ụ | ư ừ ứ ử ữ ự | y ỳ ý ỷ ỹ ỵ
A À Á Ả Ã Ạ | Ă Ằ Ắ Ẳ Ẵ Ặ | Â Ầ Ấ Ẩ Ẫ Ậ
E È É Ẻ Ẽ Ẹ | Ê Ề Ế Ể Ễ Ệ | I Ì Í Ỉ Ĩ Ị
O Ò Ó Ỏ Õ Ọ | Ô Ồ Ố Ổ Ỗ Ộ | Ơ Ờ Ớ Ở Ỡ Ợ
U Ù Ú Ủ Ũ Ụ | Ư Ừ Ứ Ử Ữ Ự | Y Ỳ Ý Ỷ Ỹ Ỵ
D Đ d đ Ð | ƯƠ ươ ƯT ƠT ưt ơt
```

## Nhịp chữ và nhiều dòng

```
BỘ SƯU TẬP FONT — NGUYỄN HỮU ĐẠT
Trường học giữ gìn tiếng Việt mỗi ngày.
Những người thợ dựng chữ ở xưởng mới.
Đường phố rực rỡ dưới nắng buổi sớm.
Vì Kỳ Tù TỪ VỪA KỀ | Th Ph Ki Kh kh ow 23
```

## Ma trận xác nhận

- Chạy mọi style đã tạo; ưu tiên Ultra Light, Regular và Bold để tìm hai đầu rủi ro.
- Với font văn bản, xem ở 12/16/24 px; với font tiêu đề, thêm 48/72/120 px. Đây là cỡ kiểm thử của dự án, không phải ngưỡng từ nguồn.
- So cả chuỗi NFC và kết quả `text.normalize('NFD')`. Ghi rõ thiếu glyph combining hay thiếu shaping.
- So baseline bằng đường chuẩn chung, kiểm ascender/descender của file xuất và hai dòng sát nhau.
- Ghi `pass`, `warning`, `fail` hoặc `not-tested`; không dùng một điểm số thay cho bằng chứng.

## Đ/đ, dấu câu và tiền tệ

```
Đ đ D d | Ỵ ỵ Y y | Ỷ ỷ ? !
20₫ 100₫ 30₫ | 20 đ | 1.234.567₫
```

Phân biệt glyph ₫ với chữ đ trong lời văn; kiểm U+20AB thực tế. Nếu bộ ký tự ứng dụng chưa có ô ₫, báo thiếu giao diện/coverage đó thay vì tuyên bố đã tạo ký hiệu.
