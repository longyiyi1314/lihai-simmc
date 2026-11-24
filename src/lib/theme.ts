/**
 * 视觉层的小工具：颜色运算 + 机构色相。
 * 职位自带 #RRGGBB，机构只有 id/kind，所以分别用两条路径取色。
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

/** 稳定色相：同一个 id 永远得到同一个 0–359 的数 */
export function hueOf(id: string, span = 300, base = 30): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return base + (h % span);
}

/**
 * 机构色相：按层级分色，让「委员会 / 部 / 兵团 / 局 / 处 / 军区」在树里一眼分得开。
 * 同一层级内再用 id 散列微调，避免同级的卡片全长一个样。
 */
const KIND_HUE: Record<string, [number, number]> = {
  root: [42, 8],
  commission: [356, 10],
  bureau: [22, 14],
  corps: [352, 12],
  division: [188, 16],
  office: [204, 18],
  district: [268, 16],
};

export function orgHueOf(id: string, kind: string): number {
  const [base, spread] = KIND_HUE[kind] ?? [30, 300];
  return hueOf(`${kind}:${id}`, spread, base);
}

/** 供 style 属性使用：style={orgStyle(id, kind)} */
export function orgStyle(id: string, kind: string): string {
  return `--oh:${orgHueOf(id, kind)}`;
}

/**
 * 三个大委员会各用一个旗色：政务枢机 = 旗红，革命军事 = 星金，计划经济 = 旗蓝。
 * 首页与职级页的委员会卡片沿用这套对应关系，和国旗配色呼应。
 */
export const BRANCH_HUES = [356, 42, 208];

export function branchHue(i: number): number {
  return BRANCH_HUES[i % BRANCH_HUES.length];
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
