import { vietnameseDesignInstruction } from '../src/vietnamese-design-rules.mjs';
import { readGeminiError, isKeyError, explainGeminiError } from '../src/gemini-error.mjs';
const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent';

const visualStyle = vietnameseDesignInstruction + ' Keep the reference font’s proportions, weight, counters, terminals and stroke contrast. Pure black ink on a flat pure white background. No rulers, borders, labels, shadows or decoration.';
const row = 'Exactly one horizontal row with large, equal white gaps between glyphs. Leave generous white margins. No glyphs may touch.';

function promptFor(mode, chars) {
  if (mode === 'clean') return 'Redraw only the visible type from this reference, retaining every character and diacritic in its original reading order. Preserve the original layout, line breaks, glyph sizes relative to the canvas, proportions and thin hairlines. Remove the colored/textured background and pale watermark without restyling the letters, thickening strokes, adding text or replacing the typeface. Make the edges sharp. ' + visualStyle;
  if (mode === 'marks') return 'Draw exactly eight isolated Vietnamese font marks, left to right: acute, grave, a single dot below, tilde, hook above (small hook without a dot), breve, circumflex, horn (short curved attachment with its base at left). Draw just the marks, no letters. ' + row + ' ' + visualStyle;
  if (mode === 'row' && Array.isArray(chars) && chars.length >= 1 && chars.length <= 9
    && chars.every(char => typeof char === 'string' && /^[A-Za-zĐđ0-9.,:;!?–—()“”‘’/+<>-]$/u.test(char))) {
    return 'Draw exactly these standalone glyphs in order and case: ' + JSON.stringify(chars) + '. ' + row + ' ' + visualStyle;
  }
}

function fail(error, status) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const maxDuration = 120;

export async function POST(request) {
  const key = request.headers.get('x-gemini-key')?.trim();
  if (!key || key.length > 256) return fail('Hãy nhập khóa Gemini API.', 401);
  const input = await request.json().catch(() => null);
  const { mode, images, chars } = input ?? {};
  const prompt = promptFor(mode, chars);
  if (!prompt || !Array.isArray(images) || images.length < 1 || images.length > 2
    || !images.every(data => typeof data === 'string' && data.length <= 1_250_000 && /^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(data))) {
    return fail('Yêu cầu tạo ảnh font không hợp lệ.', 400);
  }
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, ...images.map(data => ({ inlineData: { mimeType: 'image/jpeg', data } }))] }],
        generationConfig: { responseModalities: ['IMAGE'], ...(mode === 'clean' ? {} : {imageConfig: { aspectRatio: '3:2' }}) }
      }),
      signal: AbortSignal.timeout(100000)
    });
    if (!response.ok) {
      const info = await readGeminiError(response);
      const status = isKeyError(info) ? 401 : [400, 401, 403, 404, 429].includes(info.status) ? info.status : 502;
      return fail(explainGeminiError(info), status);
    }
    const payload = await response.json();
    const image = payload.candidates?.[0]?.content?.parts?.find(part => !part.thought && part.inlineData)?.inlineData;
    if (!image?.data || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType)) {
      return fail('Gemini chưa trả về ảnh font.', 502);
    }
    return new Response(Buffer.from(image.data, 'base64'), {
      headers: { 'Content-Type': image.mimeType, 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return fail(error.name === 'TimeoutError' ? 'Gemini tạo ảnh quá lâu.' : 'Chưa đọc được ảnh từ Gemini.', 502);
  }
}
