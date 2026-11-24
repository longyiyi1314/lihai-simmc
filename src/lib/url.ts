/** 站点根路径（项目站为 /仓库名），统一在这里拼接，避免漏写 base 导致 404 */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** 站内绝对路径：url('/members/') → '/lihai-simmc/members/' */
export function url(path = '/'): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${p}`;
}

/** 静态资源路径：asset('favicon.svg') → '/lihai-simmc/favicon.svg' */
export function asset(path: string): string {
  return url(`/${path.replace(/^\/+/, '')}`);
}
