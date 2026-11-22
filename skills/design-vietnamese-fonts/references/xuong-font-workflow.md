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

## Nút "Hoàn thiện font chữ" (trình sửa)

Một lần bấm chạy lần lượt mọi bước theo quy tắc skill và **áp dụng luôn** (người dùng yêu cầu bỏ bảng xem trước, 22/11/2026), rồi kiểm file và tự dời dấu rời quá sát thân; **Hoàn tác chỉnh dấu** quay lại toàn bộ lượt. Không có gì cần sửa thì kiểm file luôn. Không thêm nút mới.

1. **Chiều cao** (`site/font-heights.js`), chỉ cho nét dò từ ảnh và chữ suy luận, không cho font vẽ sẵn:
   - Chữ đáy phẳng `BDEFHIKLPRTXZhiklmnrxz147` ngồi đúng đường chân của font (trung vị đáy nhóm đó). Lệch > 1% chiều cao chữ hoa thì dời; lệch > 8% coi là cố ý (số kiểu cũ 4 7, chữ trang trí), chỉ báo.
   - Đỉnh phẳng cùng nhóm bằng trung vị nhóm: hoa `BDEFHIKLNPRTZ`, x-height `uvwxyz`, đầu chữ thường `bdhkl`. Lệch 1,5–5% thì co giãn dọc quanh chân; > 5% chỉ báo.
   - Không đụng chữ tròn/nhọn (O C G S A M N U V W Y J o c e s …): chúng được phép vượt dòng. Font vẽ sẵn cũng không đụng: Palatino để chân I E i thấp 29/1000, Calibri thấp 3/1000.
