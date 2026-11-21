// Chuẩn dấu tiếng Việt đo từ 20 font chuyên nghiệp đã Việt hóa (Arial, Times New Roman, Segoe UI Light→Black,
// Tahoma, Verdana, Courier New, Calibri, Consolas, Palatino; thường và đậm). Đo bằng scripts/measure-vietnamese-marks.cjs,
// mỗi số là trung vị; [min, max] là khoảng các font đó dùng. Mọi số là tỷ lệ theo chính font đang làm, nên áp được
// cho font mảnh, đậm, serif, sans, mono. Đây là số đo thực tế, không phải quy định của nguồn Vietnamese Typography.
export const MARK_STANDARDS = {
  // Chiều cao dấu / x-height (chữ thường). Dấu hoa cao gần bằng dấu thường (trung vị 0.32 so với 0.33).
  height: { acute: [.33, .24, .42], grave: [.33, .24, .42], circumflex: [.33, .24, .41], breve: [.32, .23, .35], tilde: [.27, .22, .35], hook: [.35, .30, .47] },
  capHeightRatio: .97,
  // Độ rộng dấu / độ rộng nguyên âm o (chữ thường).
  width: { acute: [.41, .33, .56], grave: [.41, .33, .56], circumflex: [.64, .50, .73], breve: [.69, .60, .79], tilde: [.72, .63, .81], hook: [.33, .28, .52] },
  // Khoảng hở dấu–thân / x-height.
  gap: { lower: [.136, .10, .17], cap: [.105, .06, .14], below: [.093, .06, .16] },
  // Bề dày nét dấu, đo bằng 2·diện tích/chu vi (đơn vị UPM 1000), theo nét thân: font đậm có dấu nhẹ hơn thân,
  // font mảnh có dấu gần bằng thân. Khớp Segoe Light 31 (công thức 32), Regular 42 (42), Black 65 (76), Arial Bold 59 (57).
  thickness: stem => Math.min(20 + .27 * stem, .75 * stem),
  // Nặng: thường nhỏ hơn dấu chấm một chút (trung vị 0.88, khoảng 0.67–1.0); cỡ 0.9–1.75 lần nét thân.
  dotBelow: { vsPeriod: [.88, .67, 1], stem: [1.21, .9, 1.75] },
  // Râu: độ vươn phải / độ rộng chữ gốc; độ cao đầu râu trên đỉnh thân / x-height.
  horn: { reach: { o: .09, u: .27, O: .11, U: .25 }, tip: { o: .18, u: .18, O: .12, U: .25 },
    // Độ rộng (advance) tăng thêm = hệ số × phần râu chìa ra ngoài mép phải chữ gốc; phần còn lại lấn sang lề phải
    // như font chuyên nghiệp. Chọn để khoảng hở ơn, ưn, ƯN, ươ khớp trung vị 25 font (lệch trung vị ≤ 20/1000).
    advance: { o: 0, O: 0, u: .2, U: .2 } },
  // Chồng dấu (ấ, Ẩ...): đỉnh cả cụm / em. Font chuyên nghiệp cho dấu hoa chồng chạm gần 1000.
  // Độ tương phản nét (o: nét ngang mảnh / nét đứng dày) và độ thon sắc/huyền (đầu mảnh / đầu dày) theo nhóm.
  contrast: { monoline: [.9, 1], sans: [.67, .87], highContrast: [.2, .35] },
  acuteTaper: { monoline: [.99, 1], sans: [.71, .90], highContrast: [.32, .44] },
  stackTop: { lower: [.85, .81, .89], cap: [.98, .96, 1] },
};
// Tỷ lệ giữa độ dày bút (tham số strokeAlong/polygon) và bề dày đo 2A/P của dấu ngắn hai đầu bằng.
export const STROKE_PER_MEASURED = 1.58;
