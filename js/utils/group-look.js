// Sheets store no icon/color per group, so they are derived from the name, falling back to a palette by position
const RULES = [
  [/bank|kbank|scb|ktb|bbl|krungsri|ttb|gsb|ธนาคาร|บัญชี/i, 'bank2'],
  [/ktc|card|choice|visa|master|บัตร/i, 'credit-card-2-front'],
  [/saving|save|ออม/i, 'piggy-bank'],
  [/shop|lazada|shopee|ซื้อ/i, 'bag'],
  [/home|house|บ้าน|คอนโด/i, 'house'],
  [/food|อาหาร|กิน/i, 'cup-hot'],
  [/car|รถ|น้ำมัน/i, 'car-front'],
];
const EXPENSE_TONES = ['red', 'blue', 'purple', 'amber', 'teal', 'pink', 'slate'];
const FALLBACK_ICONS = ['wallet2', 'receipt', 'basket', 'lightning', 'heart', 'three-dots'];

export function groupLook(group, index) {
  if (group.type === 'income') return { tone: 'teal', icon: 'cash-coin' };
  const rule = RULES.find(([re]) => re.test(group.name));
  return {
    tone: EXPENSE_TONES[index % EXPENSE_TONES.length],
    icon: rule ? rule[1] : FALLBACK_ICONS[index % FALLBACK_ICONS.length],
  };
}
