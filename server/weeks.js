/**
 * 周名解析与规范化。
 *
 * 为什么需要年份：week_name 同时是导入合并的业务键和 uniq_tasks_week_seq 的一部分，
 * 而 Excel 里的 sheet 名（"9月第二周"）不带年份。若不补年份，明年同名周会覆盖今年的任务，
 * 排序也会把「1月第一周」排到「12月第二周」前面。
 *
 * 规则：
 *  - `2026年9月第二周` / `2026年9月第2周` -> 规范化为 `2026年9月第二周`
 *  - `9月第二周` / `9月第2周` -> 推断年份后补全
 *  - 其它自定义周名（如「Q4冲刺」）原样保留，只做 trim / 截断
 */

const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

const WEEK_RE = /^(?:(\d{4})\s*年)?\s*(\d{1,2})\s*月\s*第\s*([0-9一二三四五六七八九十]+)\s*周$/;

/** 中文数字 / 阿拉伯数字 -> 数值，支持一~九十九 */
export function parseCnNum(value) {
  const s = String(value ?? '').trim();
  if (!s) return 0;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const tenIdx = s.indexOf('十');
  if (tenIdx === -1) return CN_NUM[s] ?? 0;
  const tens = tenIdx === 0 ? 1 : CN_NUM[s[tenIdx - 1]] ?? 1;
  const ones = tenIdx === s.length - 1 ? 0 : CN_NUM[s[tenIdx + 1]] ?? 0;
  return tens * 10 + ones;
}

/** 数值 -> 中文数字（统一存成「第二周」这种写法，避免同一周出现两种字符串） */
export function toCnNum(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return String(value ?? '');
  if (n < 10) return CN_DIGITS[n];
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return `${tens === 1 ? '' : CN_DIGITS[tens]}十${ones ? CN_DIGITS[ones] : ''}`;
  }
  return String(n);
}

/** 解析周名；非「X月第Y周」格式返回 null */
export function parseWeekName(value) {
  const raw = String(value ?? '').trim();
  const m = WEEK_RE.exec(raw);
  if (!m) return null;
  const month = Number(m[2]);
  const week = parseCnNum(m[3]);
  if (!(month >= 1 && month <= 12)) return null;
  if (!(week >= 1 && week <= 6)) return null;
  return { year: m[1] ? Number(m[1]) : null, month, week, raw };
}

/** 未来超过 3 个月视为「去年 12 月」，否则算今年 */
const MAX_AHEAD_MS = 90 * 86400000;

export function inferWeekYear(month, week, now = new Date()) {
  const candidate = new Date(now.getFullYear(), month - 1, 1 + (Math.max(week, 1) - 1) * 7);
  return candidate.getTime() - now.getTime() > MAX_AHEAD_MS
    ? now.getFullYear() - 1
    : now.getFullYear();
}

/** 规范化周名：补年份 + 统一中文序号。已是规范形式时幂等。 */
export function normalizeWeekName(value, now = new Date()) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const parsed = parseWeekName(raw);
  if (!parsed) return raw.slice(0, 64);
  const year = parsed.year ?? inferWeekYear(parsed.month, parsed.week, now);
  return `${year}年${parsed.month}月第${toCnNum(parsed.week)}周`;
}
