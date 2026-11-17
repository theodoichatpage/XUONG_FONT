function encodeReference(image) {
  const proof = document.createElement('canvas');
  const scale = Math.min(2, 1200 / Math.max(image.width, image.height));
  proof.width = Math.max(1, Math.round(image.width * scale));
  proof.height = Math.max(1, Math.round(image.height * scale));
  const ctx = proof.getContext('2d');
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.drawImage(image, 0, 0, proof.width, proof.height);
  return proof.toDataURL('image/jpeg', .91).split(',')[1];
}

export async function redrawFontImage(images, task, key, signal) {
  const response = await fetch('/api/font-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-gemini-key': key },
    body: JSON.stringify({ ...task, images: images.map(encodeReference) }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(110000)])
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw Object.assign(new Error(data.error ?? 'Gemini chưa tạo được ảnh.'), { status: response.status });
  }
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    return canvas;
  } finally {
    bitmap.close();
  }
}

export async function inventoryImage(image, key, model, signal) {
  try {
    const response = await fetch('/api/glyph-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-gemini-key': key },
      body: JSON.stringify({ mode: 'inventory', preferredModel: model, image: encodeReference(image) }),
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
