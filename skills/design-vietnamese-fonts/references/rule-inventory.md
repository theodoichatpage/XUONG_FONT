# Bảng kê quy tắc của skill trong Xưởng

Soát lần cuối: 25/11/2026. Mỗi dòng: quy tắc, nơi Xưởng thực hiện, cách kiểm. **Tự sửa** = Xưởng tự đưa về đúng; **Báo** = chỉ đối chiếu và báo; **Hướng dẫn** = việc người dùng hoặc người sửa mã tự làm, máy không chấm được. Sửa skill thì sửa dòng tương ứng ở đây.

## 1. Bảng quy tắc tự động (`site/rule-check.js`, chạy sau mọi thao tác dựng)

| Mã | Quy tắc | Mục skill | Xưởng làm | Kiểm |
| --- | --- | --- | --- | --- |
| dot-i | Dấu chấm rộng bằng chấm chữ i (không có thì nét thân) | workflow 1b | Tự sửa | check:rules |
| colon-dots | Chấm của : ; ! ? bằng dấu chấm, giữ khoảng hở gốc | workflow 1b | Tự sửa | check:rules |
| dot-below | Dấu nặng bằng dấu chấm | workflow 1c, mark-standards Dấu nặng | Tự sửa | check:rules |
| punct-place | . , : ; ! ? ngồi đường chân; ngoặc kép đỉnh ngang chữ hoa | workflow 1b | Tự sửa | check:rules |
| heights | Chân phẳng đúng đường chân, đỉnh phẳng cùng nhóm | workflow 1 | Tự sửa (lệch nhỏ) | check:rules |
| horn | Râu liền thân, mọc từ mép phải vùng trên | design-rules Phân loại dấu, mark-standards Chỗ nối râu | Hoàn thiện ghép lại | check:rules mục 5–7 |
| horn-pair | Đầu râu ư, ơ cao bằng nhau (≤ 20/1000 em) | design-rules mục 5 | Báo | check:rules |
| outline | Viền không xù, cong không gấp khúc | workflow 2 | Hoàn thiện nắn | check:outline |
| marks | Dấu Xưởng ghép nằm trong khoảng chuẩn 20 font | mark-standards | Hoàn thiện ghép lại chữ lệch | check:marks |
| coverage | Đủ bộ ký tự (cả ₫) | checking-coverage | Hoàn thiện bổ sung | check:quality |

## 2. Dựng dấu (`site/vietnamese.js`, `site/mark-standards.js`)

| Quy tắc | Mục skill | Trạng thái |
| --- | --- | --- |
| Thứ tự nguồn dấu: dấu vẽ trong chữ của ảnh (cả râu) → bảng dấu → dựng từ nét; font nước ngoài: dấu nhà thiết kế trước | mark-standards Nguồn hình cho dấu | Có; check:rules mục 2b, 6 |
| Cỡ, rộng, dày, hở từng dấu theo x-height, chữ o, nét thân | mark-standards bảng dấu | Có; check:marks |
| Chữ hoa: dấu 97%, hở 0.105 x-height | mark-standards Chữ hoa | Có; check:marks |
| Hai tầng dấu (ấ ầ ẩ ẫ ắ…) | mark-standards Hai tầng | Có; check:marks |
| Độ tương phản đo theo pháp tuyến nét o (đúng cả font trục nét nghiêng như Migra) | mark-standards Nét đều hay thanh-đậm | Có (25/11/2026); check:rules mục 8, check:marks |
| Độ thon theo độ tương phản (sắc/huyền, mũ, ngã, hỏi, râu) | mark-standards Nét đều hay thanh-đậm | Có |
| Đầu nét: râu theo đầu tay r (giọt nước; mũi vát sắc → râu đầu vát: chân thanh, đầu trên đậm cắt chéo, xiên dốc, ư ơ cùng một nét râu) và đầu l (tròn, nét đơn) | mark-standards Kiểu đầu nét | Có (25/11/2026); check:rules mục 7, 8 |
| Ký tự đặc biệt theo kiểu nét (thanh-đậm: nét ngang mảnh, ngoặc thon hai đầu, % thanh-đậm; nét đều giữ đều) | mark-standards Nét đều hay thanh-đậm | Có (25/11/2026, `derive-symbols.js`); check:rules mục 8 |
| Hoàn thiện dựng lại dấu Xưởng dựng từ nét (chưa khóa, chưa duyệt) khi quy tắc cho hình khác; đầu râu lưu có phiên bản | mark-standards Nét đều hay thanh-đậm | Có (25/11/2026); check:rules mục 8 |
| Râu: độ vươn, độ cao đầu, chỗ nối, advance lấn lề phải | mark-standards Râu ơ ư | Có; check:rules, compare-horn-spacing |
| Nặng tránh đuôi y; ị phân biệt chấm i và nặng | design-rules mục 9, bảng chi tiết | Có |
| Chữ nghiêng: dấu nghiêng theo chữ, dịch theo trục | mark-standards Chữ nghiêng | Có |
| Font toàn chữ hoa: x-height quy đổi, chấm theo chuẩn hoa | mark-standards Font toàn chữ hoa | Có; check:rules (UTM Bebas) |
| Đ/đ: gạch đủ đọc, không vươn quá xa | design-rules bảng chi tiết | Có (`deriveBarredD`) |
| ₫ = đ thu 0.7 + gạch dưới, cao ngang số | design-rules bảng chi tiết | Có (25/11/2026, `derive-symbols.js`) |

