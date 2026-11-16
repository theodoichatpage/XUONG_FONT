import svgpath from 'svgpath';

const { fixWinding } = require('../src/winding');

export const draftSources = Object.freeze({
  reference: 'AI theo ảnh',
  inferred: 'AI suy đoán'
});

export async function designReferences(entries, loadImage, signal) {
  if (entries.length > 36) throw new Error('Mỗi lượt hỗ trợ tối đa 36 ảnh. Bỏ bớt ảnh trùng rồi thử lại.');
  const samples = [];
  for (let start = 0; start < entries.length; start += 12) {
    signal.throwIfAborted();
    const group = entries.slice(start, start + 12);
    // Preserve enough space for the tall, narrow historical title samples.
    const tileWidth = 390, tileHeight = 420;
    const cols = Math.min(group.length, 3);
    const sheet = document.createElement('canvas');
    sheet.width = cols * tileWidth;
    sheet.height = Math.ceil(group.length / cols) * tileHeight;
    const ctx = sheet.getContext('2d');
    ctx.fillStyle = '#f6f1e8';
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    ctx.font = '16px sans-serif';
    for (const [index, entry] of group.entries()) {
      signal.throwIfAborted();
      const image = await loadImage(entry.file, entry.settings?.crop);
      const scale = Math.min((tileWidth - 22) / image.width, (tileHeight - 34) / image.height);
      const x = (index % cols) * tileWidth, y = Math.floor(index / cols) * tileHeight;
      ctx.fillStyle = '#29221d';
      ctx.fillText('Ảnh ' + (start + index + 1), x + 10, y + 20);
      ctx.imageSmoothingEnabled = scale < 1;
      ctx.drawImage(image, x + (tileWidth - image.width * scale) / 2, y + 28, image.width * scale, image.height * scale);
    }
    const encoded = sheet.toDataURL('image/jpeg', .88).split(',')[1];
    samples.push(encoded.length <= 900_000 ? encoded : sheet.toDataURL('image/jpeg', .68).split(',')[1]);
  }
  return samples;
}

export function validateAiGlyph(row, requested) {
  const { char, path, advance, evidence } = row ?? {};
  if (!requested.includes(char) || typeof path !== 'string' || path.length > 4900
    || !/^[MLCQZ\d.,\s+-]+$/.test(path) || !Number.isFinite(advance) || advance < 90 || advance > 1600
    || !Object.hasOwn(draftSources, evidence)) return null;
  const parsed = svgpath(path);
  if (parsed.err || parsed.segments.length < 4 || parsed.segments.length > 380) return null;
  let open = false, edges = 0, contours = 0;
  for (const [command, ...nums] of parsed.segments) {
    if (!nums.every((value, i) => Number.isFinite(value) && value >= (i % 2 ? -250 : -80)
      && value <= (i % 2 ? 1080 : advance + 80))) return null;
    if (command === 'M') {
      if (open) return null;
      open = true;
      edges = 0;
    } else if (command === 'Z') {
      if (!open || edges < 2) return null;
      open = false;
      contours++;
    } else if (open && ['L', 'Q', 'C'].includes(command)) edges++;
    else return null;
  }
  if (open || !contours) return null;
  const coordinates = parsed.segments.flatMap(([, ...numbers]) => numbers);
  const xs = coordinates.filter((_, i) => i % 2 === 0), ys = coordinates.filter((_, i) => i % 2 === 1);
  if (Math.max(...xs) - Math.min(...xs) < 8 || Math.max(...ys) - Math.min(...ys) < 8) return null;
  try {
    return { char, d: fixWinding(parsed.round(1).toString()), advance: Math.round(advance), source: draftSources[evidence] };
  } catch { return null; }
}

export async function requestGlyphDesign({ chars, samples, key, model, anchors, signal }) {
  const response = await fetch('/api/glyph-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-gemini-key': key },
    body: JSON.stringify({ mode: 'design', preferredModel: model, chars, samples, anchors }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(42000)])
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Gemini chưa dựng được nhóm ký tự.');
  const byChar = new Map(), duplicates = new Set();
  for (const row of data.glyphs ?? []) {
    const glyph = validateAiGlyph(row, chars);
    if (!glyph) continue;
    if (byChar.has(glyph.char)) duplicates.add(glyph.char);
    byChar.set(glyph.char, glyph);
  }
  return { glyphs: [...byChar.values()].filter(glyph => !duplicates.has(glyph.char)), model: data.model };
}


export async function inventoryImage(image, key, model, signal) {
  const proof = document.createElement('canvas');
  const scale = Math.min(2, 1200 / Math.max(image.width, image.height));
  proof.width = Math.max(1, Math.round(image.width * scale));
  proof.height = Math.max(1, Math.round(image.height * scale));
  const ctx = proof.getContext('2d');
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.drawImage(image, 0, 0, proof.width, proof.height);
  try {
    const response = await fetch('/api/glyph-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-gemini-key': key },
      body: JSON.stringify({ mode: 'inventory', preferredModel: model, image: proof.toDataURL('image/jpeg', .91).split(',')[1] }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(33000)])
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data.words)) {
      const error = new Error(data.error ?? 'Gemini chưa trả được vùng chữ.');
      error.status = response.ok ? 502 : response.status;
      throw error;
    }
    return { words: data.words, model: data.model };
  } catch (error) {
    if (error.name === 'TimeoutError') throw new Error('Chờ Gemini quá 33 giây.');
    throw error;
  }
}
