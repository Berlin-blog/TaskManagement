export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

/** 生成稳定 uid */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** 把任意值转为字符串，null/undefined -> '' */
export function toStr(v: unknown): string {
  if (v == null) return '';
  return String(v);
}

/** 字符串转数字，失败返回默认值 */
export function toNum(v: unknown, def = 0): number {
  if (v == null || v === '') return def;
  const n = Number(v);
  return Number.isNaN(n) ? def : n;
}
