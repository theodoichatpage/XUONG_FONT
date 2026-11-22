// Đo lỗi đường nét theo các phép kiểm outline của dự án (npm run check:font: fontbakery outline_jaggy_segments,
// outline_short_segments, outline_semi_vertical, outline_colinear_vectors) cộng một phép đo "đường cong gấp khúc":
// - xù (jaggy): hai đoạn liền nhau quay gắt (mũi nhọn hẹp < 9°) do dò ảnh răng cưa;
// - đoạn ngắn: đoạn dài < 4/1000 em (bậc thang pixel);
// - gần đứng/ngang: đoạn thẳng lệch trục 0,1–2° (cạnh lẽ ra thẳng đứng/ngang bị nghiêng do dò ảnh);
// - gấp khúc: chuỗi ≥ 3 đoạn thẳng liên tiếp, mỗi chỗ nối quay 3–35° (đường cong bị vẽ bằng nhiều đoạn thẳng).
// Đơn vị: UPM 1000. Chỉ dùng để quyết định có nắn nét hay không và mức nắn; không chấm thẩm mỹ.
import svgpath from 'svgpath';

const angleOf = v => Math.atan2(v[1], v[0]) * 180 / Math.PI;
const turn = (a, b) => { let t = Math.abs(angleOf(b) - angleOf(a)) % 360; return t > 180 ? 360 - t : t; };
const len = v => Math.hypot(v[0], v[1]);

export function outlineDefects(d) {
  const out = { jaggy: 0, short: 0, semi: 0, kinks: 0 };
  let edges = [], start, current;
  const contours = [];
  for (const s of svgpath(d).abs().unshort().unarc().segments) {
    if (s[0] === 'M') { if (edges.length) contours.push(edges); edges = []; start = current = s.slice(1, 3); continue; }
    const to = s[0] === 'Z' ? start : s[0] === 'H' ? [s[1], current[1]] : s[0] === 'V' ? [current[0], s[1]] : s.slice(-2);
    const controls = s[0] === 'C' ? [s.slice(1, 3), s.slice(3, 5)] : s[0] === 'Q' ? [s.slice(1, 3)] : [];
    const chord = [to[0] - current[0], to[1] - current[1]];
    if (len(chord) > 1e-6 || controls.length) {
      const first = controls.length ? [controls[0][0] - current[0], controls[0][1] - current[1]] : chord;
      const last = controls.length ? [to[0] - controls.at(-1)[0], to[1] - controls.at(-1)[1]] : chord;
      edges.push({ line: !controls.length, chord, length: len(chord), begin: len(first) > 1e-6 ? first : chord, end: len(last) > 1e-6 ? last : chord });
    }
    current = to;
    if (s[0] === 'Z') { contours.push(edges); edges = []; }
  }
  if (edges.length) contours.push(edges);
  for (const list of contours) {
    const n = list.length;
    if (n < 3) continue;
    let run = 0;
    for (let i = 0; i < n; i++) {
      const e = list[i], next = list[(i + 1) % n];
      if (e.length < 4) out.short++;
      if (e.line && e.length > 20) {
        const a = Math.abs(angleOf(e.chord)) % 90, off = Math.min(a, 90 - a);
        if (off > .1 && off < 2) out.semi++;
      }
      const t = turn(e.end, next.begin);
      if (t > 171) out.jaggy++;
      if (e.line && next.line && t >= 3 && t <= 35) { run++; if (run === 2) out.kinks++; } else run = 0;
    }
  }
  out.total = out.jaggy + out.short + out.semi + out.kinks;
  return out;
}