## 3. Dựng chữ và nét (`site/reference-image.js`, `site/derive-letters.js`, `site/app.js`)

| Quy tắc | Mục skill | Trạng thái |
| --- | --- | --- |
| Tách tay: bỏ mẩu chạm mép, Otsu, không bào mòn, giữ nét mảnh, bỏ hạt nhiễu | workflow Tách thủ công | Có |
| Dấu phẩy phải có đuôi; cắt đuôi thì không lưu | workflow Tách thủ công | Có |
| Dấu câu cỡ theo ảnh, đối chiếu chấm i, đặt theo thông số font | workflow Tách thủ công | Có |
| Chữ cái thiếu dựng từ bộ phận (không chép l ↔ I) | SKILL.md Chữ cái gốc còn thiếu | Có |
| Kerning tiếng Việt có tính dấu, chỉ font Xưởng dựng | workflow 4, design-rules 3–4 | Có |
| Nét ảnh chỉ dời, co ≤ 5%, nắn nhẹ; chữ khóa, chữ duyệt giữ nguyên | workflow Hoàn thiện | Có |

## 4. Family (`site/font-family.js`)

| Quy tắc | Trạng thái |
| --- | --- |
| 18 vị trí, độ đậm gốc đo thật, kiểu không làm được bị làm mờ | Có; check-family, check:rules mục 3 |
| Nới/thu nét góc nhọn, góc lõm hẹp theo tỷ lệ nét | Có; check-family |
| Chữ có dấu giữ hệ dấu font gốc, râu không đứt, cỡ hỏi ±12% | Có; check:rules mục 4 |
| Bề dày dấu theo độ đậm, tính riêng từng dấu | Có |

## 5. Kiểm trước xuất (`site/font-quality.js`)

| Quy tắc | Trạng thái |
| --- | --- |
| 146 ký tự, NFC/NFD, cmap Đ đ, metadata, đọc lại file xuất | Có; check:quality |
| Va chạm trong cả từ (cặp thử) | Báo (đo giao outline cặp thử), không tự sửa |

## 6. Còn thiếu hoặc chỉ là hướng dẫn

- **Hòa hợp cho dấu hỏi, ngã:** mới theo độ thon của tương phản; chưa gắn đầu nét giọt nước/vuốt nhọn như râu.
- **Chữ viết nối nét** (u, o có nét nối chìa lên phải): râu dựng vẫn bám vào nét nối; cần ảnh mẫu ư/ơ.
- **Cặp râu Ư Ơ hoa:** không chấm (font chuẩn không thống nhất).
- **Thu nét theo tỷ lệ độ dày tại chỗ** (Light/Thin thật cho font hẹp): chưa có (SKILL.md Tạo family).
- **Va chạm dấu với chữ trước/sau** (design-rules mục 2): chỉ báo, chưa tự sửa.
- **Mở font từ Bộ sưu tập** tự ghép chữ có dấu nhưng không chạy bảng quy tắc; bấm Tạo dấu tiếng Việt hoặc Hoàn thiện để sửa.
- Hướng dẫn, máy không chấm: xác định đầu vào, chọn đúng loại sửa, xem ở nhiều cỡ, thử cài font thật, báo kết quả, không tự nhận đạt chuẩn thương mại, bộ thử (`proof-corpus.md`).
