# Chuẩn đo dấu tiếng Việt

Số đo từ 20 font chuyên nghiệp đã Việt hóa sẵn trên Windows: Arial, Arial Bold, Times New Roman, Times New Roman Bold, Segoe UI Light, Semilight, Regular, Semibold, Black, Tahoma, Tahoma Bold, Verdana, Verdana Bold, Courier New, Courier New Bold, Calibri Light, Calibri, Calibri Bold, Consolas, Palatino Linotype. Nhóm này gồm sans, serif, mono, từ Light đến Black.

Đây là **số đo thực tế** từ các font đó, không phải quy định của nguồn Vietnamese Typography. Dùng làm điểm khởi đầu và khoảng an toàn khi dựng hoặc duyệt dấu; thiết kế riêng có thể ra ngoài khoảng nếu nhìn tốt hơn. Mỗi ô ghi **trung vị** và khoảng **[min–max]**.

Script đo: `node scripts/measure-vietnamese-marks.cjs [font.ttf ...]`. Số dùng trong code: `site/mark-standards.js`.

## Cách đo

Mọi số là tỷ lệ theo chính font, chuẩn hóa UPM 1000:

- **Nét thân (stem):** bề dày ngang của `l` đo ở 40–60% chiều cao, lấy đoạn hẹp nhất (bỏ chân serif, móc đầu `l` của font mono). Không dùng khung bao của `l`: với serif và mono, khung bao rộng gấp 2–4 lần nét thật.
- **x-height:** đỉnh chữ `x`.
- **Chiều cao, khoảng hở:** chia cho x-height (cả chữ hoa, để so được giữa hai nhóm).
- **Độ rộng dấu:** chia cho độ rộng nguyên âm chứa dấu (o cho chữ thường, O cho chữ hoa).
- **Bề dày nét dấu:** 2 × diện tích / chu vi của contour dấu. Số này thấp hơn bề dày bút thật khoảng 1,5 lần với dấu ngắn, nên chỉ dùng để so dấu với dấu đo cùng cách.

## Dấu thanh và dấu cấu tạo (chữ thường)

| Dấu | Cao / x-height | Rộng / o | Bề dày (2A/P) / nét thân | Hở dấu–thân / x-height |
| --- | --- | --- | --- | --- |
| Sắc, huyền | 0.33 [0.24–0.42] | 0.41 [0.33–0.56] | 0.52 [0.32–0.87] | 0.136 [0.10–0.17] |
| Hỏi | 0.35 [0.30–0.47] | 0.33 [0.28–0.52] | 0.52 [0.25–0.77] | 0.124 [0.08–0.17] |
| Ngã | 0.27 [0.22–0.35] | 0.72 [0.63–0.81] | 0.61 [0.40–0.92] | 0.138 [0.07–0.22] |
| Mũ | 0.33 [0.24–0.41] | 0.64 [0.50–0.73] | 0.56 [0.36–0.91] | 0.133 [0.09–0.17] |
| Trăng | 0.32 [0.23–0.35] | 0.69 [0.60–0.79] | 0.58 [0.42–0.95] | 0.134 [0.09–0.17] |

Huyền là ảnh gương của sắc: cùng cao, cùng rộng, đầu rộng ở trên.

## Chữ hoa

- Dấu hoa cao **gần bằng** dấu thường: trung vị 0.32 so với 0.33 x-height. Thu nhỏ dấu hoa xuống 90% là nhỏ hơn mức các font này dùng; Xưởng dùng 97%.
- Hở dấu–thân chữ hoa chặt hơn: **0.105** [0.06–0.14] x-height.
- So với độ rộng O, dấu hoa hẹp hơn vì O rộng hơn o: mũ 0.52, trăng 0.47, ngã 0.58, sắc 0.32.
- Đỉnh cả chồng dấu hoa (Ấ, Ẩ, Ắ) chạm khoảng **0.96–1.0 em**; chữ thường (ấ, ẩ) **0.81–0.89 em**. Ascender của font phải đủ chỗ.

## Dấu nặng

