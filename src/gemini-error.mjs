// Đọc phần lỗi Gemini trả về để người dùng thấy lý do thật thay vì một câu chung chung.
export async function readGeminiError(response) {
  let body = null;
  try { body = await response.json(); } catch { /* thân lỗi không phải JSON */ }
  const error = body?.error ?? {};
  const reason = (error.details ?? []).map(detail => detail?.reason).find(Boolean) ?? '';
  const message = typeof error.message === 'string' ? error.message.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
  return { status: response.status, reason, apiStatus: error.status ?? '', message };
}

export function isKeyError(info) {
  return info.reason === 'API_KEY_INVALID' || info.reason === 'API_KEY_EXPIRED'
    || /api key (not valid|expired|invalid)/i.test(info.message);
}

export function explainGeminiError(info) {
  const text = info.message.toLowerCase();
  let summary;
  if (isKeyError(info)) summary = 'Khóa Gemini API không hợp lệ, đã hết hạn hoặc bị thu hồi. Tạo khóa mới trong Google AI Studio rồi nhập lại.';
  else if (text.includes('location') && text.includes('not supported')) summary = 'Gemini API chưa hỗ trợ khu vực của máy chủ đang gọi.';
  else if (text.includes('billing') || text.includes('free tier')) summary = 'Dự án Google cần bật thanh toán (billing) cho mẫu Gemini này.';
  else if (info.status === 401 || info.status === 403) summary = 'Gemini từ chối khóa API hoặc quyền của dự án.';
  else if (info.status === 429) summary = 'Đã chạm hạn mức Gemini. Xem Rate Limit trong Google AI Studio.';
  else if (info.status === 404) summary = 'Các mẫu Gemini được thử không khả dụng cho dự án này.';
  else if (info.status === 503) summary = 'Gemini đang quá tải. Hãy thử lại sau.';
  else if (info.status === 400) summary = 'Gemini không chấp nhận yêu cầu.';
  else summary = 'Gemini chưa xử lý được yêu cầu.';
  const detail = info.message ? ' Chi tiết từ Gemini: ' + info.message : '';
  return summary + detail + ' (Gemini HTTP ' + info.status + (info.reason ? ', ' + info.reason : '') + ').';
}
