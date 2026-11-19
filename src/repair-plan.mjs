export const repairDecisionSchema = {
  type: 'OBJECT', properties: { decisions: { type: 'ARRAY', items: {
    type: 'OBJECT', properties: { char: { type: 'STRING' }, action: { type: 'STRING', enum: ['approve', 'skip'] }, reason: { type: 'STRING' } }, required: ['char', 'action', 'reason']
  } } }, required: ['decisions']
};
export function validateRepairCandidates(candidates) {
  return Array.isArray(candidates) && candidates.length > 0 && candidates.length <= 12 &&
    new Set(candidates.map(item => item?.char)).size === candidates.length && candidates.every(item =>
      typeof item?.char === 'string' && [...item.char].length === 1 && Number.isFinite(item.measured) && item.measured >= 0 &&
      Number.isFinite(item.gap) && item.gap >= 0 && item.gap <= 140);
}
export function validateRepairDecisions(value, candidates) {
  if (!Array.isArray(value?.decisions) || value.decisions.length > candidates.length) throw new Error('Kết quả AI không hợp lệ.');
  const allowed = new Set(candidates.map(item => item.char)), seen = new Set();
  return value.decisions.map(item => {
    if (!allowed.has(item.char) || seen.has(item.char) || !['approve','skip'].includes(item.action) || typeof item.reason !== 'string' || item.reason.length > 500) throw new Error('AI trả thay đổi ngoài phạm vi.');
    seen.add(item.char);
    return { char: item.char, action: item.action, reason: item.reason };
  });
}
