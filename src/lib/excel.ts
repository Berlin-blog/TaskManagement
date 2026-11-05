import * as XLSX from 'xlsx';
import type { Task, ImportLog, Priority, AppSettings } from '../types';
import { parseDate, isSpecialText, formatDateShort } from './date';
import { toStr, toNum, uuid } from './utils';
import { sortWeekNames, normalizeWeekName } from './weekSort';

const TASK_HEADERS = ['序号', '名称', '需求人', 'P', '预估时间', '修订时间', '是否完成', '完成时间', '备注'];

type Field = 'seq' | 'title' | 'requester' | 'priority' | 'estimated' | 'revised' | 'completed' | 'completedAt' | 'remark';

const HEADER_ALIASES: Record<Field, string[]> = {
  seq: ['序号', '编号', '#'],
  title: ['名称', '任务名称', '任务', '标题'],
  requester: ['需求人', '提出人', '需求方'],
  priority: ['P', '优先级', '优先'],
  estimated: ['预估时间', '预估', '预计时间', '计划时间'],
  revised: ['修订时间', '修订', '调整时间'],
  completed: ['是否完成', '完成', '完成状态'],
  completedAt: ['完成时间', '完成日期'],
  remark: ['备注', '说明', '备注说明'],
};

const FIELD_INDEX: Record<Field, number> = {
  seq: 0, title: 1, requester: 2, priority: 3, estimated: 4,
  revised: 5, completed: 6, completedAt: 7, remark: 8,
};

function normHeader(s: unknown): string {
  return toStr(s).replace(/\s+/g, '').replace(/[：:]/g, '');
}

/** 表头识别：找到含 "序号" 与 "名称" 的行 */
function findHeaderRow(rows: any[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = (rows[i] || []).map(normHeader);
    const hasSeq = row.some((h) => HEADER_ALIASES.seq.includes(h));
    const hasTitle = row.some((h) => HEADER_ALIASES.title.includes(h));
    if (hasSeq && hasTitle) return i;
  }
  return -1;
}

/** 表头名 -> 列号；识别不到时退回原来的固定位置 */
function buildHeaderMap(headerRow: any[] | undefined): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  if (!headerRow) return map;
  headerRow.forEach((cell, index) => {
    const h = normHeader(cell);
    if (!h) return;
    for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
      if (map[field] != null) continue;
      if (HEADER_ALIASES[field].includes(h)) {
        map[field] = index;
        break;
      }
    }
  });
  return map;
}

function cellAt(row: any[], map: Partial<Record<Field, number>>, field: Field): unknown {
  const index = map[field] ?? FIELD_INDEX[field];
  return row[index];
}

/** 读取日期单元格：兼容文本、Excel 日期对象、Excel 序列号 */
function readDateCell(value: unknown): { text: string; iso: string | null } {
  if (value == null || value === '') return { text: '', iso: null };
  if (value instanceof Date) {
    const iso = parseDate(value);
    return { text: formatDateShort(iso) || toStr(value), iso };
  }
  if (typeof value === 'number') {
    const iso = parseDate(value);
    return { text: iso ? formatDateShort(iso) : toStr(value), iso };
  }
  const text = toStr(value).trim();
  return { text, iso: parseDate(text) };
}

function parsePriority(v: unknown): Priority {
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '高' || s === 'P1') return 1;
    if (s === '中' || s === 'P2') return 2;
    if (s === '低' || s === 'P3') return 3;
  }
  const n = toNum(v, 3);
  if (n === 1 || n === 2 || n === 3) return n;
  return 3;
}

function parseCompleted(v: unknown): { isCompleted: boolean; status: Task['status'] } {
  const s = toStr(v).trim();
  if (['是', '已完成', '√', '✓', 'true', 'TRUE', '1'].includes(s)) {
    return { isCompleted: true, status: 'completed' };
  }
  return { isCompleted: false, status: 'notStarted' };
}

/** 把一行数组按表头映射成 Task（不含 id / seq） */
function rowToTask(row: any[], weekName: string, map: Partial<Record<Field, number>>, settings: AppSettings, periodicKeywords: string[]): Task {
  const seq = toNum(cellAt(row, map, 'seq'), 0);
  const title = toStr(cellAt(row, map, 'title')).trim();
  const requester = toStr(cellAt(row, map, 'requester')).trim();
  const priority = parsePriority(cellAt(row, map, 'priority'));

  const est = readDateCell(cellAt(row, map, 'estimated'));
  const rev = readDateCell(cellAt(row, map, 'revised'));
  const comp = readDateCell(cellAt(row, map, 'completedAt'));

  const special = isSpecialText(est.text, settings) || isSpecialText(rev.text, settings);
  const specialText = isSpecialText(est.text, settings) ? est.text : isSpecialText(rev.text, settings) ? rev.text : undefined;

  const { isCompleted, status } = parseCompleted(cellAt(row, map, 'completed'));
  const isPeriodic = periodicKeywords.some((kw) => kw && title.includes(kw));

  const now = Date.now();
  return {
    uid: uuid(),
    weekName,
    seq,
    title,
    requester,
    priority,
    attachmentCount: 0,
    estimatedDate: est.iso,
    estimatedDateText: est.text,
    revisedDate: rev.iso,
    revisedDateText: rev.text,
    isSpecialDate: special,
    specialDateText: specialText,
    isCompleted,
    completedAt: comp.iso,
    completedAtText: comp.text,
    remark: toStr(cellAt(row, map, 'remark')).trim(),
    status,
    isPeriodic,
    createdAt: now,
    updatedAt: now,
  };
}

export interface ParseResult {
  tasks: Task[];
  importLogs: ImportLog[];
  weekNames: string[];
  errors: string[];
}

