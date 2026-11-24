/**
 * 视觉层的小工具：颜色运算 + 职务色相。
 * 数据里 rank 自带 #RRGGBB，role 只有名称，所以分别用两条路径取色。
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '').trim();
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** 十六进制色 + 透明度 → rgba() */
export function alpha(hex: string, a: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** 向白色混合，用于把过暗的职位色提亮到可读 */
export function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const k = Math.max(0, Math.min(1, amount));
  const mix = (c: number) => Math.round(c + (255 - c) * k);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/** 向黑色混合 */
export function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const k = Math.max(0, Math.min(1, amount));
  const mix = (c: number) => Math.round(c * (1 - k));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/**
 * 职务色调表。
 * 让「外交 / 军事 / 营造 / 后勤 / 宣传 / 招募」在标签、卡片、图表里保持同一套色彩语言。
 * 未登记的新职务用稳定散列兜底，加数据不会突然变成灰色。
 */
const ROLE_HUE: Record<string, number> = {
  diplomacy: 38, // 琥珀
  military: 352, // 珊瑚
  build: 168, // 琉璃青
  logistics: 205, // 海蓝
  media: 268, // 紫晶
  recruit: 128, // 苔绿
};

export function roleHueOf(id: string): number {
  const fixed = ROLE_HUE[id];
  if (fixed !== undefined) return fixed;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return 30 + (h % 300);
}

/** 供 style 属性使用：style={roleStyle(id)} */
export function roleStyle(id: string): string {
  return `--rh:${roleHueOf(id)}`;
}

/** 序号：1 → 001 */
export function padNo(n: number, width = 3): string {
  return String(n).padStart(width, '0');
}

/** 百分比，0 除保护 */
export function pct(n: number, total: number): number {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((n / total) * 100)));
}
