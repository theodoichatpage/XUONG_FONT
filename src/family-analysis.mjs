// Schema giữ thật gọn: Gemini từ chối schema có giới hạn độ dài mảng lồng nhau hoặc mô tả dài
// ("too many states for serving"). Giới hạn số lượng và hướng dẫn chi tiết nằm trong lời nhắc
// hệ thống; validateFamilyAnalysis cắt và kiểm lại kết quả.
const region={type:'ARRAY',items:{type:'OBJECT',properties:{text:{type:'STRING'},box:{type:'ARRAY',items:{type:'INTEGER'}}},required:['text','box']}};
export const analysisSchema={type:'OBJECT',properties:{
  style:{type:'STRING'},
  confidence:{type:'NUMBER'},basis:{type:'STRING',enum:['label','visual','uncertain']},evidence:{type:'STRING'},
  quality:{type:'STRING',enum:['clear','needs-review','needs-better-image']},
  profile:{type:'OBJECT',properties:Object.fromEntries(['serif','contrast','terminals','stress','proportion','capHeight','xHeight','ascender','descender','slant','spacing','diacritics'].map(k=>[k,{type:'STRING'}]))},
  words:region,
  lines:region
},required:['style','confidence','basis','evidence','profile','words']};
export const analysisSchemaGuide='Output fields: style is one of ExtraLight, Light, Regular, Medium, SemiBold, Bold, ExtraBold, Black, optionally followed by " Italic", or an empty string if uncertain. confidence is 0..1. Each profile field holds observed evidence only, empty string when not measurable. words: at most 70 regions; lines: at most 30, every visible text line in reading order with exact transcription including all accents and descenders. Every box is exactly four integers [top,left,bottom,right] normalized 0..1000.';
const names=['ExtraLight','Light','Regular','Medium','SemiBold','Bold','ExtraBold','Black'];
export function validateFamilyAnalysis(value){
  if(!value||typeof value.style!=='string'||!['',...names,...names.map(n=>n+' Italic')].includes(value.style)||!Number.isFinite(value.confidence)||value.confidence<0||value.confidence>1||!['label','visual','uncertain'].includes(value.basis)||typeof value.evidence!=='string'||value.evidence.length>1000||!Array.isArray(value.words)||!value.profile)throw Error('AI phân loại không hợp lệ.');
  const profile={};for(const key of Object.keys(analysisSchema.properties.profile.properties)){const v=value.profile[key];if(v!=null&&typeof v!=='string')throw Error('Hồ sơ thiết kế không hợp lệ.');profile[key]=(v||'').slice(0,1000);}
  const words=value.words.filter(w=>typeof w?.text==='string'&&w.text.length<=100&&Array.isArray(w.box)&&w.box.length===4&&w.box.every(n=>Number.isInteger(n)&&n>=0&&n<=1000)&&w.box[0]<w.box[2]&&w.box[1]<w.box[3]).slice(0,70);
  const lines=Array.isArray(value.lines)?value.lines.filter(w=>typeof w?.text==='string'&&w.text.length<=200&&Array.isArray(w.box)&&w.box.length===4&&w.box.every(n=>Number.isInteger(n)&&n>=0&&n<=1000)&&w.box[0]<w.box[2]&&w.box[1]<w.box[3]).slice(0,30):[];
  return {...value,lines,quality:['clear','needs-review','needs-better-image'].includes(value.quality)?value.quality:'needs-review',profile,words,needsConfirmation:!value.style||value.confidence<.85||value.basis!=='label'};
}