/** 解析整个工作簿 */
export function parseWorkbook(buf: ArrayBuffer, settings: AppSettings): ParseResult {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const tasks: Task[] = [];
  const importLogs: ImportLog[] = [];
  const weekNames: string[] = [];
  const errors: string[] = [];
  const kw = settings.periodicKeywords ?? [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null });

    if (sheetName === 'Sheet2' || /日志/i.test(sheetName)) {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i] || [];
        const t0 = toStr(r[0]).trim();
        if (!t0 || t0 === '更新时间') continue;
        importLogs.push({
          updatedAt: t0,
          version: toStr(r[1]).trim(),
          relatedSheet: toStr(r[2]).trim() || null,
          importedAt: Date.now(),
        });
      }
      continue;
    }

    const headerIdx = findHeaderRow(rows);
    if (headerIdx < 0) {
      errors.push(`Sheet「${sheetName}」未识别到表头，已跳过。`);
      continue;
    }
    const map = buildHeaderMap(rows[headerIdx]);
    // sheet 名不带年份，这里补全成「2026年9月第二周」，与服务端保存的周名一致
    const weekName = normalizeWeekName(sheetName.trim());
    if (!weekName) continue;
    weekNames.push(weekName);

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      if (row.every((c) => c == null || toStr(c).trim() === '')) continue;
      try {
        const task = rowToTask(row, weekName, map, settings, kw);
        if (!task.title) {
          errors.push(`Sheet「${sheetName}」第 ${i + 1} 行缺少任务名称，已跳过。`);
          continue;
        }
        tasks.push(task);
      } catch (e) {
        errors.push(`Sheet「${sheetName}」第 ${i + 1} 行解析失败：${(e as Error).message}`);
      }
    }
  }

  return { tasks, importLogs, weekNames, errors };
}

/** 把任务导出为 sheet 行 */
function taskToRow(t: Task): any[] {
  return [
    t.seq,
    t.title,
    t.requester,
    t.priority,
    t.estimatedDateText || t.estimatedDate || '',
    t.revisedDateText || t.revisedDate || '',
    t.isCompleted ? '是' : '否',
    t.completedAtText || t.completedAt || '',
    t.remark,
  ];
}

function safeSheetName(name: string, used: Set<string>): string {
  const base = (name || 'Sheet').replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 28) || 'Sheet';
  let candidate = base;
  let i = 2;
  while (used.has(candidate)) {
    const suffix = `(${i++})`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(candidate);
  return candidate;
}

function buildWeekSheet(tasks: Task[]): XLSX.WorkSheet {
  const aoa: any[][] = [['任务排期表', null, null, null, null, null, null, null, null], TASK_HEADERS];
  [...tasks].sort((a, b) => a.seq - b.seq).forEach((t) => aoa.push(taskToRow(t)));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 6 }, { wch: 42 }, { wch: 12 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 32 }];
  (ws as any)['!freeze'] = { xSplit: 0, ySplit: 2 };
  return ws;
}

function buildAllSheet(tasks: Task[], weekOrder: string[]): XLSX.WorkSheet {
  const headers = ['周', ...TASK_HEADERS];
  const weekIndex = new Map(weekOrder.map((w, i) => [w, i]));
  const aoa: any[][] = [headers];
  [...tasks]
    .sort((a, b) => {
      const ai = weekIndex.get(a.weekName) ?? 9999;
      const bi = weekIndex.get(b.weekName) ?? 9999;
      if (ai !== bi) return ai - bi;
      return a.seq - b.seq;
    })
    .forEach((t) => aoa.push([t.weekName, ...taskToRow(t)]));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 14 }, ...(TASK_HEADERS.map(() => ({ wch: 14 })))];
  (ws as any)['!freeze'] = { xSplit: 0, ySplit: 1 };
  return ws;
}

/** 按自然周顺序返回本周列表 */
function orderedWeeks(tasks: Task[]): string[] {
  return sortWeekNames(tasks.map((t) => t.weekName));
}

/** 导出指定周任务为 xlsx（单 sheet，接近原 Excel） */
export function exportWeekXlsx(tasks: Task[], weekName: string): Blob {
  const wb = XLSX.utils.book_new();
  const ws = buildWeekSheet(tasks.filter((t) => t.weekName === weekName));
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName(weekName, new Set()));
  return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** 导出全部任务为 xlsx（每周一个 sheet + 全部汇总 sheet） */
export function exportAllXlsx(tasks: Task[]): Blob {
  const wb = XLSX.utils.book_new();
  const weeks = orderedWeeks(tasks);
  const used = new Set<string>();
  weeks.forEach((w) => {
    const ws = buildWeekSheet(tasks.filter((t) => t.weekName === w));
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(w, used));
  });
  const all = buildAllSheet(tasks, weeks);
  XLSX.utils.book_append_sheet(wb, all, safeSheetName('全部任务', used));
  return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** 导出为 CSV（全部任务） */
export function exportAllCsv(tasks: Task[]): Blob {
  const headers = ['周', ...TASK_HEADERS];
  const rows: string[][] = [headers];
  const weeks = orderedWeeks(tasks);
  const weekIndex = new Map(weeks.map((w, i) => [w, i]));
  [...tasks]
    .sort((a, b) => {
      const ai = weekIndex.get(a.weekName) ?? 9999;
      const bi = weekIndex.get(b.weekName) ?? 9999;
      if (ai !== bi) return ai - bi;
      return a.seq - b.seq;
    })
    .forEach((t) => rows.push([t.weekName, ...taskToRow(t).map((c) => toStr(c))]));
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  // BOM 防止 Excel 中文乱码
  return new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
}

/** 触发浏览器下载 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
