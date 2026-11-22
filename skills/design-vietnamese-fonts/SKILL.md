---
name: design-vietnamese-fonts
description: Thiết kế, Việt hóa, sửa và kiểm tra font tiếng Việt trong Xưởng Font; dùng khi dựng chữ từ ảnh, thêm dấu, sửa dấu sát thân chữ, cân râu ơ ư, sửa Đ đ, tạo family Light/Bold hoặc chuẩn bị bộ font để xuất. Giữ phong cách mẫu, phân biệt chỉnh dấu với kerning và kiểm tra file xuất thực tế.
---

# Thiết kế font Việt cho Xưởng Font

Đọc [quy tắc thiết kế](references/design-rules.md) trước khi sửa hình chữ. Dùng [chuẩn đo dấu](references/mark-standards.md) khi cần số cụ thể: cỡ, độ dày, khoảng hở, nặng, râu theo từng loại font. Trước khi dựng dấu, phân loại font nét đều, sans thường hay thanh-đậm bằng độ tương phản nét; dấu phải theo đúng loại đó. Đọc [luồng Xưởng Font](references/xuong-font-workflow.md) để nối thao tác với ứng dụng. Dùng [bộ thử](references/proof-corpus.md) khi kiểm tra kết quả. Đọc [kiểm tra bộ chữ](references/checking-coverage.md) khi phân tích font mới hoặc font thành phẩm.

## Quy trình bắt buộc: dựng theo quy tắc → tự đối chiếu → sửa quy tắc

1. **Dựng theo quy tắc:** mọi bước tạo/sửa (Tạo dấu tiếng Việt, Việt hóa, Tạo family) dựng từ số đo trong [chuẩn đo dấu](references/mark-standards.md), không sửa tay từng góc chữ.
2. **Tự đối chiếu ngay sau khi dựng:** Xưởng đo lại chữ vừa dựng bằng đúng phép đo đã dùng để lập chuẩn (`scripts/lib/mark-metrics.cjs`) và so với khoảng [min–max] của 20 font chuyên nghiệp (`site/mark-ranges.js`, sinh bởi `scripts/build-mark-ranges.cjs`). Kết quả hiện ngay trong dòng trạng thái ("đạt N/M chỉ số. CẦN XEM: ..."), và ở từng kiểu khi Tạo family. Chỉ chấm chữ do Xưởng ghép/dựng; nét của nhà thiết kế và nét lấy từ ảnh không bị chấm.
3. **Lệch chuẩn thì sửa quy tắc dựng, không sửa tay chữ đó:** tìm vì sao luật dựng cho ra số lệch, sửa luật trong `site/vietnamese.js` / `site/font-family.js`, ghi lại trong skill, rồi chạy lại đối chiếu trên các font Windows (`npm run audit:rules` và `npm run check:marks`). Chỉ báo xong khi đối chiếu đạt.

Đối chiếu phải đúng với cả font thiết kế chuẩn: chạy đối chiếu trên dấu gốc của nhà thiết kế; nếu dấu gốc cũng bị báo lệch thì phép đo sai, sửa phép đo. Ví dụ UTM Bebas (chữ hẹp): dấu gốc rộng 0.56–0.89 lần độ rộng chữ, vượt chuẩn theo độ rộng chữ nhưng khớp chuẩn theo x-height, nên độ rộng dấu đạt khi khớp một trong hai.

Ví dụ đã làm theo quy trình này: Ẫ đặt ngã quá thấp (đáy 0.94–1.00 chiều cao mũ, chuẩn 1.04–1.39) → luật hai tầng không hạ dấu thanh nằm trên mũ/trăng xuống dưới 1.04, thu nhỏ dấu thanh thay vào đó. Ọ nặng quá rộng ở font hẹp (0.29, chuẩn ≤ 0.27) → giới hạn bề rộng nặng theo chữ mang dấu. Bold của font hẹp làm nặng nhỏ hơn nét thân (0.65, chuẩn 0.90–2.44) → nặng không nhỏ hơn 0.9 nét thân dù giới hạn theo độ rộng chữ. Family Bold làm hở dấu–thân còn 0.06 → ghép lại mọi chữ có dấu từ thân đã làm đậm và dấu làm đậm 0.27 lần.

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
- Nếu dấu đã dính thân và không phân tách an toàn, ghi rõ ký tự bị bỏ qua. Chỉ dựng lại từ chữ gốc và dấu mẫu khi có đủ dữ liệu đối chiếu; bản dời dấu rời đã qua kiểm lại file xuất được áp dụng thẳng (có hoàn tác); dựng lại hình chữ thì vẫn xem trước.
- Xem trước trước/sau với cùng cỡ, baseline và viewBox. Chỉ ghi vào bộ chữ khi áp dụng. Giữ khả năng hoàn tác. Ngoại lệ theo yêu cầu người dùng (22/11/2026): nút **Hoàn thiện font chữ** áp dụng luôn mọi bước theo quy tắc, không hiện bảng xem trước; một lần Hoàn tác chỉnh dấu quay lại cả lượt.
- Phân biệt khoảng hở thân–dấu với khoảng hở dấu–dấu. Di chuyển cả cụm dấu chỉ sửa được loại thứ nhất.

