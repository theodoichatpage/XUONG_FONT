// Old proof records remain stored, but must be rechecked with the current metric
// version before they can authorize a new approval.
export const proofMetricVersion=2;
export function canApproveProof(glyph,{minIoU=.96,maxContourDistance=1,maxContourDeviation=4}={}){
  const proof=glyph?.proof;
  if(!proof||proof.metricVersion!==proofMetricVersion||glyph.reconstructionStatus==='needs-better-image'||glyph.reconstructionStatus==='rejected')return false;
  return proof.version===glyph.version&&proof.threshold===(glyph.processing?.threshold??128)&&proof.minIoU===minIoU&&
    proof.maxContourDistance===maxContourDistance&&proof.maxContourDeviation===maxContourDeviation&&
    !!proof.vectorResult?.pass&&!!proof.fontResult?.pass;
}