- Số đo: cỡ (cạnh lớn nhất) bằng **0.88** [0.67–1.0] dấu chấm của chính font. Không font nào trong nhóm dùng dấu nặng to hơn dấu chấm.
- **Xưởng dùng: nặng bằng dấu chấm của chính font** (người dùng chốt 22/11/2026; bảng quy tắc `dot-below`, sai ≤ 10%). Tạo dấu tiếng Việt dựng nặng 0.88 dấu chấm rồi bước sửa theo bảng quy tắc đưa về bằng dấu chấm, như mọi thao tác dựng khác.
- Theo nét thân: **1.21** [0.9–1.75]. Font mảnh có dấu chấm to 2–3,7 lần nét (Segoe Light 1,76; Courier 3,67), nên nặng phải nhỏ hơn dấu chấm nhiều hơn.
- Hở thân–dấu: **0.093** [0.06–0.16] x-height, chặt hơn dấu trên.

## Râu ơ ư

Râu hầu như luôn liền khối với o/u, nên đo theo khung bao:

| Chữ | Độ vươn phải / độ rộng chữ gốc | Đầu râu cao hơn đỉnh thân / x-height |
| --- | --- | --- |
| ơ | 0.09 [0.05–0.27] | 0.14 [0–0.25] |
| ư | 0.27 [0.06–0.40] | 0.16 [0–0.28] |
| Ơ | 0.11 [0–0.20] | 0.09 [0–0.17] |
| Ư | 0.25 [0.08–0.33] | 0.25 [0–0.34] |

Bề dày râu gần bằng nét thân (đo được ở Ư: 0.86–0.92 nét thân). Râu ơ vươn ít vì bụng o đã tròn ra bên phải; râu ư vươn xa hơn vì thân u thẳng đứng.