## Tạo family

Dùng mẫu mặc định 18 vị trí: Thin 100, ExtraLight 200, Light 300, Regular 400, Medium 500, SemiBold 600, Bold 700, ExtraBold 800, Black 900; mỗi mức có kiểu đứng và Italic. Không tuyên bố mọi family đều bắt buộc có đủ 18 kiểu. Đọc độ đậm gốc rồi chọn mốc tương ứng; không mặc định Medium trùng Regular. Kiểu nghiêng tạo bằng shear là bản nháp oblique, không phải thiết kế Italic hoàn chỉnh. Kiểm flags italic, góc nghiêng và metadata khi xuất hoặc sửa lại.

Sinh weight bằng nới/thu nét (offset) làm dấu hai tầng (Ấ, Ẩ) và dấu sát thân (Õ) dính nhau ở kiểu đậm. Xưởng làm hai lượt: đổi độ đậm từng glyph ở dạng đứng; chữ có dấu nào bị dính thì ghép lại từ thân chữ và dấu đã đổi độ đậm, đặt theo chuẩn đo (như Tạo dấu tiếng Việt), rồi mới nghiêng. Nới/thu nét dùng góc nhọn (miter, giới hạn 6 lần độ nới), không bo tròn góc: font góc sắc như UTM Bebas phải giữ góc chân chữ và đỉnh nét ở mọi độ đậm; đường cong vẫn mượt vì đã chia nhỏ. Khi thu mảnh, theo cách nhà thiết kế làm family (đo Bebas Neue Thin/Light/Book/Regular/Bold): **phần đặc ở điểm nối góc hẹp co theo đúng tỷ lệ nét thân**, ở mọi độ đậm: trên khe M ≈ 1.6–1.8 nét thân, trên đỉnh lòng A ≈ 1.15–1.4, dưới khe V ≈ 1.2. Nên mỗi góc lõm hẹp (kể cả đỉnh lòng chữ, là góc lõm của vật liệu dù là góc lồi của lòng) cho mũi nhọn đi sâu theo đường song song, dừng ở chỗ thành nét phía trước bằng thành nét gốc × (nét thân mới / nét thân gốc), không sâu quá 6 lần độ thu; chỗ dừng thu về điểm giữa để góc vẫn nhọn. Không cố giữ điểm nối đứng yên: ở bản mảnh của nhà thiết kế, khe M vẫn lên gần sát đỉnh (Bebas Neue Light: phần đặc chỉ 34/700).

**Chuẩn kiểu mảnh (không đạt thì không tạo):** nếu một chữ cái hoặc số phải cắt mũi góc hẹp và đoạn cắt rộng hơn nửa nét thân đã thu (cạnh xiên lệch thấy rõ, nét hình nêm), font này không làm được độ đậm đó: báo "Không đạt chuẩn ..." kèm các chữ và bỏ kiểu đó. Family không cần đủ 18 kiểu. UTM Bebas: Thin không đạt (6 9); ExtraLight, Light đạt với phần đặc ở khe M 1.8, lòng A 1.15, khe V 1.2 lần nét thân, đúng tỷ lệ Bebas Neue.

**Xác định độ đậm thật của font gốc trước khi tạo family:** so nét thân / chiều cao chữ hoa. UTM Bebas có số đo trùng khớp Bebas Neue **Bold** (nét 110/700, advance H 427, M 541, A 407, O 396) dù file ghi 400. Xưởng sinh mức đậm theo độ nới cố định từ mức gốc ghi trong file, nên "Thin" sinh từ UTM Bebas (nét 70) chỉ mảnh cỡ Bebas Neue Book; Light thật của Bebas Neue có nét 22, Thin 10. Báo rõ điều này khi người dùng so với family gốc. Chưa tự đổi mức gốc theo số đo: thử tính nét đích theo độ đậm thật (nét Regular × hệ số độ đậm) thì Light của UTM Bebas mảnh tới mức cổ nét số 3, 5 (chỗ nối thân với bụng, chỉ ~½ nét thân) đứt rời, vì thu đều trừ cùng một lượng ở nét dày và nét mảnh; nhà thiết kế thu theo tỷ lệ từng phần. Vá cổ nét bằng cách thu nửa lượng ở phần mảnh để lại vết nứt mảnh trong nét 6, 9: không dùng. Muốn đạt Light/Thin thật cần thu nét theo tỷ lệ độ dày tại chỗ (theo đường tâm nét), chưa có trong Xưởng.

