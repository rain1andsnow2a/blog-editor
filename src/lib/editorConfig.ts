// 编辑器的静态配置数据：颜色板、代码语言、易经符号等。
// 只放纯数据，不放组件和编辑器行为。

export const TEXT_COLORS = [
  { name: '默认', color: '#37352f' },
  { name: '灰色', color: '#787774' },
  { name: '棕色', color: '#9f6b53' },
  { name: '橙色', color: '#d9730d' },
  { name: '黄色', color: '#cb912f' },
  { name: '绿色', color: '#448361' },
  { name: '蓝色', color: '#337ea9' },
  { name: '紫色', color: '#9065b0' },
  { name: '粉色', color: '#c14c8a' },
  { name: '红色', color: '#d44c47' },
];

export const BG_COLORS = [
  { name: '默认', color: 'transparent' },
  { name: '灰色', color: '#f1f1ef' },
  { name: '棕色', color: '#f4eeee' },
  { name: '橙色', color: '#fbecdd' },
  { name: '黄色', color: '#fbf3db' },
  { name: '绿色', color: '#edf3ec' },
  { name: '蓝色', color: '#e7f3f8' },
  { name: '紫色', color: '#f6f3f9' },
  { name: '粉色', color: '#faf1f5' },
  { name: '红色', color: '#fdebec' },
];

export const CODE_LANGUAGES = [
  { label: 'Plain Text', value: '' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'Python', value: 'python' },
  { label: 'PowerShell', value: 'powershell' },
  { label: 'Bash', value: 'bash' },
  { label: 'JSON', value: 'json' },
  { label: 'HTML', value: 'html' },
  { label: 'CSS', value: 'css' },
  { label: 'Markdown', value: 'markdown' },
  { label: 'Mermaid 图表', value: 'mermaid' },
  { label: '思维导图', value: 'mindmap' },
];

/** 插入思维导图时的起手模板：首行中心主题，其余按两空格缩进分层 */
export const MINDMAP_TEMPLATE = [
  '中心主题',
  '  第一条分支',
  '    要点一',
  '    要点二',
  '  第二条分支',
  '    要点三',
].join('\n');

export const MERMAID_TEMPLATE = 'graph TD\n  A[开始] --> B[完成]';

// --- 易经符号（纯数据，动作由 Editor 统一绑定为插入符号） ---
export type YijingSymbol = { id: string; label: string; desc: string; symbol: string };

export const YAO_SYMBOLS: YijingSymbol[] = [
  { id: 'yin-yao', label: '阴爻', desc: '易经阴爻符号', symbol: '⚋' },
  { id: 'yang-yao', label: '阳爻', desc: '易经阳爻符号', symbol: '⚊' },
];

export const BAGUA_SYMBOLS: YijingSymbol[] = [
  { id: 'qian', label: '乾', desc: '天卦', symbol: '☰' },
  { id: 'dui', label: '兑', desc: '泽卦', symbol: '☱' },
  { id: 'li', label: '离', desc: '火卦', symbol: '☲' },
  { id: 'zhen', label: '震', desc: '雷卦', symbol: '☳' },
  { id: 'xun', label: '巽', desc: '风卦', symbol: '☴' },
  { id: 'kan', label: '坎', desc: '水卦', symbol: '☵' },
  { id: 'gen', label: '艮', desc: '山卦', symbol: '☶' },
  { id: 'kun', label: '坤', desc: '地卦', symbol: '☷' },
];

const HEXAGRAM_NAMES = [
  '乾', '坤', '屯', '蒙', '需', '讼', '师', '比',
  '小畜', '履', '泰', '否', '同人', '大有', '谦', '豫',
  '随', '蛊', '临', '观', '噬嗑', '贲', '剥', '复',
  '无妄', '大畜', '颐', '大过', '坎', '离', '咸', '恒',
  '遁', '大壮', '晋', '明夷', '家人', '睽', '蹇', '解',
  '损', '益', '夬', '姤', '萃', '升', '困', '井',
  '革', '鼎', '震', '艮', '渐', '归妹', '丰', '旅',
  '巽', '兑', '涣', '节', '中孚', '小过', '既济', '未济',
];

const CN_ORDINALS = [
  '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '二十一', '二十二', '二十三', '二十四', '二十五', '二十六', '二十七', '二十八', '二十九', '三十',
  '三十一', '三十二', '三十三', '三十四', '三十五', '三十六', '三十七', '三十八', '三十九', '四十',
  '四十一', '四十二', '四十三', '四十四', '四十五', '四十六', '四十七', '四十八', '四十九', '五十',
  '五十一', '五十二', '五十三', '五十四', '五十五', '五十六', '五十七', '五十八', '五十九', '六十',
  '六十一', '六十二', '六十三', '六十四',
];

/** 六十四卦：Unicode 从 U+4DC0（䷀）起按卦序连续编码，直接生成 */
export const HEXAGRAM_SYMBOLS: YijingSymbol[] = HEXAGRAM_NAMES.map((label, i) => ({
  id: `hex-${i + 1}`,
  label,
  desc: `第${CN_ORDINALS[i]}卦`,
  symbol: String.fromCodePoint(0x4dc0 + i),
}));

export const YIJING_GROUPS: Array<{ id: string; title: string; symbols: YijingSymbol[] }> = [
  { id: 'yao', title: '阴阳爻', symbols: YAO_SYMBOLS },
  { id: 'bagua', title: '八卦', symbols: BAGUA_SYMBOLS },
  { id: 'hexagrams', title: '六十四卦', symbols: HEXAGRAM_SYMBOLS },
];