**Hình râu dựng cho chữ đậm (Bold, Black):** nét râu dày gần bằng nét thân, nên:
- Chân râu nằm gọn trong thân: tâm chân thấp hơn đỉnh u/o ít nhất 0.5 nét thân (chân dày 0.9 nét), để mép trên chân không cao hơn đỉnh thân; nếu không sẽ thành bậc khấc hoặc gờ mỏng ở chỗ nối.
- Đầu râu và độ thon theo nét của chính font: giọt nước, vuốt nhọn, đầu tròn hay cắt bằng, đo trên tay chữ r và thân l theo mục [Kiểu đầu nét](#kiểu-đầu-nét). Không bo tròn râu khi các nét khác của chữ sắc vuông hay vuốt nhọn.
- Đỉnh ngoài của đầu râu chạm đúng độ cao đầu râu theo bảng trên (đầu bo tròn: đường tâm thấp xuống nửa bề dày).

**Chỗ nối râu (mọi râu Xưởng ghép):** chân râu mọc từ mép phải xa nhất của phần trên chữ gốc: đầu chân serif của U (Times, Georgia), vai phải của o/O, mép thân u. Chân cắm vào nét không quá 0.6 nét thân (bảng quy tắc `horn`). Không mọc từ giữa nét dưới chân serif rồi vắt ngang qua nó (lỗi 25/11/2026: râu ảnh cao cố định 130, lùi 12% vào giữa thân). Râu mẫu từ bảng dấu giữ hình người vẽ, co giãn cho khớp độ vươn và độ cao đầu râu ở bảng trên (tỉ lệ ngang/dọc lệch nhau ≤ 1.6 lần).

**Cặp râu ư ơ:** đầu râu cao bằng nhau (font chuẩn: bằng nhau ở 8/12 font đo, lệch ≤ 37 ở số còn lại); bảng quy tắc `horn-pair` chấm cặp Xưởng ghép, lệch ≤ 20/1000 em. Ư Ơ mỗi nhà thiết kế một kiểu (lệch −13 tới 129) nên không chấm.

**Độ rộng (advance) của ơ ư:** râu được phép lấn sang lề phải, không cộng cả đoạn râu vào độ rộng. Font chuyên nghiệp có lề phải của ư thường âm (Segoe −9, Verdana −46, Arial Italic −87), nên khoảng hở "ươ", "ưn" gần bằng "uo", "un". Xưởng cộng thêm 0.2 × đoạn râu chìa ra cho ư Ư, 0 cho ơ Ơ. Lề phải mới không âm quá 0.15 × độ rộng chữ so với lề gốc (Italic: 0.15 + 0.5 × độ nghiêng), để râu không đâm vào chữ kế bên. Cộng đủ cả đoạn râu cộng thêm lề làm "hương", "ưng" thưa hẳn ra.

Kiểm: `node scripts/compare-horn-spacing.cjs` so khoảng hở ươ, ưn, ơn, ƯN giữa bản dựng và bản gốc của 25 font. Khi lập chuẩn, lệch trung vị 0–19/1000 em.

## Bề dày theo độ đậm

Font đậm có dấu nhẹ hơn thân, font mảnh có dấu gần bằng thân. Bề dày đo 2A/P xấp xỉ:

`bề dày dấu ≈ min(20 + 0.27 × nét thân, 0.75 × nét thân)`

| Font | Nét thân | Dấu đo được | Công thức |
| --- | --- | --- | --- |
| Segoe UI Light | 45 | 31 | 32 |
| Segoe UI | 80 | 42 | 42 |
| Arial Bold | 137 | 59 | 57 |
| Segoe UI Black | 208 | 65 | 76 |

Khi Tạo family, áp công thức cho từng dấu (dấu mới = dấu gốc × f(thân mới) / f(thân gốc)), không đổi cùng một độ cho mọi dấu: UTM Bebas Thin đổi cùng độ làm trăng 0.9 thân, móc hỏi chỉ 0.5. Thu mảnh giữ chiều cao dấu (không rộng hơn bản gốc); nặng giữ cỡ.

Không dùng một tỷ lệ cố định với nét thân (ví dụ 0,82): như vậy dấu font Black sẽ quá nặng và dấu font Thin quá mảnh hoặc bị chặn sàn quá dày.

## Nét đều hay nét thanh-đậm

Phân tích trước khi dựng dấu. **Độ tương phản** = bề dày mảnh nhất chia dày nhất của nét chữ o, **đo theo pháp tuyến của nét** (khoảng cách từ mỗi điểm viền trong tới viền ngoài), không chỉ cắt dọc/ngang ở giữa. Font có trục nét nghiêng (Migra: chỗ mảnh nhất ở góc ~−57°, đỉnh o lại dày hơn hai bên) cắt ở giữa sẽ đo nhầm thành nét đều (Migra Extralight 0.99, đo đúng 0.29; lỗi 25/11/2026). Đo theo pháp tuyến cho cùng số với bảng dưới: Times 0.32, Arial 0.80, Segoe UI 0.82, Courier 0.98, Palatino 0.32, Verdana 0.83.

| Nhóm | Độ tương phản | Ví dụ |
| --- | --- | --- |
| Nét đều (monoline) | 0.9–1.0 | Courier New 0.98, Poppins |
| Sans thường | 0.67–0.87 | Segoe UI 0.82, Arial 0.80, Verdana 0.83 |
| Thanh-đậm (serif có tương phản) | 0.2–0.35 | Times 0.33, Times Bold 0.23, Palatino 0.32 |

Dấu đi theo nét chữ:

| Đặc điểm dấu | Nét đều | Sans thường | Thanh-đậm |
| --- | --- | --- | --- |
| Sắc/huyền: bề ngang đầu mảnh / đầu dày (đo ở 15% và 85% chiều cao) | 0.99–1.0 | 0.71–0.90 | 0.32–0.44 |
| Mũ: chân trái / chân phải | 1.0 | 0.94–1.04 | 0.78 (Times), 1.0 (Palatino) |
| Ngã: hai đầu so với giữa (đo dọc) | 1.05–1.1 | 1.1–1.7 (đầu xiên nên đo dọc dày) | 0.54–0.74 (đầu mảnh) |

Quy tắc Xưởng dùng: độ thon sắc/huyền = 1.1 × tương phản − 0.1 (giới hạn 0.2–1); tương phản dưới 0.5 thì chân trái mũ 0.78, hai đầu ngã 0.5 bề dày giữa, đầu móc hỏi thon. Nét đều thì dấu gần như không thon. Không áp một độ thon cố định cho mọi font: font nét đều sẽ có dấu nhọn lạc kiểu, font thanh-đậm có dấu cứng và nặng.

**Dấu nét cong (hỏi, ngã) dày mỏng theo trục nét của chính font** (người dùng 27/11/2026, Migra: "phần nét thanh rất mảnh, nhưng dấu được tạo ra lại là nét đều"). Nét cong của e, s, g, o trong font thanh-đậm mảnh ở một hướng và đậm ở hướng vuông góc; dấu dựng phải theo đúng hướng đó, không chỉ vuốt thon một đầu:
- **Trục nét** = hướng nét ở chỗ mảnh nhất của o, đo theo pháp tuyến như độ tương phản (`strokeAxis` trong `site/vietnamese.js`). Migra Extralight ~53°, Times ~11°.
- Mỗi điểm trên đường tâm dấu: bề dày = nét mảnh + (nét đậm − nét mảnh) × |sin(hướng nét − trục)|. Nét mảnh = tương phản × nét đậm; nét đậm = bề dày dấu theo mục Bề dày. Đổi dày mỏng dần như nét bút (làm mượt dọc nét), chỗ đậm nhất vẫn bằng nét đậm.
- **Hỏi:** đầu móc đi lên mảnh, lưng phải đi xuống đậm như lưng s và g, cổ uốn về chân mảnh dần. Mảnh/đậm của hỏi ≈ tương phản của o (Migra Extralight 0.35, Times 0.35); Arial giữ 0.74.
- **Ngã:** cùng trục nhưng sàn nét mảnh 0.6 nét đậm, vì ngã của font thanh-đậm chỉ mảnh ở hai đầu (0.54–0.74, bảng trên); đổi mạnh hơn thì ngã Times Bold mỏng và thấp hẳn so với ngã gốc.
- Tương phản trên 0.9 (nét đều) thì giữ nét đều.
- Kiểm: `npm run check:rules` mục 10 (hỏi dựng của Times, Migra Extralight có mảnh/đậm ≤ tương phản + 0.15; Arial ≥ 0.6) và `npm run check:marks` (cỡ, bề dày so với dấu gốc 20 font).

**Ký tự đặc biệt Xưởng dựng** (`site/derive-symbols.js`) đi theo cùng kiểu nét (người dùng 25/11/2026): font thanh-đậm (tương phản < 0.5) thì nét ngang của - _ = + < > #, gạch dọc của $ và gạch dưới của ₫ bằng nét mảnh của font (tương phản × nét thân, ít nhất 0.3); ngoặc ( ) { } mảnh hai đầu, đậm giữa; vòng của % đậm hai bên, mảnh ở đỉnh và đáy. ~ và ^ lấy từ dấu ngã và dấu mũ nên đã theo kiểu nét. Font nét đều và sans giữ nét gần đều như cũ (gạch nối 0.82 nét thân).

**Dấu mẫu cũ trong dự án:** dấu Xưởng dựng từ nét (chưa khóa, chưa duyệt) được dựng lại khi bấm Hoàn thiện nếu quy tắc nay cho hình khác; kết quả đo đầu râu lưu kèm dấu râu có số phiên bản, khác phiên bản thì đo lại khi ghép (lỗi 25/11/2026: dấu Migra dựng khi còn đo nhầm tương phản vẫn nét đều, râu vẫn dài sau Hoàn thiện).

## Nguồn hình cho dấu

**Nguyên tắc (người dùng 23/11/2026):** dấu luôn lấy từ chính font đang làm, không lấy dấu hay chữ của font khác đưa vào bộ font mới. Áp như nhau cho font dựng từ ảnh và font nước ngoài cần Việt hóa. Thứ tự:

- **Font dựng từ ảnh:** dấu người dùng vẽ trong chữ có dấu đã tách từ ảnh (hỏi ở ỏ/ả, mũ ở ê, nặng ở ọ… — `marksFromImageLetters`, giữ cỡ người vẽ; **râu** liền thân nên tách bằng cách lấy ư/ơ/Ư/Ơ của ảnh trừ u/o/U/O cùng ảnh, giữ hình, cỡ và khoảng tới mép phải vùng trên như trong ảnh, chữ hoa dùng râu chữ hoa nếu ảnh có — `site/horn-from-letters.js`) → dấu từ ảnh bảng dấu → loại dấu ảnh chưa có thì **dựng từ nét của chính font** theo quy tắc trang này (độ dày theo nét thân, độ thon/đầu nét theo kiểu nét, cỡ/khoảng hở/hai tầng theo tỉ lệ chuẩn tính trên x-height và chữ o của chính font). Không dùng hình dấu mặc định. Dấu mẫu đổi thì các chữ Xưởng đã ghép bằng dấu đó được ghép lại.
- **Font nước ngoài cần Việt hóa:** dấu của nhà thiết kế có trong chữ Latin của font (á à ã â ă…) dùng trước; dấu font chưa có (hỏi, nặng, râu, trăng…) dựng từ nét của chính font theo quy tắc trang này.

- **Dấu font đã có:** dùng trước, lấy từ chữ Latin do nhà thiết kế vẽ theo thứ tự cố định (ã õ ñ ũ..., chữ hoa Ã Õ Ñ Ũ...). Không lấy mẫu từ khối chữ tiếng Việt U+1EA0–1EF9 hay ơ ư: trong font đã Việt hóa rồi mở lại, các chữ đó có thể do công cụ ghép, và lấy chúng làm mẫu làm dấu cùng loại khác nhau giữa các chữ (ễ khác Ữ). Chữ hoa dùng dấu hoa tách từ Á, À, Ã... của chính font, không đặt dấu chữ thường lên chữ hoa.
- **Chữ hai dấu (Ộ, Ấ, ặ...):** nếu font đã có Ô, Â, Ê, Ă, Ơ, Ư do nhà thiết kế vẽ, dùng làm gốc và chỉ thêm dấu thanh. Không vẽ lại mũ/trăng/râu.
- **Dấu nặng:** dấu chấm thật của font → chấm chữ i → dấu chấm do Xưởng tự dựng → chấm tròn. Dấu chấm tự dựng có thể chỉ là hình thay thế (ví dụ ô vuông), nên không dùng làm mẫu khi font đã có chấm i.
- **Dấu font chưa có:** dựng theo các số trong trang này, từ nét của chính font.

## Hai tầng dấu

Đo ở ấ ầ ẩ ẫ ắ ằ ẳ ẵ và chữ hoa trong 20 font. Mũ và trăng **giữ nguyên** vị trí và cỡ như ở â, ă (cả 20 font: không dịch, không thu). Dấu thanh đặt như sau, tính theo bề rộng (cw) và chiều cao (ch) của mũ/trăng:

| Chữ | Vị trí ngang dấu thanh | Đáy dấu thanh | Cỡ so với dấu đứng riêng |
| --- | --- | --- | --- |
| ấ, Ấ | mép trái ở tâm mũ + 0.38 cw (lệch phải, tâm +0.68 cw) | 0.62 ch: thấp hơn đỉnh mũ, nằm cạnh mũ | ~0.8 (Ấ 0.75) |
| ầ, Ầ | đối xứng: mép phải ở tâm − 0.38 cw | 0.62 ch | ~0.8 |
| ẩ, Ẩ | mép trái ở tâm + 0.32 cw (tâm +0.53 cw) | 0.61 ch | ~1.0 |
| ẫ, Ẫ | giữa | trên đỉnh mũ, hở 0.06 x-height | ~0.9 |
| ắ ằ ẵ, Ắ | giữa (sắc lệch phải 0.15 cw) | ngang hai đầu trăng (hở 0–0.03 x-height) | ~0.8 |
| ẳ, Ẳ | giữa | ngang đầu trăng; Ẳ thấp hơn một chút (0.92 ch) | ~1.0 |

Đỉnh cả cụm: chữ thường 0.81–0.89 em, chữ hoa 0.96–1.0 em. Chồng thẳng dấu thanh lên trên mũ làm cụm hoa cao quá 1 em; đó là lý do các font này đặt dấu thanh lệch cạnh mũ. Khi vẫn vượt, thu dấu thanh (tối đa còn 65%) rồi hạ sát mũ/trăng, không thu mũ.

## Chữ nghiêng (Italic, Oblique)

- **Đo độ nghiêng:** lấy tâm nét thân `l` (hoặc `I`, `i`) ở 30% và 70% chiều cao; độ nghiêng = lệch ngang / chênh cao. Dưới 0.03 coi là chữ đứng. Italic thường 0.15–0.25 (8–14°).
- **Dấu Xưởng tự dựng** (dựng từ nét chữ) được nghiêng theo chữ, quanh giữa chiều cao của dấu. Dấu lấy từ font đã nghiêng sẵn thì không nghiêng thêm.
- **Vị trí:** mỗi dấu dịch ngang theo trục nghiêng: độ nghiêng × (giữa dấu − giữa thân chữ). Dấu trên lệch phải, dấu nặng lệch trái so với tâm khung chữ.
- **Dấu nặng** không nghiêng hình (chấm vẫn là chấm), chỉ dịch theo trục.
- **Râu** nghiêng từ chân râu, cùng góc với thân.
- Khi Việt hóa Italic, dùng chính file Italic làm gốc, không lấy dấu của bản đứng rồi nghiêng.

## Kiểu đầu nét

Dấu dựng từ nét phải mang **đầu nét, độ thon và góc nét của chính font** (quy tắc Hòa hợp, design-rules.md mục 7), không chọn giữa vài hình có sẵn. Đầu nét đo trên **nét kết thúc tự do của chính font**, không đoán theo loại font.

1. **Đầu tay chữ r** (nét mọc từ thân rồi kết thúc tự do, gần râu nhất). Tay r = chữ r trừ thân chữ i không chấm, **canh theo mép phải thân ở 30% chiều cao** (không canh mép trái khung chữ: r của Migra có cờ đầu thân chìa sang trái, canh khung thì lấy nhầm gần cả chữ r). Đo bề dày dọc theo tay: phần đầu (70–92% chiều dài) dày hơn 1.35 lần giữa tay → **giọt nước**; đầu (95%) mảnh dưới 0.45 lần và phần đầu dưới 0.8 lần giữa tay → **mũi vát sắc** (nét mảnh kết thúc bằng mũi nhọn cạnh thẳng); còn lại → **thường**. Đo được: Times, Georgia, Palatino, Comic Sans, Monotype Corsiva, Askino là giọt nước; Migra (Extralight, Extrabold) là mũi vát sắc; Arial, Arial Bold, Calibri, Segoe UI, Verdana, Tahoma, Courier, Segoe Print, Gabriola là thường. Chữ nghiêng có r dính nét với thân (Times Italic, Segoe Script) không tách được tay r: chuyển sang bước 2.
2. **Đầu thân `l`, chỉ khi l là một nét đơn:** cách mỗi đầu một bề dày, mặt cắt còn 0.8–1.25 lần giữa thân (không vòng nét, không chân serif). Ở độ sâu 0.15 bề dày mặt cắt dưới 0.85 và ở 0.5 bề dày trên 0.85 ở **cả hai** đầu → **đầu tròn** (Comic Sans, Segoe Print, MV Boli). l của chữ viết là vòng nét hoặc vuốt nhọn dần: **không** được coi là đầu tròn (lỗi 25/11/2026: font chữ viết đầu nhọn bị râu bo tròn vì chỉ đo mặt cắt ngang của l và chỉ có hai kiểu tròn/vuông).
3. Không đo được thì đầu **cắt bằng** như râu font chuẩn.

**Râu dựng theo đầu nét:**
- Giọt nước: thân râu dựng theo chuẩn đo (vươn, cao, nối như mục Râu ơ ư), đầu râu gắn **đúng giọt nước lấy từ đầu tay r** của font, lật dọc cho bầu giọt ở trên (ở r giọt nước rủ xuống cuối tay ngang, râu thì vươn lên). Đỉnh giọt chạm độ cao đầu râu chuẩn.
- Mũi vát sắc: râu **đầu vát** — **đầu trên đậm, chân thanh**, như nét vát của chính font (người dùng 25/11/2026, đối chiếu font mẫu có ư ơ đạt chuẩn):
  - Chân mảnh bằng nét mảnh của font (max(0.25, thon) × bề dày, thon theo độ tương phản), dày đều dần tới đầu trên bằng nét đậm (0.9 nét thân).
  - Đầu trên **cắt vát chéo** theo hướng nét (mép trong dừng sớm hơn mép ngoài một chút). Không cắt ngang, không vuốt nhọn thành mũi kim ("nhọn hoắt là vector trẻ con vẽ"), không bo tròn.
  - Râu xiên dốc lên phải, uốn chữ S rất nhẹ; chiều ngang = 0.6 × chiều cao. Không chạy ngang rồi mới cong lên, không kéo dài.
  - **ư và ơ dùng cùng một nét râu** (Ư và Ơ cũng vậy), chỉ khác chỗ gắn. Đầu râu cao hơn đỉnh thân 0.24 x-height (hoa 0.17), cùng độ cao ở ư và ơ. Không đo độ vươn từ khung chữ: khung u gồm cả đuôi chân phải nên râu ư thành dài hơn râu ơ (lỗi 25/11/2026).
  - Chân râu vẫn theo mục Chỗ nối râu: mép phải xa nhất của vùng trên (vai phải o, mép thân u).
- Đầu tròn: bo tròn. Thường: cắt bằng.
- **Độ thon theo độ tương phản** như sắc/huyền (mục Nét đều hay nét thanh-đậm): thon = 1.1 × tương phản − 0.1; font thanh-đậm (thon < 0.6) có đầu râu bằng max(0.35, thon) × bề dày chân; font nét đều và sans thường giữ 0.82 như râu font chuẩn.
- Chữ nghiêng: râu và giọt nước nghiêng theo chữ (mục Chữ nghiêng).
- Râu vươn không quá 0.45 độ rộng chữ tính từ chỗ nối. Chữ viết có nét trái của u cao hơn nét phải thì chỗ nối dò xuống nét phải (tới nửa chiều cao), không kéo râu ngang qua cả chữ.

**Giới hạn còn lại:** chữ viết **nối nét** (u, o có nét nối chìa lên bên phải như Segoe Script) thì râu dựng vẫn bám vào nét nối; cần ảnh mẫu ư/ơ. Dấu hỏi, ngã dựng đã dày mỏng theo trục nét của font, nhưng đầu móc hỏi chưa gắn đúng đầu nét giọt nước/mũi vát đo từ chữ (chỉ vuốt về nét mảnh).

Kiểm: `npm run check:rules` mục 7 (Times giọt nước và râu liền thân; Arial cắt bằng; Monotype Corsiva, Segoe Script không bo tròn; Comic Sans không vuốt nhọn), mục 8 (Migra Extralight/Extrabold nếu có trong Downloads — bản dùng cá nhân, không đưa vào repo: tương phản < 0.5, râu đầu vát chân mảnh đầu trên đậm cắt chéo, liền thân, ư ơ và Ư Ơ cùng cỡ râu, dấu râu mẫu cũ được đo lại, gạch nối mảnh; Arial giữ gạch nối 0.82 nét thân) và `npm run check:marks` (râu dựng vẫn khớp râu gốc của 20 font).

## Hai tầng: dấu thanh nằm trên mũ/trăng

Ngã trên mũ (ẫ, Ẫ) và mọi dấu thanh trên trăng: đáy dấu thanh không thấp hơn 1.04 chiều cao mũ/trăng (font chuẩn: 1.04–1.39). Khi cả cụm vượt chiều cao dòng (hoa 1.0 em, thường 0.9 em), thu dấu thanh (tối đa còn 50%) thay vì hạ xuống sát mũ. Dấu thanh lệch cạnh mũ (ấ ầ ẩ) vẫn được hạ tối đa 0.25 chiều cao mũ.

Nặng: rộng không quá 0.36 độ rộng chữ thường mang dấu, 0.26 độ rộng chữ hoa (font chuẩn ọ ≤ 0.38, Ọ ≤ 0.27); font hẹp (mono, Black) có nặng nhỏ hơn dấu chấm. Nhưng không nhỏ hơn 0.9 nét thân (mức thấp nhất của chuẩn): chữ hoa rất hẹp, đậm (UTM Bebas Bold) giới hạn theo độ rộng làm chấm nhỏ hơn cả nét chữ.

Độ rộng dấu khi đối chiếu: đo cả theo độ rộng chữ mang dấu (`w`) và theo x-height (`wx`); đạt nếu khớp một trong hai. Font hẹp (UTM Bebas) có dấu gốc rộng 0.56–0.89 lần độ rộng chữ, lệch chuẩn `w` nhưng khớp `wx`.

## Font toàn chữ hoa (Bebas...)

Ô chữ thường là hình chữ hoa: đỉnh `x` ≥ 0.9 chiều cao hoa. Dấu dựng theo x-height quy đổi = chiều cao hoa / 1.4 (tỷ lệ hoa/x-height ở font chuẩn) và theo luật dấu chữ hoa cho mọi chữ; nếu lấy đỉnh `X` làm x-height thì dấu to gấp 1.4 lần. Chữ i không chấm (một contour) dùng nguyên làm thân cho ì í ỉ ĩ ị. Bước đối chiếu chấm font toàn hoa theo chuẩn chữ hoa.

## Kiểm bằng máy

`npm run check:marks` lấy các font trên (nếu máy có), xóa hết chữ có dấu, cho Xưởng dựng lại bằng chính luồng **Tạo dấu tiếng Việt**, rồi so với dấu gốc của nhà thiết kế. Bước kiểm tra đạt khi trung vị tỷ số dựng/gốc của từng chỉ số nằm trong khoảng 0,85–1,15 và không font nào lệch quá giới hạn từng chỉ số.

Kết quả khi lập chuẩn (trung vị dựng/gốc): cao 0,98–1,05; rộng 0,98–1,06; bề dày 0,95–1,04; hở 1,00–1,10; nặng 0,98; độ vươn râu 0,94–0,99.
