import { validateRepairDecisions } from '../src/repair-plan.mjs';
import { glyphBounds } from './glyph-review.js';

function proofImage(proposals) {
  const canvas = document.createElement('canvas');
  canvas.width = 960; canvas.height = proposals.length * 190;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  for (const [index, proposal] of proposals.entries()) {
    const a = glyphBounds(proposal.before), b = glyphBounds(proposal.after);
    const left = Math.min(a.x, b.x), bottom = Math.min(a.y, b.y);
    const right = Math.max(a.x+a.width, b.x+b.width), top = Math.max(a.y+a.height, b.y+b.height);
    const scale = Math.min(350 / Math.max(1,right-left), 140 / Math.max(1,top-bottom));
    for (const [column,glyph] of [proposal.before,proposal.after].entries()) {
      context.save(); context.fillStyle = '#000'; context.font = '16px sans-serif';
      context.fillText(proposal.char + (column ? ' AFTER' : ' BEFORE'), column*480+20, index*190+22);
      context.translate(column*480+100-left*scale, index*190+175+bottom*scale);
      context.scale(scale,-scale); context.fill(new Path2D(glyph.d)); context.restore();
    }
  }
  return canvas.toDataURL('image/jpeg', .9).split(',')[1];
}

export async function reviewMarkRepairs(proposals, key, preferredModel, onProgress = () => {}) {
  const accepted = [], skipped = [];
  for (let offset = 0; offset < proposals.length; offset += 12) {
    const batch = proposals.slice(offset, offset+12);
    onProgress('AI đang đối chiếu bản sửa ' + (offset+1) + '–' + (offset+batch.length) + ' / ' + proposals.length + '…');
    const candidates = batch.map(({char,measured,gap}) => ({char,measured,gap}));
    const response = await fetch('/api/glyph-review', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-gemini-key': key },
      body: JSON.stringify({ mode: 'mark-repair', preferredModel, image: proofImage(batch), candidates }),
      signal: AbortSignal.timeout(33000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'AI chưa duyệt được bản sửa.');
    const decisions = validateRepairDecisions(data, candidates);
    for (const proposal of batch) {
      const decision = decisions.find(item => item.char === proposal.char);
      if (decision?.action === 'approve') accepted.push({ ...proposal, aiReason: decision.reason, aiModel: data.model });
      else skipped.push({ char: proposal.char, reason: decision?.reason || 'AI chưa đủ bằng chứng để duyệt.' });
    }
  }
  return { accepted, skipped };
}
