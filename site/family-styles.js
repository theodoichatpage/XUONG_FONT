export const familyWeights = [
  { name: 'ExtraLight', weight: 200, offset: -14 }, { name: 'Light', weight: 300, offset: -7 },
  { name: 'Regular', weight: 400, offset: 0 }, { name: 'Medium', weight: 500, offset: 7 },
  { name: 'SemiBold', weight: 600, offset: 12 }, { name: 'Bold', weight: 700, offset: 20 },
  { name: 'ExtraBold', weight: 800, offset: 28 }, { name: 'Black', weight: 900, offset: 36 }
];
export const familyStyles = familyWeights.flatMap(item => [
  { ...item, style: item.name, italic: false }, { ...item, style: item.name + ' Italic', italic: true }
]);
export function identifyFamilyStyle(record) {
  const raw = (record.style || record.name || '').replace(/[\s_-]/g, '').toLowerCase();
  const italic = /italic|oblique/.test(raw);
  const names = [['extralight','ExtraLight'],['ultralight','ExtraLight'],['xlight','ExtraLight'],['extrabold','ExtraBold'],['ultrabold','ExtraBold'],['xbold','ExtraBold'],['semibold','SemiBold'],['demibold','SemiBold'],['medium','Medium'],['black','Black'],['heavy','Black'],['thin','Thin'],['light','Light'],['bold','Bold']];
  const name = names.find(([key]) => raw.includes(key))?.[1] || 'Regular';
  return name + (italic ? ' Italic' : '');
}
