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

- Cỡ (cạnh lớn nhất) bằng **0.88** [0.67–1.0] dấu chấm của chính font. Không font nào trong nhóm dùng dấu nặng to hơn dấu chấm.
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

## Bề dày theo độ đậm

Font đậm có dấu nhẹ hơn thân, font mảnh có dấu gần bằng thân. Bề dày đo 2A/P xấp xỉ:

`bề dày dấu ≈ min(20 + 0.27 × nét thân, 0.75 × nét thân)`

| Font | Nét thân | Dấu đo được | Công thức |
| --- | --- | --- | --- |
| Segoe UI Light | 45 | 31 | 32 |
| Segoe UI | 80 | 42 | 42 |
| Arial Bold | 137 | 59 | 57 |
| Segoe UI Black | 208 | 65 | 76 |

Không dùng một tỷ lệ cố định với nét thân (ví dụ 0,82): như vậy dấu font Black sẽ quá nặng và dấu font Thin quá mảnh hoặc bị chặn sàn quá dày.

## Nét đều hay nét thanh-đậm

Phân tích trước khi dựng dấu. **Độ tương phản** = nét ngang mảnh nhất ở đỉnh/đáy chữ o (đo dọc ở giữa) chia nét đứng dày nhất hai bên (đo ngang ở giữa).

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

## Nguồn hình cho dấu

- **Dấu font đã có:** dùng trước. Chữ hoa dùng dấu hoa tách từ Á, À, Ã... của chính font, không đặt dấu chữ thường lên chữ hoa.
- **Chữ hai dấu (Ộ, Ấ, ặ...):** nếu font đã có Ô, Â, Ê, Ă, Ơ, Ư do nhà thiết kế vẽ, dùng làm gốc và chỉ thêm dấu thanh. Không vẽ lại mũ/trăng/râu.
- **Dấu nặng:** dấu chấm thật của font → chấm chữ i → dấu chấm do Xưởng tự dựng → chấm tròn. Dấu chấm tự dựng có thể chỉ là hình thay thế (ví dụ ô vuông), nên không dùng làm mẫu khi font đã có chấm i.
- **Dấu font chưa có:** dựng theo các số trong trang này, từ nét của chính font.

## Chồng hai dấu

Ở ấ, ầ, ẩ, nhiều font đặt dấu thanh lệch sang cạnh mũ (sắc lệch phải, huyền lệch trái, hỏi lệch phải ít hơn), còn ngã nằm thẳng trên mũ. Ở ắ, ằ, ẳ, ẵ, dấu thanh nằm giữa trên trăng. Xưởng hiện chồng thẳng mọi dấu và thu nhỏ khi vượt chiều cao; skill cho phép cả hai cách (xem quy tắc thiết kế, mục 1), nhưng cách lệch cạnh thấp hơn và giống các font chuyên nghiệp hơn.

## Kiểm bằng máy

`npm run check:marks` lấy các font trên (nếu máy có), xóa hết chữ có dấu, cho Xưởng dựng lại bằng chính luồng **Tạo dấu tiếng Việt**, rồi so với dấu gốc của nhà thiết kế. Bước kiểm tra đạt khi trung vị tỷ số dựng/gốc của từng chỉ số nằm trong khoảng 0,85–1,15 và không font nào lệch quá giới hạn từng chỉ số.

Kết quả khi lập chuẩn (trung vị dựng/gốc): cao 0,98–1,05; rộng 0,98–1,06; bề dày 0,95–1,04; hở 1,00–1,10; nặng 0,98; độ vươn râu 0,94–0,99.