Khi thu mảnh mạnh, mẩu rời nhỏ hơn bình phương nét thân mới (đầu nét nhọn đứt ra) được bỏ, đầu nét chỉ ngắn lại; không làm cả kiểu thất bại. Khi làm đậm, mũi nhọn nào làm dính nét thì chỉ cắt riêng mũi đó ở 2 lần độ nới. Cuối cùng mới bo tròn glyph đó. Nếu cả bo tròn cũng bít lòng chữ (5 6 9 G S của Bebas ở Black, Đ ở ExtraBold) thì mức đậm đó vượt quá thiết kế hẹp, báo thất bại thay vì làm hỏng chữ. Glyph ngoài bộ chữ cần kiểm (.notdef ở #0, ký hiệu ♠ ® ᵏ, chữ ngoại Ǻ Ⱥ) và dấu câu (* % " !) hỏng khi đổi độ đậm thì giữ nét gốc và ghi rõ trong kết quả, không bỏ cả kiểu. Bước đối chiếu của family chỉ chấm chữ Xưởng ghép lại; chữ chỉ được nghiêng (Italic) giữ nét nhà thiết kế. Chữ cái không dấu, số, dấu câu mất lòng chữ hoặc dính nét (chân serif h của Times khi rất đậm) vẫn làm kiểu đó thất bại.

Bề dày dấu của từng kiểu theo [chuẩn đo dấu](references/mark-standards.md#bề-dày-theo-độ-đậm): dấu ≈ min(20 + 0.27 × thân, 0.75 × thân), giữ tỷ lệ riêng của nhà thiết kế (dấu mới = dấu gốc × f(thân mới) / f(thân gốc)). Tính riêng cho từng chữ: đo bề dày dấu của chính chữ đó, không đổi cùng một độ cho mọi dấu. Đổi cùng một độ làm dấu dày (trăng, mũ của UTM Bebas) nặng gần bằng thân ở Thin, còn dấu mảnh (móc hỏi) gầy hẳn: nét không đều. Khi thu mảnh, phóng dấu về lại chiều cao cũ quanh tâm nhưng không rộng hơn bản gốc (Segoe UI Light so với Regular: cao dấu chỉ giảm ~8%), rồi đo lại bề dày thật và chỉnh đến đúng mức trên. Dấu nặng là chấm đặc, không thu mảnh. Dấu dẹt rộng (ngã của UTM Bebas) vẫn thấp đi khi thu mảnh vì không được rộng thêm; đối chiếu sẽ báo chiều cao.

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

## Chữ cái gốc còn thiếu

Dựng từ bộ phận của chữ đã có như nhà thiết kế (n → h m u r, o + thân → b d p q, o → c e, E → F L, P → R, O → Q C, V → W, 6 ↔ 9, l ↔ I, l → i), chỉ điền ô trống, ghi là suy luận để duyệt. Không tự vẽ chữ không có bộ phận để mượn. Bảng cách dựng và bộ chữ mẫu tối thiểu: `references/xuong-font-workflow.md`.

## Hoàn thiện font theo quy tắc

Nút "Hoàn thiện font chữ" chạy: chiều cao (chân phẳng đúng đường chân, đỉnh phẳng cùng nhóm bằng nhau; lệch nhỏ sửa, lệch lớn coi là cố ý), cỡ dấu câu dựng từ thông số của chính font (dấu chấm bằng chấm chữ i, không có chấm i thì bằng nét thân; chấm của : ; ! ? và dấu nặng bằng dấu chấm; không tham khảo font khác), viền không xù và đường cong không gấp khúc (đo xù/đoạn ngắn/gần đứng-ngang/gấp khúc, nắn tăng dần tới khi hết lỗi, cho mọi nét không phải font vẽ sẵn), bổ sung chữ/dấu/ký tự, kerning cặp tiếng Việt có tính dấu (chỉ font Xưởng dựng; file nhập giữ kerning gốc). Áp dụng luôn (không bảng xem trước), rồi kiểm file và sửa khoảng dấu; một lần Hoàn tác chỉnh dấu quay lại cả lượt. Chỉ áp cho nét dò ảnh và chữ suy luận; font vẽ sẵn giữ nguyên thiết kế. Chi tiết số liệu: `references/xuong-font-workflow.md`.
