const vowels='aăâeêioôơuưyAĂÂEÊIOÔƠUƯY';
const tones=['','\u0300','\u0301','\u0309','\u0303','\u0323'];
export const vietnameseCheckCharacters=[...new Set([...vowels].flatMap(v=>tones.map(t=>(v+t).normalize('NFC'))).concat(['đ','Đ']))];
export function analyzeVietnameseCoverage(font){
  const drawn=char=>{const index=font.charToGlyphIndex(char);return !!index&&font.glyphs.get(index).path.commands.length>0;};
  const entries=vietnameseCheckCharacters.map(char=>{
    const index=font.charToGlyphIndex(char),nfd=[...char.normalize('NFD')];
    const components=nfd.length>1&&nfd.every(drawn);
    const status=drawn(char)?'present':index?'blank':components?'components':'missing';
    return {char,code:'U+'+char.codePointAt(0).toString(16).toUpperCase().padStart(4,'0'),status,components};
  });
  const counts={present:0,blank:0,components:0,missing:0};for(const item of entries)counts[item.status]++;
  return {entries,counts,total:entries.length};
}
