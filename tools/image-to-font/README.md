# Dựng font từ ảnh (chạy trên máy)

Script `image_to_font.py` dựng file TTF tiếng Việt từ **một ảnh chữ mẫu** mà không gọi Gemini hay AI nào. Không cần khóa API, không giới hạn lượt và ảnh không rời khỏi máy.

Luồng xử lý:

1. Ngưỡng ảnh (tự chọn bằng Otsu) và tách các vùng nét liền.
2. Gom vùng nét thành dòng, từ và ký tự **theo nội dung chữ bạn nhập**. Dấu được gán cho đúng chữ cần dấu, chữ dính nhau được tự tách và ghi vào mục cần soát.
3. Vector hóa từng ký tự bằng Potrace **từ pixel gốc**, không vẽ lại.
4. Ghép các chữ Việt còn thiếu từ thân chữ và dấu có mẫu trong ảnh. Ví dụ: có `a`, `à` và `ố` thì ghép được `ầ`, `ấ`, `ẫ`… Chữ ghép được ghi là "ghép" trong báo cáo.
5. Xuất `TTF`, `report.json` và `proof.png` để soát.

## Cài một lần

Cần Python 3.11 trở lên. Mở PowerShell trong thư mục này:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
```

## Chạy

1. Chuẩn bị ảnh nền sạch: chữ tối trên nền sáng hoặc chữ sáng trên nền tối, không có watermark đè lên nét.
2. Tạo file text UTF-8, **mỗi dòng trong ảnh là một dòng**, gõ đúng từng chữ và dấu như trong ảnh. Xem `sample-text.txt`.
3. Chạy:

```powershell
.\.venv\Scripts\python image_to_font.py "anh-mau.png" --text-file "noi-dung.txt" --name "Ten Font" --out output
```

Kết quả nằm trong thư mục `output`:

| File | Nội dung |
| --- | --- |
| `TenFont-Regular.ttf` | Font để cài hoặc mở trong Xưởng Font |
| `proof.png` | Nội dung ảnh gốc, bảng 146 chữ Việt và câu thử, gõ lại bằng font vừa dựng |
| `report.json` | Chữ lấy từ ảnh, chữ ghép, chữ còn thiếu kèm lý do, các từ cần soát |

Ô vuông trong `proof.png` là chữ font chưa có. Terminal in ra danh sách chữ hoặc dấu cần bổ sung, ví dụ: `thiếu mẫu dấu combining hook above`, nghĩa là ảnh chưa có chữ nào mang dấu hỏi.

## Tùy chọn

| Tham số | Khi nào dùng |
| --- | --- |
| `--upscale 2` | Chữ trong ảnh nhỏ hơn khoảng 60 px |
| `--threshold 140` | Nét mảnh bị mất hoặc nét bị dày (giá trị 0–255, mặc định tự chọn) |
| `--smooth 0.7` | Giữ góc sắc hơn. Tăng lên khoảng 1.2 để nét cong mềm hơn |
| `--style Bold` | Tên style ghi vào font |
| `--no-compose` | Chỉ lấy chữ có trong ảnh, không ghép thêm |

## Giới hạn

- Mỗi lần chạy nhận một ảnh. Muốn đủ bộ chữ thì cần một ảnh mẫu có đủ chữ gốc (a–z, A–Z, ơ ư đ…) và mỗi loại dấu xuất hiện ít nhất một lần, kể cả dấu hỏi.
- Chữ hoa có dấu mà ảnh không có sẽ mượn dấu của chữ thường và được ghi chú. Theo quy tắc trong skill, cần soát lại vị trí dấu trên chữ hoa.
- Script chưa có kerning. Khoảng cách chữ lấy theo trung vị khoảng hở trong ảnh.
- Râu ơ/ư và gạch đ dính liền thân nên không ghép được. Ảnh phải có sẵn các chữ này.
- Đây là bản nháp (`Version 0.100 draft`). Kiểm tra bằng tab **Kiểm tra font tiếng Việt** trong Xưởng Font trước khi dùng.

Thử nhanh với ảnh mẫu trong repo:

```powershell
.\.venv\Scripts\python image_to_font.py ..\..\tests\fixtures\co-tet-clean.png --text-file sample-text.txt --name "Co Tet Test" --out output
```
