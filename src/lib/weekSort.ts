/**
 * 周名解析、规范化与排序。
 *
 * 为什么补年份：week_name 同时是导入合并的业务键和数据库唯一索引的一部分，
 * 而 Excel 的 sheet 名（"9月第二周"）不带年份。不补年份的话，明年同名周会覆盖今年的任务，
 * 排序也会把「1月第一周」排到「12月第二周」前面。
 *
 * 规则：
 *  - `2026年9月第二周` / `2026年9月第2周` -> `2026年9月第二周`
 *  - `9月第二周` / `9月第2周` -> 推断年份后补全
 *  - 其它自定义周名（如「Q4冲刺」）原样保留
 */

const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

/** 中文数字转数值，支持 一~九十九 */
export function parseCnNum(s: string): number {
  if (!s) return 0;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const tenIdx = s.indexOf('十');
  if (tenIdx === -1) return CN_NUM[s] ?? 0;
  const tens = tenIdx === 0 ? 1 : CN_NUM[s[tenIdx - 1]] ?? 1;
  const ones = tenIdx === s.length - 1 ? 0 : CN_NUM[s[tenIdx + 1]] ?? 0;
  return tens * 10 + ones;
}

/** 数值转中文数字，统一写成「第二周」 */
export function toCnNum(value: number): string {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return String(value);
  if (n < 10) return CN_DIGITS[n];
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return `${tens === 1 ? '' : CN_DIGITS[tens]}十${ones ? CN_DIGITS[ones] : ''}`;
  }
  return String(n);
}

const WEEK_RE = /^(?:(\d{4})\s*年)?\s*(\d{1,2})\s*月\s*第\s*([0-9一二三四五六七八九十]+)\s*周$/;

export interface ParsedWeek {
  year: number | null;
  month: number;
  week: number;
}

/** 解析周名；非「X月第Y周」格式返回 null */
export function parseWeekName(name: string): ParsedWeek | null {
  const m = WEEK_RE.exec(String(name ?? '').trim());
  if (!m) return null;
  const month = Number(m[2]);
  const week = parseCnNum(m[3]);
  if (!(month >= 1 && month <= 12)) return null;
  if (!(week >= 1 && week <= 6)) return null;
  return { year: m[1] ? Number(m[1]) : null, month, week };
}

/** 未来超过 3 个月视为「去年 12 月」，否则算今年（1 月导入 12 月的表不会算到明年） */
const MAX_AHEAD_MS = 90 * 86400000;

export function inferWeekYear(month: number, week: number, now: Date = new Date()): number {
  const candidate = new Date(now.getFullYear(), month - 1, 1 + (Math.max(week, 1) - 1) * 7);
  return candidate.getTime() - now.getTime() > MAX_AHEAD_MS
    ? now.getFullYear() - 1
    : now.getFullYear();
}

/** 规范化周名：补年份 + 统一中文序号。已是规范形式时幂等。 */
export function normalizeWeekName(name: string, now: Date = new Date()): string {
  const raw = String(name ?? '').trim();
  if (!raw) return '';
  const parsed = parseWeekName(raw);
  if (!parsed) return raw;
  const year = parsed.year ?? inferWeekYear(parsed.month, parsed.week, now);
  return `${year}年${parsed.month}月第${toCnNum(parsed.week)}周`;
}

/** 展示用短周名：当前年份省略「2026年」，其它年份保留以便区分 */
export function displayWeekName(name: string, now: Date = new Date()): string {
  const s = String(name ?? '');
  const prefix = `${now.getFullYear()}年`;
  return s.startsWith(prefix) ? s.slice(prefix.length) : s;
}

/** 周名里的年份；自定义周名返回 null */
export function weekYear(name: string): number | null {
  return parseWeekName(name)?.year ?? null;
}

/** 周名是否显式写了年份（2026年…） */
export function hasExplicitWeekYear(name: string): boolean {
  return /^\d{4}\s*年/.test(String(name ?? '').trim());
}

/** 去掉指定年份前缀：按年浏览时列表里不必重复显示年份 */
export function stripWeekYear(name: string, year: number): string {
  const prefix = `${year}年`;
  const s = String(name ?? '');
  return s.startsWith(prefix) ? s.slice(prefix.length) : s;
}

/** 该周的近似起始日（选年时挑「最接近今天」的周）；自定义周名返回 null */
export function weekStartDate(name: string): Date | null {
  const p = parseWeekName(name);
  if (!p) return null;
  const year = p.year ?? inferWeekYear(p.month, p.week);
  return new Date(year, p.month - 1, 1 + (p.week - 1) * 7);
}

/** 在某一年的周里挑「最接近今天」的一周；用于切换年份时自动落位 */
export function pickWeekForYear(weeks: string[], now: Date = new Date()): string | null {
  if (weeks.length === 0) return null;
  const today = now.getTime();
  let best = weeks[0];
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const w of weeks) {
    const start = weekStartDate(w);
    const diff = start ? Math.abs(start.getTime() - today) : Number.POSITIVE_INFINITY;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = w;
    }
  }
  return best;
}

/** 解析周名为可比较的键；缺年份的老周名按推断年份参与排序，而不是全排到最前 */
export function weekSortKey(name: string): { y: number; m: number; w: number; name: string } {
  const p = parseWeekName(name);
  if (p) {
    return {
      y: p.year ?? inferWeekYear(p.month, p.week),
      m: p.month,
      w: p.week,
      name,
    };
  }
  // 无法识别 → 排最后
  return { y: 9999, m: 9999, w: 9999, name };
}

/** 图表/窄屏用的短周名：2026年9月第二周 -> 9/2；跨年份显示 25/9/2 */
export function shortWeekLabel(name: string): string {
  const key = weekSortKey(name);
  if (key.m === 9999) return name.length > 8 ? `${name.slice(0, 7)}…` : name;
  const currentYear = new Date().getFullYear();
  if (key.y && key.y !== currentYear) return `${String(key.y).slice(2)}/${key.m}/${key.w}`;
  return `${key.m}/${key.w}`;
}

function weekCompare(a: string, b: string): number {
  const ka = weekSortKey(a);
  const kb = weekSortKey(b);
  if (ka.y !== kb.y) return ka.y - kb.y;
  if (ka.m !== kb.m) return ka.m - kb.m;
  if (ka.w !== kb.w) return ka.w - kb.w;
  return ka.name.localeCompare(kb.name, 'zh-CN');
}

/**
 * 排序周名列表。
 * @param customOrder 自定义顺序（settings.weekOrder），自定义列表中的周按其中顺序排，
 *                    不在列表中的周排在后面按智能序。
 */
export function sortWeekNames(names: string[], customOrder?: string[] | null): string[] {
  const unique = Array.from(new Set(names));
  if (customOrder && customOrder.length > 0) {
    const idx = new Map(customOrder.map((n, i) => [n, i]));
    return unique.sort((a, b) => {
      const ia = idx.get(a);
      const ib = idx.get(b);
      if (ia !== undefined && ib !== undefined) return ia - ib;
      if (ia !== undefined) return -1;
      if (ib !== undefined) return 1;
      return weekCompare(a, b);
    });
  }
  return unique.sort(weekCompare);
}
