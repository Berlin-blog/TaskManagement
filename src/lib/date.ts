/**
 * 日期解析工具
 * 规则：
 *  - "26.9.7" -> 2026-09-07
 *  - "2026-9-7" / "2026/9/7" -> 2026-09-07
 *  - "持续"/"待定"/"空" 或其它非日期文本 -> null（保留原文由调用方处理）
 *  - Excel 序列号字符串（20000~80000）兜底解析
 */

import type { AppSettings } from '../types';

const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const DOT_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{1,2})$/;
const SLASH_RE = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;
const SLASH_SHORT_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function validYmd(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1970 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isoOf(y: number, m: number, d: number): string | null {
  return validYmd(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
}

export function excelSerialToISO(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const dt = new Date(Math.round((serial - 25569) * 86400000));
  return isoOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** 是否为特殊（非日期）文本 */
export function isSpecialText(text: string | null | undefined, settings?: AppSettings): boolean {
  if (text == null) return false;
  const t = String(text).trim();
  if (!t) return false;
  const specials = settings?.specialTexts ?? ['持续', '待定', '空'];
  return specials.some((s) => t === s);
}

/** 解析日期文本为 ISO yyyy-mm-dd，无法解析返回 null */
export function parseDate(text: unknown): string | null {
  if (text == null) return null;
  if (text instanceof Date) {
    if (Number.isNaN(text.getTime())) return null;
    return isoOf(text.getFullYear(), text.getMonth() + 1, text.getDate());
  }
  if (typeof text === 'number') {
    if (text >= 20000 && text <= 80000) return excelSerialToISO(text);
    return null;
  }
  const s = String(text).trim();
  if (!s) return null;

  let m = ISO_RE.exec(s);
  if (m) return isoOf(Number(m[1]), Number(m[2]), Number(m[3]));

  m = DOT_RE.exec(s);
  if (m) return isoOf(2000 + Number(m[1]), Number(m[2]), Number(m[3]));

  m = SLASH_RE.exec(s);
  if (m) return isoOf(Number(m[1]), Number(m[2]), Number(m[3]));

  m = SLASH_SHORT_RE.exec(s);
  if (m) {
    const year = m[3].length === 4 ? Number(m[3]) : 2000 + Number(m[3]);
    return isoOf(year, Number(m[1]), Number(m[2]));
  }

  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n >= 20000 && n <= 80000) return excelSerialToISO(n);
  }
  return null;
}

/** 今天 ISO */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 在 ISO 日期上加减天数，返回 ISO；非法日期原样返回 */
export function addDaysISO(iso: string, days: number): string {
  const m = ISO_RE.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 两个 ISO 日期相差的天数（b - a） */
export function diffDaysISO(a: string, b: string): number {
  const ma = ISO_RE.exec(a);
  const mb = ISO_RE.exec(b);
  if (!ma || !mb) return 0;
  const da = new Date(Number(ma[1]), Number(ma[2]) - 1, Number(ma[3]));
  const db = new Date(Number(mb[1]), Number(mb[2]) - 1, Number(mb[3]));
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

/** 周一为一周起点，返回 [周一, 周日] 的 ISO */
export function weekRangeISO(base = new Date()): { start: string; end: string } {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const weekday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - weekday);
  const start = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const endDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6);
  const end = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`;
  return { start, end };
}

/** ISO 日期加中文星期，用于抽屉标题 */
export function formatDateWithWeekday(iso: string): string {
  const m = ISO_RE.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${Number(m[2])} 月 ${Number(m[3])} 日 · ${labels[d.getDay()]}`;
}

/** ISO -> 26.9.7 展示文本 */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = ISO_RE.exec(iso);
  if (!m) return iso;
  return `${m[1].slice(2)}.${Number(m[2])}.${Number(m[3])}`;
}

/** ISO -> 展示文本 dd.MM.YY 或原文（保留旧接口） */
export function formatDateDisplay(iso: string | null): string {
  if (!iso) return '';
  const m = ISO_RE.exec(iso);
  if (!m) return iso;
  return `${m[2]}.${m[3]}.${m[1].slice(2)}`;
}

/** 比较两个 ISO 日期，仅日期部分 */
export function isBefore(a: string, b: string): boolean {
  return a < b;
}