1b. **Cỡ dấu câu, dựng từ thông số của chính font** (`normalizePunctuation` trong `site/font-heights.js`; người dùng yêu cầu 22/11/2026: hệ dấu xây từ font gốc, không tham khảo font khác, không chia font thường/font hẹp). Mốc là **chấm chữ i** của font (contour nhỏ trên cùng của i); font chưa có chấm i thì mốc là **nét thân**. Dấu chấm rộng lệch mốc > 8% thì mọi dấu câu dựng từ chấm (. , : ; ' " ‘ ’ “ ” và chấm của ! ?) co/giãn **cùng một tỉ lệ** về mốc, từng contour tại chỗ (chạm đường chân thì quanh chân, ngoặc kép quanh đỉnh). Sau đó **chấm của `: ; ! ?` bằng đúng dấu chấm** (lệch > 8% thì đưa về), đuôi dưới của `;` cao bằng dấu phẩy; `! ?` cao quá chữ hoa của font > 8% thì co về chiều cao chữ hoa. Dấu câu Xưởng tự dựng lấy chấm i làm chấm; không có chấm i hay dấu chấm thì chấm vuông cạnh bằng nét thân. Áp cho dấu câu theo ảnh và dấu câu dựng; font vẽ sẵn giữ nguyên. Thử: `node .qa/punct-test.mjs`.
1c. **Dấu nặng bằng dấu chấm của chính font** (`normalizeDotBelow`): ở mọi chữ có dấu nặng, kể cả chữ theo ảnh, chấm nặng (contour nhỏ nằm hẳn dưới đường chân) lệch dấu chấm > 8% thì co/giãn tại chỗ quanh đỉnh chấm (giữ khoảng hở với thân). Chạy sau bước dấu câu. Thử: `node .qa/dotbelow-test.mjs`. (Bước Tạo dấu tiếng Việt vẫn đặt nặng 0,88 dấu chấm theo `mark-standards.md`; chuyển cả bộ dấu thanh sang thông số font gốc là việc chưa làm.)
2. **Viền và đường cong** (`site/outline-quality.js`): đo lỗi nét theo các phép kiểm outline của dự án (`npm run check:font`) — **xù** (hai đoạn liền nhau quay gắt, mũi < 9°), **đoạn ngắn** (< 4/1000 em), **gần đứng/ngang** (đoạn thẳng lệch trục 0,1–2°) — và **gấp khúc** (chuỗi ≥ 3 đoạn thẳng liên tiếp, mỗi chỗ nối quay 3–35°: đường cong bị vẽ bằng đoạn thẳng). Font vẽ sẵn (Arial 0 lỗi; Times 2, Georgia 16 trên 63 chữ) làm mốc. Mọi nét không phải font vẽ sẵn (dò ảnh, chữ dựng từ bộ phận, ký tự dựng, nét đổi độ đậm) có lỗi thì nắn thử mức Nhẹ 0,75 → Vừa 1,5 → Mạnh 3, lấy mức đầu tiên hết lỗi; nắn giữ góc thật (gãy > 30°), lòng chữ, diện tích lệch ≤ 4%. Contour gấp khúc được dựng lại đường cong dù không răng cưa. Còn lỗi thì báo tên chữ. Thử: `node .qa/outline-q.mjs` (chữ dựng từ bộ phận của Arial/Times/Georgia: 11–393 lỗi → 0–8).
3. **Bổ sung:** dấu mẫu và Đ (nếu chưa có), chữ cái gốc từ bộ phận, chữ có dấu (dựng lại chữ lệch chuẩn và chữ có dấu do Xưởng ghép trên chữ gốc vừa sửa), dấu câu và ký tự đặc biệt.
4. **Kerning tiếng Việt** (`vietnameseKerning` trong `site/font-layout.js`): T V W Y trước nguyên âm thường kể cả khi mang dấu, AV AT AY AW VA TA YA WA LT LV LY LW ƯT ƠT ƯV ƠV PA FA. Chỉ siết, tối đa 0,07 em (cặp hoa 0,06 em), giữ khoảng hở ≥ 14/1000 em đo trên cả dấu; bỏ cặp siết < 6. Font Xưởng dựng: tính mỗi lần xuất. Font mở từ bộ sưu tập (file nhập): **giữ nguyên kerning gốc**, không thêm cặp (SKILL.md: khi sửa dấu trong file nhập giữ nguyên thân chữ, baseline, advance và kerning).
5. **Kiểm file** rồi tự sửa khoảng dấu–thân (bước Đề xuất sửa an toàn), kiểm lại.
6. **Báo cáo:** việc đã làm, chữ lệch lớn được giữ, và chữ **cần ảnh mẫu** (Xưởng không tự dựng được).

Nét lấy từ ảnh chỉ bị dời, co dọc ≤ 5% hoặc nắn nhẹ; không vẽ lại hình. **Font người dùng tự dựng rồi mở lại từ Bộ sưu tập** (nhận bằng dấu Xưởng trong file: mô tả "Made with draw-your-font" ở bảng name, kể cả khi file được Nhập TTF; hoặc bản lưu có `fromImages`. Bản Việt hóa XFVN/"Việt hóa" chỉ tính khi font gốc của nó cũng do Xưởng xuất) được sửa như nét dò ảnh dù chữ đọc lại mang nguồn "Font gốc"; cờ `fromImages` giữ nguyên qua các lần lưu. Font của nhà thiết kế khác: chỉ sửa chữ Xưởng ghép/dựng. Dấu chấm không được sửa thì các dấu câu khác không co theo chấm i (giữ tương quan với dấu chấm). Font toàn chữ hoa: chữ thường thiếu chép từ chữ hoa tương ứng (theo mục Font toàn chữ hoa của mark-standards.md), không dựng từ bộ phận. Chữ đã khóa, đã duyệt giữ nguyên. Thử bằng `node .qa/derive-symbols-test.mjs arial.ttf pala.ttf` (ký tự và chiều cao) và `node .qa/derive-letters-test.mjs arial.ttf georgia.ttf`.

Nút "Đề xuất sửa an toàn" / "AI đối chiếu và đề xuất sửa dấu": với cảnh báo khoảng dấu–thân, Xưởng tính bản dời dấu rời, xuất thử TTF và đo lại; bản nào hết cảnh báo và không gây lỗi mới thì **áp dụng luôn** (không bắt duyệt từng chữ), rồi tự kiểm lại file. Chỉ dời vị trí dấu, không đổi hình nét, kể cả chữ theo ảnh; chữ đã khóa, dấu dính thân hoặc bản sửa không qua kiểm lại thì ghi "Bỏ qua". Quay lại bằng Hoàn tác chỉnh dấu. Cảnh báo (Cần xem lại) không chặn việc xuất font; chỉ lỗi mới chặn.

## Dựng chữ cái gốc còn thiếu từ bộ phận (`site/derive-letters.js`)

Chạy trong nút "Hoàn thiện font chữ" và nút dựng dấu mẫu, trước bước ghép chữ có dấu. Chỉ điền ô trống, không thay chữ theo ảnh, nét gốc hay chữ đã khóa. Kết quả ghi nguồn "Dựng từ bộ phận" và `derivedFrom`, luôn là suy luận để duyệt; Hoàn tác chỉnh dấu gỡ được.

| Chữ dựng | Từ bộ phận | Cách |
|---|---|---|
| h | n (+ l) | thân trái n thay bằng phần trên của l (hoặc thân cao tới đầu chữ thường) |
| n ↔ u | u ↔ n | xoay 180°; n còn dựng được từ h (cắt ở đỉnh vòm) |
| m | n | lặp vòm + thân phải của n, nối tiếp từ thân phải |
| r | n | thân trái + vai vòm, cắt trước thân phải |
| b d p q | o + l (hoặc thân rộng bằng nét thân) | ghép thân vào trái/phải lòng o; p q thân xuống chân chữ. Không có o thì xoay/lật từ chữ cùng nhóm |
| c / C | o / O | khoét hình quạt bên phải ±36° |
| e | o | khoét quạt dưới phải (−48° tới −6°) + thanh ngang giữa dày 0,8 nét thân |
| i | l (+ dấu .) | thân l cắt ở x-height, chấm đặt giữa thân, đỉnh chấm ngang đầu chữ thường |
| l ↔ I | I ↔ l | chép |
| F, L | E | bỏ thanh dưới / bỏ thanh trên và giữa, giữ thân |
| E | F + L | ghép thanh dưới của L vào F |
| R | P | thêm chân chéo từ đáy bụng xuống góc phải, dày 0,95 nét thân |
| Q | O | thêm đuôi chéo dày 0,9 nét thân |
| W / w | V / v | hai V chồng nhau, lệch một bề rộng trừ độ dày tay phải |
| 6 ↔ 9 | 9 ↔ 6 | xoay 180° |

Không dựng (thử xoay W thành M cho ra hình Λ, sai): M, A, G, K, S, X, Z, a, g, k, s… cần ảnh mẫu. Khoảng cách hai bên lấy theo chữ nguồn.

**Bộ chữ mẫu tối thiểu cần ảnh** để Xưởng dựng phần còn lại theo quy tắc:
- Hoa (20): A B D E G H I J K M N O P S T U V X Y Z → Xưởng dựng C F L Q R W.
- Thường (14): a f g j k l n o s t v x y z → Xưởng dựng b c d e h i m p q r u w.
- Số (9): 0 1 2 3 4 5 7 8 và một trong 6/9.
- Dấu thanh, dấu mũ, Đ, dấu câu và ký tự: tự dựng từ nét chữ nếu không có ảnh (`$` từ S, `%` từ vòng dày 0,78 nét thân, `{ }` từ ngoặc có mũi giữa, `*` sáu nét thon); `? @ &` cần ảnh. Toàn bộ chữ có dấu tiếng Việt được ghép theo chuẩn.
Font trang trí (mỗi chữ một kiểu riêng) nên có ảnh cho cả chữ dựng được; chữ dựng chỉ là bản nháp. Kiểm bằng `node .qa/derive-letters-test.mjs arial.ttf georgia.ttf` (ảnh so sánh `.qa/derive-letters.png`).
