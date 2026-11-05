/** 服务端日期解析：与前端 src/lib/date.ts 保持同一套规则，并兼容 Excel 序列号。 */

const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const DOT_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{1,2})$/;
const SLASH_RE = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;
const SLASH_SHORT_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;

const pad = (n) => String(n).padStart(2, '0');

function validYmd(y, m, d) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1970 || y > 2200) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function iso(y, m, d) {
  return validYmd(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** Excel 序列号（1900 日期系统）转 ISO */
export function excelSerialToISO(serial) {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  // 25569 = 1970-01-01；四舍五入到天，忽略时间部分
  const ms = Math.round((serial - 25569) * 86400000);
  const dt = new Date(ms);
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function dateToISO(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return iso(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

/** 解析任意日期输入为 ISO yyyy-mm-dd；无法解析返回 null（特殊文本保持原文）。 */
export function parseDateText(value) {
  if (value == null) return null;
  if (value instanceof Date) return dateToISO(value);
  if (typeof value === 'number') {
    // 纯数字：既可能是 Excel 序列号，也可能是误传入的年份；只在合理区间当序列号
    if (value >= 20000 && value <= 80000) return excelSerialToISO(value);
    return null;
  }
  const s = String(value).trim();
  if (!s) return null;

  let m = ISO_RE.exec(s);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));

  m = DOT_RE.exec(s);
  if (m) return iso(2000 + Number(m[1]), Number(m[2]), Number(m[3]));

  m = SLASH_RE.exec(s);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));

  m = SLASH_SHORT_RE.exec(s);
  if (m) {
    const year = m[3].length === 4 ? Number(m[3]) : 2000 + Number(m[3]);
    return iso(year, Number(m[1]), Number(m[2]));
  }

  // 纯数字字符串，可能是 Excel 序列号
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n >= 20000 && n <= 80000) return excelSerialToISO(n);
  }
  return null;
}

/** ISO -> 26.9.7 展示文本；无法解析返回空串。 */
export function formatDateText(value) {
  const isoValue = parseDateText(value);
  if (!isoValue) return '';
  const [y, m, d] = isoValue.split('-').map(Number);
  return `${String(y).slice(2)}.${m}.${d}`;
}

export const DEFAULT_SPECIAL_TEXTS = ['持续', '待定', '空'];

export function isSpecialDateText(value, specialTexts = DEFAULT_SPECIAL_TEXTS) {
  if (value == null) return false;
  const s = String(value).trim();
  if (!s) return false;
  return specialTexts.some((x) => x && s === x);
}
