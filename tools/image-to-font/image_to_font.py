"""Dựng font TTF tiếng Việt từ một ảnh chữ mẫu, chạy hoàn toàn trên máy.

Luồng: ngưỡng ảnh -> tách vùng nét -> gom thành từng ký tự theo nội dung chữ người dùng
cung cấp -> vector hóa bằng Potrace từ pixel gốc -> ghép chữ Việt còn thiếu từ thân chữ
và dấu có mẫu -> xuất TTF, báo cáo và ảnh thử.

Không AI nào vẽ lại chữ. Chữ ghép được đánh dấu "suy luận" trong báo cáo.
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import potrace
from fontTools.fontBuilder import FontBuilder
from fontTools.misc.timeTools import timestampNow
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.areaPen import AreaPen
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

UPM = 1000
TONES = {'̀', '́', '̃', '̉'}          # huyền sắc ngã hỏi
STRUCT = {'̂', '̆'}                               # mũ, trăng
BELOW = {'̣'}                                          # nặng
ABOVE = TONES | STRUCT
VOWELS = 'aăâeêioôơuưy'
TONE_LIST = ['', '̀', '́', '̉', '̃', '̣']
NO_DESCENDER = set('acemnorsuvwxzhkltdbiăâêôơưđACEHIKLMNORSTUVWXZDBFĂÂÊÔƠƯĐ')
FLAT_CAPS = set('HIKLMNTEFZXV')
X_LETTERS = set('xzvwnmuaceors')


def vietnamese_set() -> list[str]:
    chars = []
    for v in VOWELS + VOWELS.upper():
        for t in TONE_LIST:
            chars.append(unicodedata.normalize('NFC', v + t))
    return chars + ['Đ', 'đ']


def split_char(ch: str) -> tuple[str, list[str]]:
    """Tách ký tự thành 'thân' (giữ râu ơ/ư và đ) và danh sách dấu rời."""
    d = unicodedata.normalize('NFD', ch)
    base, marks = d[0], [m for m in d[1:]]
    if '̛' in marks:                       # râu dính thân: coi ơ/ư là thân
        marks.remove('̛')
        base = unicodedata.normalize('NFC', base + '̛')
    return base, marks


# ---------------------------------------------------------------- tách vùng nét
@dataclass
class Comp:
    mask: np.ndarray        # bool, cắt theo hộp bao
    x0: int
    y0: int

    @property
    def x1(self): return self.x0 + self.mask.shape[1]
    @property
    def y1(self): return self.y0 + self.mask.shape[0]
    @property
    def h(self): return self.mask.shape[0]
    @property
    def cx(self): return (self.x0 + self.x1) / 2
    @property
    def cy(self): return (self.y0 + self.y1) / 2

    def xoverlap(self, other) -> int:
        return min(self.x1, other.x1) - max(self.x0, other.x0)


def binarize(path: Path, threshold: int | None, upscale: float) -> np.ndarray:
    img = Image.open(path).convert('L')
    if upscale != 1:
        img = img.resize((round(img.width * upscale), round(img.height * upscale)), Image.LANCZOS)
    g = np.asarray(img, dtype=np.uint8)
    if threshold is None:                        # Otsu
        hist = np.bincount(g.ravel(), minlength=256).astype(float)
        w = np.cumsum(hist); mu = np.cumsum(hist * np.arange(256))
        with np.errstate(divide='ignore', invalid='ignore'):
            between = (mu[-1] * w - mu * w[-1]) ** 2 / (w * (w[-1] - w))
        threshold = int(np.nanargmax(between))
    ink = g <= threshold
    if ink.mean() > 0.5:                         # chữ sáng trên nền tối
        ink = ~ink
    return ink


def components(ink: np.ndarray, min_area: int) -> list[Comp]:
    labels, n = ndimage.label(ink, structure=np.ones((3, 3)))
    out = []
    for i, sl in enumerate(ndimage.find_objects(labels), start=1):
        m = labels[sl] == i
        if m.sum() >= min_area:
            out.append(Comp(m, sl[1].start, sl[0].start))
    return out


# ---------------------------------------------------------------- gom dòng và ký tự
@dataclass
class Cluster:
    bodies: list[Comp]
    above: list[Comp] = field(default_factory=list)
    below: list[Comp] = field(default_factory=list)

    @property
    def parts(self): return self.bodies + self.above + self.below
    @property
    def x0(self): return min(c.x0 for c in self.parts)
    @property
    def x1(self): return max(c.x1 for c in self.parts)
    @property
    def bx0(self): return min(c.x0 for c in self.bodies)
    @property
    def bx1(self): return max(c.x1 for c in self.bodies)
    @property
    def btop(self): return min(c.y0 for c in self.bodies)
    @property
    def bbottom(self): return max(c.y1 for c in self.bodies)


def group_lines(comps: list[Comp], n_lines: int):
    heights = sorted(c.h for c in comps)
    ref = heights[int(len(heights) * 0.6)]
    bodies = [c for c in comps if c.h >= 0.55 * ref]
    order = sorted(bodies, key=lambda c: c.cy)
    gaps = sorted(range(1, len(order)), key=lambda i: order[i].cy - order[i - 1].cy, reverse=True)[:n_lines - 1]
    cuts = sorted(gaps)
    lines, start = [], 0
    for cut in cuts + [len(order)]:
        lines.append(order[start:cut]); start = cut
    return lines, ref


def build_clusters(comps, line_bodies, ref):
    """Mỗi thân chữ là một cụm; dấu/chấm gắn vào thân chồng lấn ngang gần nhất."""
    body_ids = {id(c) for line in line_bodies for c in line}
    bands = []
    for line in line_bodies:
        tops = statistics.median(c.y0 for c in line); bottoms = statistics.median(c.y1 for c in line)
        bands.append((tops, bottoms))
    clusters = [[Cluster([b]) for b in line] for line in line_bodies]
    orphans = []
    for c in comps:
        if id(c) in body_ids:
            continue
        best = None
        for li, line in enumerate(clusters):
            top, bottom = bands[li]
            for cl in line:
                b = cl.bodies[0]
                ov = c.xoverlap(b)
                is_above = c.y1 <= b.y0 + 0.3 * b.h
                is_below = c.y0 >= b.y1 - 0.3 * b.h
                # Dấu trên phải nằm trên đỉnh thân (không phải cạnh thân cao như T, đ) và phủ đủ
                # bề ngang; dấu dưới phải nằm dưới thân và có tâm trong bề ngang thân.
                if ov <= 0 or not (is_above or is_below):
                    continue
                if is_above and ov < 0.3 * (c.x1 - c.x0):
                    continue
                if is_below and not is_above and not (b.x0 <= c.cx <= b.x1):
                    continue
                gap = max(b.y0 - c.y1, c.y0 - b.y1, 0)
                key = (gap, -ov)
                if best is None or key < best[0]:
                    best = (key, li, cl)
        if best is not None and best[0][0] < 0.7 * ref:
            _, li, cl = best
            (cl.above if c.cy < cl.bodies[0].cy else cl.below).append(c)
        else:
            orphans.append(c)
    # Dấu câu nhỏ đứng riêng (dấu chấm, phẩy): thành cụm riêng ở dòng gần nhất
    for c in orphans:
        li = min(range(len(bands)), key=lambda i: abs(c.cy - (bands[i][0] + bands[i][1]) / 2))
        top, bottom = bands[li]
        if c.y0 > top - 0.5 * ref and c.y1 < bottom + 0.8 * ref:
            clusters[li].append(Cluster([c]))
    # Thân bị chồng lấn ngang hoàn toàn bởi thân khác lớn hơn (vd. mảnh vỡ) -> gộp
    for li, line in enumerate(clusters):
        line.sort(key=lambda cl: cl.bx0)
        merged = []
        for cl in line:
            if merged and cl.bodies[0].h < 0.5 * ref and cl.bodies[0].xoverlap(merged[-1].bodies[0]) > 0.6 * (cl.bodies[0].x1 - cl.bodies[0].x0):
                merged[-1].bodies += cl.bodies; merged[-1].above += cl.above; merged[-1].below += cl.below
            else:
                merged.append(cl)
        clusters[li] = merged
    return clusters


def trim(mask: np.ndarray, x0: int, y0: int) -> Comp | None:
    rows = np.flatnonzero(mask.any(1)); cols = np.flatnonzero(mask.any(0))
    if not len(rows):
        return None
    return Comp(mask[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1], x0 + cols[0], y0 + rows[0])


def split_touching(word: list[Cluster], n_chars: int) -> tuple[list[Cluster], int]:
    """Tách chữ dính nhau: cắt khối rộng nhất tại cột ít mực nhất ở khoảng giữa."""
    word = list(word); splits = 0
    while len(word) < n_chars:
        cands = [i for i, cl in enumerate(word) if len(cl.bodies) == 1]
        if not cands:
            break
        i = max(cands, key=lambda k: word[k].bx1 - word[k].bx0)
        cl = word[i]; b = cl.bodies[0]
        w = b.mask.shape[1]
        lo, hi = int(w * 0.25), int(w * 0.75)
        if hi - lo < 2:
            break
        ink = b.mask.sum(0)[lo:hi]
        cut = lo + int(np.argmin(ink))
        left, right = trim(b.mask[:, :cut], b.x0, b.y0), trim(b.mask[:, cut:], b.x0 + cut, b.y0)
        if left is None or right is None:
            break
        a, c = Cluster([left]), Cluster([right])
        for mk in cl.above:
            (a if mk.cx < b.x0 + cut else c).above.append(mk)
        for mk in cl.below:
            (a if mk.cx < b.x0 + cut else c).below.append(mk)
        word[i:i + 1] = [a, c]; splits += 1
    return word, splits


def expected_marks(ch: str) -> tuple[int, int]:
    base, marks = split_char(ch)
    above = sum(m in ABOVE for m in marks)
    if base in 'ij' and not above:
        above = 1                                   # chấm i/j
    return above, sum(m in BELOW for m in marks)


def reassign_marks(chars: list[str], word: list[Cluster]):
    """Gán lại dấu trong một từ theo số dấu mỗi chữ cần: chữ cao kế bên (t, T, đ) không giành dấu."""
    for kind, idx in (('above', 0), ('below', 1)):
        pool = [m for cl in word for m in getattr(cl, kind)]
        need = [expected_marks(ch)[idx] for ch in chars]
        if len(pool) != sum(need):
            continue
        for cl in word:
            setattr(cl, kind, [])
        # dấu gần thân nhất được gán trước
        pool.sort(key=lambda m: min(abs(m.cx - (cl.bx0 + cl.bx1) / 2) for cl in word))
        for m in pool:
            k = min((i for i in range(len(word)) if need[i] > 0),
                    key=lambda i: abs(m.cx - (word[i].bx0 + word[i].bx1) / 2) - max(0, m.xoverlap(word[i].bodies[0])))
            getattr(word[k], kind).append(m); need[k] -= 1


def split_words(line: list[Cluster], n_words: int) -> list[list[Cluster]] | None:
    if n_words == 1:
        return [line]
    if len(line) < n_words:
        return None
    gaps = sorted(range(1, len(line)), key=lambda i: line[i].x0 - line[i - 1].x1, reverse=True)[:n_words - 1]
    words, start = [], 0
    for cut in sorted(gaps) + [len(line)]:
        words.append(line[start:cut]); start = cut
    return words


# ---------------------------------------------------------------- mẫu ký tự
@dataclass
class Piece:
    mask: np.ndarray
    x: float     # theo pixel, gốc = mép trái thân chữ, trục y = khoảng cách lên trên baseline
    y_top: float


@dataclass
class Sample:
    char: str
    line: int
    pieces_body: list[Piece]
    pieces_above: list[tuple[str, Piece]]   # (dấu, mảnh); '.' = chấm i
    pieces_below: list[tuple[str, Piece]]
    width: float                            # bề ngang thân
    body_top: float                         # đỉnh thân, tính từ baseline (px)
    whole: bool                             # dấu trong ảnh khớp đủ với ký tự


def to_piece(c: Comp, left: float, baseline: float) -> Piece:
    return Piece(c.mask, c.x0 - left, baseline - c.y0)


def make_sample(ch: str, cl: Cluster, line: int, baseline: float) -> Sample:
    base, marks = split_char(ch)
    above_marks = [m for m in marks if m in ABOVE]
    below_marks = [m for m in marks if m in BELOW]
    expect_above = list(above_marks)
    if base in 'ij' and not above_marks:
        expect_above = ['.']
    left = cl.bx0
    above = sorted(cl.above, key=lambda c: -c.y1)   # gần thân trước
    whole = len(above) == len(expect_above) and len(cl.below) == len(below_marks)
    # Mẫu không khớp đủ dấu vẫn giữ mọi mảnh để dùng nguyên khối, chỉ không đưa vào thư viện dấu
    pa = [('?', to_piece(c, left, baseline)) for c in above]
    pb = [('?', to_piece(c, left, baseline)) for c in cl.below]
    if whole:
        if len(expect_above) == 2:                  # dấu cấu tạo nằm sát thân, dấu thanh ở trên
            s = [m for m in expect_above if m in STRUCT]
            t = [m for m in expect_above if m not in STRUCT]
            expect_above = s + t
        pa = [(m, to_piece(c, left, baseline)) for m, c in zip(expect_above, above)]
        pb = [(m, to_piece(c, left, baseline)) for m, c in zip(below_marks, cl.below)]
    return Sample(ch, line, [to_piece(c, left, baseline) for c in cl.bodies], pa, pb,
                  cl.bx1 - cl.bx0, baseline - cl.btop, whole)


# ---------------------------------------------------------------- dựng và ghép
def render(pieces: list[Piece]) -> tuple[np.ndarray, float, float]:
    """Gộp các mảnh thành một bitmap. Trả về (mask, x_left, y_top) theo hệ trục mảnh."""
    xl = min(p.x for p in pieces); xr = max(p.x + p.mask.shape[1] for p in pieces)
    yt = max(p.y_top for p in pieces); yb = min(p.y_top - p.mask.shape[0] for p in pieces)
    W, H = int(np.ceil(xr - xl)) + 2, int(np.ceil(yt - yb)) + 2
    canvas = np.zeros((H, W), bool)
    for p in pieces:
        c, r = int(round(p.x - xl)) + 1, int(round(yt - p.y_top)) + 1
        h, w = p.mask.shape
        canvas[r:r + h, c:c + w] |= p.mask
    return canvas, xl - 1, yt + 1


def shifted(p: Piece, dx: float, dy: float) -> Piece:
    return Piece(p.mask, p.x + dx, p.y_top + dy)


def piece_bottom(p: Piece) -> float: return p.y_top - p.mask.shape[0]
def piece_cx(p: Piece) -> float: return p.x + p.mask.shape[1] / 2


class Library:
    def __init__(self, samples: list[Sample]):
        self.direct: dict[str, Sample] = {}
        self.bodies: dict[str, list[Sample]] = {}
        self.on_body: dict[tuple[str, bool], list[tuple[Piece, float, float]]] = {}
        self.on_struct: dict[str, list[tuple[Piece, float, float]]] = {}
        by_char: dict[str, list[Sample]] = {}
        for s in samples:
            by_char.setdefault(s.char, []).append(s)
            if not s.whole:
                continue
            base, marks = split_char(s.char)
            upper = base.isupper()
            self.bodies.setdefault(base, []).append(s)
            struct = None
            for m, p in s.pieces_above:
                if m == '.':
                    continue
                if m in STRUCT or struct is None and m in TONES and not any(x in STRUCT for x in marks):
                    # đặt theo thân: lệch ngang từ tâm thân, khe hở trên đỉnh thân
                    self.on_body.setdefault((m, upper), []).append((p, piece_cx(p) - s.width / 2, piece_bottom(p) - s.body_top))
                    if m in STRUCT:
                        struct = p
                elif struct is not None:
                    self.on_struct.setdefault(m, []).append((p, piece_cx(p) - piece_cx(struct), piece_bottom(p) - struct.y_top))
            for m, p in s.pieces_below:
                self.on_body.setdefault((m, upper), []).append((p, piece_cx(p) - s.width / 2, p.y_top))
        for ch, lst in by_char.items():   # chọn mẫu có chiều cao trung vị
            good = [s for s in lst if s.whole] or lst
            good.sort(key=lambda s: s.body_top)
            self.direct[ch] = good[len(good) // 2]

    @staticmethod
    def pick(lst):
        lst = sorted(lst, key=lambda t: t[0].mask.shape[0])
        return lst[len(lst) // 2]

    def mark(self, m: str, upper: bool):
        if (m, upper) in self.on_body:
            return self.pick(self.on_body[(m, upper)]), False
        if (m, not upper) in self.on_body:
            return self.pick(self.on_body[(m, not upper)]), True
        return None, False

    def compose(self, ch: str):
        """Trả về (mảnh, ghi chú) hoặc (None, lý do)."""
        base, marks = split_char(ch)
        upper = base.isupper()
        if base not in self.bodies:
            return None, f'thiếu thân chữ "{base}" trong ảnh'
        # i/j có dấu thanh dùng thân không chấm: lấy thân của bất kỳ mẫu i nào (chấm là mảnh riêng)
        lst = sorted(self.bodies[base], key=lambda s: s.body_top); src = lst[len(lst) // 2]
        pieces = list(src.pieces_body)
        if base in 'ij' and not any(m in ABOVE for m in marks):
            dots = [p for s in self.bodies[base] for m, p in s.pieces_above if m == '.']
            if not dots:
                return None, f'không có mẫu "{base}" có chấm'
            dot_src = next(s for s in self.bodies[base] if any(m == '.' for m, _ in s.pieces_above))
            pieces = list(dot_src.pieces_body) + [p for m, p in dot_src.pieces_above if m == '.']
            src = dot_src
        notes = []
        top = src.body_top
        struct_piece = None
        for m in [x for x in marks if x in STRUCT] + [x for x in marks if x in TONES]:
            if m in TONES and struct_piece is not None and m in self.on_struct:
                p, dx, gap = self.pick(self.on_struct[m])
                newp = shifted(p, piece_cx(struct_piece) + dx - piece_cx(p), struct_piece.y_top + gap - piece_bottom(p))
            else:
                found, other_case = self.mark(m, upper)
                if found is None:
                    return None, f'thiếu mẫu dấu {unicodedata.name(m).lower()}'
                p, dx, gap = found
                if other_case:
                    notes.append(f'mượn dấu {unicodedata.name(m).lower()} của chữ {"thường" if upper else "hoa"}')
                if m in TONES and struct_piece is not None:
                    gap, ref_top = gap, struct_piece.y_top
                    notes.append('dấu thanh đặt trên dấu mũ/trăng theo khe hở trên thân')
                else:
                    ref_top = top
                newp = shifted(p, src.width / 2 + dx - piece_cx(p), ref_top + gap - piece_bottom(p))
            pieces.append(newp)
            if m in STRUCT:
                struct_piece = newp
        for m in [x for x in marks if x in BELOW]:
            found, other_case = self.mark(m, upper)
            if found is None:
                return None, 'thiếu mẫu dấu nặng'
            p, dx, y_top = found
            pieces.append(shifted(p, src.width / 2 + dx - piece_cx(p), y_top - p.y_top))
        return pieces, '; '.join(notes)


# ---------------------------------------------------------------- vector hóa và xuất
def trace_to_glyph(pieces, scale, lsb, smooth):
    mask, xl, yt = render(pieces)
    path = potrace.Bitmap(~mask).trace(turdsize=2, alphamax=smooth, opticurve=True, opttolerance=0.2)
    X = lambda x: round((x + xl) * scale + lsb - min(p.x for p in pieces) * scale)
    Y = lambda y: round((yt - y) * scale)
    def draw(pen):
        for curve in path.curves:
            sp = curve.start_point; pen.moveTo((X(sp.x), Y(sp.y)))
            for seg in curve.segments:
                if seg.is_corner:
                    pen.lineTo((X(seg.c.x), Y(seg.c.y))); pen.lineTo((X(seg.end_point.x), Y(seg.end_point.y)))
                else:
                    pen.curveTo((X(seg.c1.x), Y(seg.c1.y)), (X(seg.c2.x), Y(seg.c2.y)), (X(seg.end_point.x), Y(seg.end_point.y)))
            pen.closePath()
    tt = TTGlyphPen(None)
    # Sau khi lật trục y, viền ngoài của potrace đã theo chiều kim đồng hồ như TrueType yêu cầu
    draw(Cu2QuPen(tt, max_err=1.0, reverse_direction=False))
    glyph = tt.glyph()
    area = AreaPen(); draw(area)
    width = (max(p.x + p.mask.shape[1] for p in pieces) - min(p.x for p in pieces)) * scale
    return glyph, round(width + 2 * lsb), area.value


def notdef_box():
    pen = TTGlyphPen(None)
    for pts in ([(50, 0), (50, 700), (450, 700), (450, 0)], [(100, 50), (400, 50), (400, 650), (100, 650)]):
        pen.moveTo(pts[0]); [pen.lineTo(q) for q in pts[1:]]; pen.closePath()
    return pen.glyph()


def glyph_name(ch: str) -> str:
    return 'uni%04X' % ord(ch) if not (ch.isascii() and ch.isalnum()) else ch if ch.islower() or ch.isdigit() else ch + '_'


def main(argv=None):
    for stream in (sys.stdout, sys.stderr):      # cửa sổ PowerShell mặc định không in được tiếng Việt
        try: stream.reconfigure(encoding='utf-8')
        except Exception: pass
    ap = argparse.ArgumentParser(description='Dựng font TTF tiếng Việt từ ảnh chữ mẫu (chạy trên máy, không gọi AI).')
    ap.add_argument('image', type=Path, help='ảnh chữ mẫu: chữ tối trên nền sáng hoặc ngược lại, nền sạch')
    ap.add_argument('--text', help='nội dung chữ trong ảnh, mỗi dòng ảnh một dòng, phân tách bằng \\n')
    ap.add_argument('--text-file', type=Path, help='file UTF-8 chứa nội dung chữ trong ảnh, đúng thứ tự dòng')
    ap.add_argument('--name', default='Xuong Font Draft', help='tên family')
    ap.add_argument('--style', default='Regular')
    ap.add_argument('--out', type=Path, default=Path('output'))
    ap.add_argument('--threshold', type=int, help='ngưỡng 0-255; mặc định tự chọn (Otsu)')
    ap.add_argument('--upscale', type=float, default=1.0, help='phóng ảnh trước khi xử lý, dùng 2 khi chữ nhỏ hơn 60px')
    ap.add_argument('--smooth', type=float, default=1.0, help='alphamax của Potrace: nhỏ giữ góc, lớn làm cong (0.6-1.3)')
    ap.add_argument('--no-compose', action='store_true', help='không ghép chữ Việt còn thiếu')
    args = ap.parse_args(argv)

    if args.text_file:
        text = args.text_file.read_text(encoding='utf-8')
    elif args.text:
        text = args.text.replace('\\n', '\n')
    else:
        ap.error('cần --text hoặc --text-file')
    lines_text = [unicodedata.normalize('NFC', l.strip()) for l in text.splitlines() if l.strip()]

    ink = binarize(args.image, args.threshold, args.upscale)
    min_area = max(4, int(ink.shape[0] * ink.shape[1] * 2e-6))
    comps = components(ink, min_area)
    line_bodies, ref = group_lines(comps, len(lines_text))
    clusters = build_clusters(comps, line_bodies, ref)

    samples, skipped, review = [], [], []
    gaps_in_word, gaps_between = [], []
    for li, (line, txt) in enumerate(zip(clusters, lines_text)):
        words_txt = txt.split()
        words = split_words(line, len(words_txt))
        if words is None:
            skipped.append(f'dòng {li + 1}: không tách được {len(words_txt)} từ'); continue
        for a, b in zip(words, words[1:]):
            gaps_between.append(b[0].x0 - a[-1].x1)
        matched = []
        for wtxt, wcl in zip(words_txt, words):
            chars = list(wtxt)
            if len(wcl) < len(chars):
                # Dấu phẩy/chấm sát chữ trước có thể bị nhận là dấu dưới: tách ra thành ký tự riêng
                extra = sum(len(cl.below) for cl in wcl) - sum(expected_marks(ch)[1] for ch in chars)
                while extra > 0 and len(wcl) < len(chars):
                    owner = max(wcl, key=lambda cl: max((m.x1 for m in cl.below), default=-1))
                    m = max(owner.below, key=lambda m: m.x1)
                    owner.below.remove(m)
                    wcl = sorted(wcl + [Cluster([m])], key=lambda cl: cl.bx0)
                    extra -= 1
            if len(wcl) < len(chars):
                wcl, n = split_touching(wcl, len(chars))
                if n and len(wcl) == len(chars):
                    review.append(f'dòng {li + 1}, từ "{wtxt}": đã tự tách {n} chỗ chữ dính, cần soát lại hình')
            if len(chars) != len(wcl):
                skipped.append(f'dòng {li + 1}, từ "{wtxt}": {len(chars)} ký tự nhưng thấy {len(wcl)} khối (chữ dính nhau hoặc nét vỡ)')
                continue
            reassign_marks(chars, wcl)
            for a, b in zip(wcl, wcl[1:]):
                gaps_in_word.append(b.bx0 - a.bx1)
            matched += list(zip(chars, wcl))
        base_bottoms = [cl.bbottom for ch, cl in matched if split_char(ch)[0] in NO_DESCENDER]
        if not base_bottoms:
            skipped.append(f'dòng {li + 1}: không xác định được baseline'); continue
        baseline = statistics.median(base_bottoms)
        samples += [make_sample(ch, cl, li, baseline) for ch, cl in matched]

    if not samples:
        sys.exit('Không khớp được ký tự nào. Kiểm tra số dòng trong --text so với ảnh.\n' + '\n'.join(skipped))

    caps = [s.body_top for s in samples if s.char in FLAT_CAPS]
    xs = [s.body_top for s in samples if s.char in X_LETTERS]
    scale = 700 / statistics.median(caps) if caps else 480 / statistics.median(xs)
    lsb = max(10, statistics.median(gaps_in_word) * scale / 2) if gaps_in_word else 40
    space = statistics.median(gaps_between) * scale if gaps_between else 250

    lib = Library(samples)
    targets = {}
    for ch, s in lib.direct.items():
        targets[ch] = ('ảnh', s.pieces_body + [p for _, p in s.pieces_above] + [p for _, p in s.pieces_below], '')
    missing = []
    if not args.no_compose:
        for ch in vietnamese_set():
            if ch in targets:
                continue
            pieces, note = lib.compose(ch)
            if pieces is None:
                missing.append((ch, note))
            else:
                targets[ch] = ('ghép', pieces, note)
    else:
        missing = [(ch, 'không ghép') for ch in vietnamese_set() if ch not in targets]

    glyphs = {'.notdef': notdef_box(), 'space': TTGlyphPen(None).glyph()}
    metrics = {'.notdef': (round(space), 0), 'space': (round(space), 0)}
    cmap = {32: 'space'}
    order = sorted(targets, key=ord)
    for ch in order:
        g, adv, area = trace_to_glyph(targets[ch][1], scale, lsb, args.smooth)
        name = glyph_name(ch)
        glyphs[name] = g; cmap[ord(ch)] = name
        metrics[name] = (adv, round(lsb))

    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(['.notdef', 'space'] + [glyph_name(c) for c in order])
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    glyf = fb.font['glyf']
    for name in glyf.keys():
        glyf[name].recalcBounds(glyf)
    ymax = max((getattr(glyf[n], 'yMax', 0) for n in glyf.keys()), default=900)
    ymin = min((getattr(glyf[n], 'yMin', 0) for n in glyf.keys()), default=-250)
    fb.setupHorizontalMetrics({n: (adv, getattr(glyf[n], 'xMin', 0)) for n, (adv, _) in metrics.items()})
    asc, desc = max(ymax, 900), min(ymin, -250)
    fb.setupHorizontalHeader(ascent=asc, descent=desc)
    family = args.name
    ps = (family + '-' + args.style).replace(' ', '')
    fb.setupNameTable({'familyName': family, 'styleName': args.style, 'uniqueFontIdentifier': ps + ' draft',
                       'fullName': family + ' ' + args.style, 'psName': ps, 'version': 'Version 0.100 draft'})
    fb.setupOS2(sTypoAscender=asc, sTypoDescender=desc, sTypoLineGap=0, usWinAscent=asc, usWinDescent=-desc,
                sxHeight=round(statistics.median(xs) * scale) if xs else 480, sCapHeight=700,
                usWeightClass=400, fsSelection=0x40, achVendID='XFNT')
    now = timestampNow()
    fb.setupPost(); fb.setupHead(unitsPerEm=UPM, created=now, modified=now)
    args.out.mkdir(parents=True, exist_ok=True)
    ttf = args.out / (ps + '.ttf')
    fb.save(ttf)

    # ---- báo cáo và ảnh thử
    vn = vietnamese_set()
    have = [c for c in vn if c in targets]
    report = {
        'font': str(ttf), 'scale_units_per_px': round(scale, 3), 'sidebearing': round(lsb), 'space': round(space),
        'from_image': sorted(c for c, t in targets.items() if t[0] == 'ảnh'),
        'composed': {c: targets[c][2] or 'ghép từ thân + dấu có mẫu' for c in sorted(targets) if targets[c][0] == 'ghép'},
        'missing': dict(missing),
        'vietnamese_coverage': f'{len(have)}/{len(vn)}',
        'skipped_words': skipped,
        'needs_review': review,
    }
    (args.out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    proof(ttf, args.out / 'proof.png', lines_text, have)
    print(f'Đã xuất {ttf}')
    print(f'Ký tự lấy trực tiếp từ ảnh: {len(report["from_image"])}; ghép thêm: {len(report["composed"])}; '
          f'phủ tiếng Việt {report["vietnamese_coverage"]}')
    if missing:
        by_reason: dict[str, list[str]] = {}
        for c, why in missing:
            by_reason.setdefault(why, []).append(c)
        print('Chưa dựng được (thêm ảnh có các chữ/dấu này):')
        for why, cs in by_reason.items():
            print(f'  - {why}: {" ".join(cs)}')
    for s in skipped:
        print('Bỏ qua: ' + s)
    for s in review:
        print('Cần soát: ' + s)
    print(f'Xem {args.out / "proof.png"} và {args.out / "report.json"}')


def proof(ttf: Path, out: Path, lines_text, have):
    size = 64
    font = ImageFont.truetype(str(ttf), size)
    rows = list(lines_text)
    vn = vietnamese_set()
    rows += [' '.join(vn[i:i + 18]) for i in range(0, len(vn), 18)]
    rows += ['BỘ SƯU TẬP FONT — NGUYỄN HỮU ĐẠT', 'Trường học giữ gìn tiếng Việt mỗi ngày.']
    lh = int(size * 1.6)
    W = max(int(font.getlength(r)) for r in rows) + 80
    img = Image.new('L', (W, lh * len(rows) + 60), 255)
    d = ImageDraw.Draw(img)
    for i, r in enumerate(rows):
        d.text((40, 30 + i * lh), r, font=font, fill=0)
    img.save(out)


if __name__ == '__main__':
    main()
