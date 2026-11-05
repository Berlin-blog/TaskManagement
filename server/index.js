import express from 'express';
import cors from 'cors';
import multer from 'multer';
import {
  existsSync, mkdirSync, unlinkSync, copyFileSync, readdirSync, statSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pool, ensureSchema } from './db.js';
import { config } from './env.js';
import { parseDateText, formatDateText, isSpecialDateText, DEFAULT_SPECIAL_TEXTS } from './dates.js';
import { normalizeWeekName } from './weeks.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

// ---------- 附件存储 ----------
// 默认放在用户数据目录（Windows: %LOCALAPPDATA%\TaskSchedule\uploads），避免项目目录膨胀；
// 可用 UPLOAD_DIR 覆盖。历史目录 server/uploads 会在启动时安全迁移过来（失败则保留原文件）。
const legacyUploadsDir = join(__dirname, 'uploads');
const defaultUploadsDir = process.platform === 'win32' && process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, 'TaskSchedule', 'uploads')
  : legacyUploadsDir;
const uploadsDir = config.uploadDir || defaultUploadsDir;
const UPLOAD_QUOTA_BYTES = config.uploadQuotaMb * 1024 * 1024;
const ATTACHMENT_GRACE_MS = config.attachmentGraceHours * 3600 * 1000;

// 允许留档的文件类型（不含 html/svg/js/exe 等可执行或可注入脚本的类型）
const ALLOWED_UPLOAD_EXT = new Set([
  '.xlsx', '.xls', '.csv',
  '.docx', '.doc', '.pptx', '.ppt', '.pdf',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp',
  '.txt', '.md', '.zip', '.7z', '.rar',
]);
const ALLOWED_UPLOAD_LABEL = 'xlsx/xls/csv、docx/doc、pptx/ppt、pdf、图片、txt/md、zip/7z/rar';

mkdirSync(uploadsDir, { recursive: true });

function storedFilePath(storedName) {
  for (const dir of [uploadsDir, legacyUploadsDir]) {
    const p = join(dir, basename(String(storedName || '')));
    if (existsSync(p)) return p;
  }
  return null;
}

function removeStoredFile(storedName) {
  for (const dir of [uploadsDir, legacyUploadsDir]) {
    try { unlinkSync(join(dir, basename(String(storedName || '')))); } catch { /* 可能已不存在 */ }
  }
}

/** 把旧目录里的附件复制到新目录；全部成功后才删除旧文件 */
function migrateLegacyUploads() {
  if (!existsSync(legacyUploadsDir)) return;
  if (legacyUploadsDir === uploadsDir) return;
  let copied = 0;
  let failed = 0;
  for (const name of readdirSync(legacyUploadsDir)) {
    const src = join(legacyUploadsDir, name);
    try {
      if (!statSync(src).isFile()) continue;
      const dest = join(uploadsDir, name);
      const srcSize = statSync(src).size;
      if (existsSync(dest) && statSync(dest).size === srcSize) {
        copied++;
        continue;
      }
      copyFileSync(src, dest);
      if (statSync(dest).size !== srcSize) throw new Error('复制后大小不一致');
      copied++;
    } catch (e) {
      failed++;
      console.error('  ! 附件迁移失败，原文件保留：', name, e.message);
    }
  }
  if (failed === 0) {
    for (const name of readdirSync(legacyUploadsDir)) {
      try { unlinkSync(join(legacyUploadsDir, name)); } catch { /* ignore */ }
    }
    try {
      if (readdirSync(legacyUploadsDir).length === 0) console.log(`  · 附件目录已迁移：${copied} 个文件 -> ${uploadsDir}`);
      else console.log('  · 附件已复制到新目录，旧目录仍有文件，可手动清理：' + legacyUploadsDir);
    } catch { /* ignore */ }
  } else {
    console.warn(`  · 附件部分迁移失败（${failed} 个），旧目录保留：${legacyUploadsDir}`);
  }
}

async function uploadUsage() {
  const [[row]] = await pool.query(
    'SELECT COALESCE(SUM(size), 0) AS used, COUNT(*) AS count FROM attachments WHERE deleted_at IS NULL',
  );
  const used = Number(row?.used || 0);
  return {
    used,
    count: Number(row?.count || 0),
    quota: UPLOAD_QUOTA_BYTES,
    quotaMb: Math.round(UPLOAD_QUOTA_BYTES / 1024 / 1024),
    usedMb: Number((used / 1024 / 1024).toFixed(1)),
  };
}

/** 清理超过保留期的软删除附件（含磁盘文件） */
async function purgeDeletedAttachments() {
  const deadline = Date.now() - ATTACHMENT_GRACE_MS;
  const [rows] = await pool.query(
    'SELECT id, stored_name FROM attachments WHERE deleted_at IS NOT NULL AND deleted_at < ?',
    [deadline],
  );
  if (rows.length === 0) return 0;
  await pool.query('DELETE FROM attachments WHERE id IN (?)', [rows.map((r) => r.id)]);
  for (const r of rows) removeStoredFile(r.stored_name);
  return rows.length;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const DEFAULT_SETTINGS = {
  id: 'app',
  weekStart: 1,
  priorityMap: { 1: '高', 2: '中', 3: '低' },
  specialTexts: ['持续', '待定', '空'],
  periodicKeywords: ['周报', '动销金额', '周日更新', '周一更新', '周五更新'],
  weekOrder: [],
};

const TASK_STATUSES = new Set(['notStarted', 'inProgress', 'completed', 'cancelled']);
const PRIORITIES = new Set([1, 2, 3]);

// ---------- 设置缓存 ----------
// 特殊日期文本（持续/待定/空…）允许在设置页自定义，服务端写入时必须用同一份，
// 否则自定义值会在 PATCH 重算 is_special_date 时被当成普通文本。
const SETTINGS_CACHE_MS = 60 * 1000;
let specialTextsCache = { at: 0, texts: DEFAULT_SPECIAL_TEXTS };

function invalidateSettingsCache() {
  specialTextsCache = { at: 0, texts: specialTextsCache.texts };
}

async function getSpecialTexts() {
  if (Date.now() - specialTextsCache.at < SETTINGS_CACHE_MS) return specialTextsCache.texts;
  try {
    const [rows] = await pool.query('SELECT special_texts FROM settings WHERE id = ?', ['app']);
    const raw = rows[0]?.special_texts;
    let list = null;
    if (typeof raw === 'string') {
      try { list = JSON.parse(raw); } catch { list = null; }
    } else if (Array.isArray(raw)) {
      list = raw;
    }
    const texts = Array.isArray(list)
      ? list.map((x) => String(x).trim()).filter(Boolean)
      : [];
    const result = texts.length > 0 ? texts : DEFAULT_SPECIAL_TEXTS;
    specialTextsCache = { at: Date.now(), texts: result };
    return result;
  } catch (e) {
    console.error('[settings] 读取特殊日期文本失败：', e.message);
    return specialTextsCache.texts.length > 0 ? specialTextsCache.texts : DEFAULT_SPECIAL_TEXTS;
  }
}

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayText() {
  return formatDateText(todayISO());
}

function fail(res, e, status = 500) {
  console.error('[api]', e);
  return res.status(status).json({ error: e?.message || String(e) });
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function asTrimmed(value, max = 255) {
  return String(value ?? '').trim().slice(0, max);
}

function asBool(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

/** DB 行 -> 前端 Task */
function rowToTask(r) {
  return {
    id: r.id,
    uid: r.uid,
    weekName: r.week_name,
    seq: Number(r.seq),
    title: r.title,
    requester: r.requester,
    priority: Number(r.priority),
    attachmentCount: Number(r.attachment_count || 0),
    estimatedDate: r.estimated_date,
    estimatedDateText: r.estimated_date_text || '',
    revisedDate: r.revised_date,
    revisedDateText: r.revised_date_text || '',
    isSpecialDate: !!r.is_special_date,
    specialDateText: r.special_date_text || undefined,
    isCompleted: !!r.is_completed,
    completedAt: r.completed_at,
    completedAtText: r.completed_at_text || '',
    remark: r.remark || '',
    status: r.status,
    isPeriodic: !!r.is_periodic,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

function rowToChangelog(r) {
  return {
    id: r.id,
    taskId: r.task_id,
    taskTitle: r.task_title || '',
    weekName: r.week_name || '',
    field: r.field,
    oldValue: r.old_value || '',
    newValue: r.new_value || '',
    changedAt: Number(r.changed_at),
    source: r.source,
  };
}

function rowToImportLog(r) {
  return {
    id: r.id,
    updatedAt: r.updated_at,
    version: r.version,
    relatedSheet: r.related_sheet,
    importedAt: Number(r.imported_at),
  };
}

function rowToAttachment(r) {
  return {
    id: r.id,
    taskId: r.task_id,
    originalName: r.original_name,
    storedName: r.stored_name,
    size: Number(r.size),
    uploadedAt: Number(r.uploaded_at),
  };
}

/** 把任意来源的任务对象归一化；日期文本和 ISO 日期只保留一套可信值 */
function normalizeTask(input, specialTexts = DEFAULT_SPECIAL_TEXTS) {
  const t = input || {};
  const weekName = normalizeWeekName(asTrimmed(t.weekName ?? t.week_name, 64));
  const title = asTrimmed(t.title, 255);
  if (!weekName) throw Object.assign(new Error('缺少所属周'), { status: 400 });
  if (!title) throw Object.assign(new Error('任务名称不能为空'), { status: 400 });

  const estText = asTrimmed(t.estimatedDateText ?? t.estimated_date_text, 64);
  const revText = asTrimmed(t.revisedDateText ?? t.revised_date_text, 64);
  let completedText = asTrimmed(t.completedAtText ?? t.completed_at_text, 64);

  let estimatedDate = parseDateText(t.estimatedDate ?? t.estimated_date) || parseDateText(estText);
  let revisedDate = parseDateText(t.revisedDate ?? t.revised_date) || parseDateText(revText);
  let completedAt = parseDateText(t.completedAt ?? t.completed_at) || parseDateText(completedText);

  let status = TASK_STATUSES.has(t.status) ? t.status : null;
  let isCompleted = asBool(t.isCompleted ?? t.is_completed);
  if (status === 'cancelled') {
    isCompleted = false;
  } else if (status === 'completed') {
    isCompleted = true;
  } else if (isCompleted) {
    status = 'completed';
  }
  if (!status) status = isCompleted ? 'completed' : 'notStarted';

  if (isCompleted && !completedAt) completedAt = todayISO();
  if (!isCompleted) {
    completedAt = null;
    completedText = '';
  }
  if (completedAt && !completedText) completedText = formatDateText(completedAt);

  const estimatedDateText = estText || (estimatedDate ? formatDateText(estimatedDate) : '');
  const revisedDateText = revText || (revisedDate ? formatDateText(revisedDate) : '');
  const special =
    isSpecialDateText(estimatedDateText, specialTexts)
    || isSpecialDateText(revisedDateText, specialTexts)
    || asBool(t.isSpecialDate);
  const specialDateText = isSpecialDateText(estimatedDateText, specialTexts)
    ? estimatedDateText
    : isSpecialDateText(revisedDateText, specialTexts)
      ? revisedDateText
      : t.specialDateText
        ? asTrimmed(t.specialDateText, 64)
        : null;

  const priority = Number(t.priority);
  const now = Date.now();

  return {
    uid: randomUUID(),
    weekName,
    seq: Number(t.seq) || 0,
    title,
    requester: asTrimmed(t.requester, 64),
    priority: PRIORITIES.has(priority) ? priority : 3,
    estimatedDate,
    estimatedDateText,
    revisedDate,
    revisedDateText,
    isSpecialDate: special,
    specialDateText,
    isCompleted,
    completedAt,
    completedAtText: completedText,
    remark: String(t.remark ?? '').slice(0, 10000),
    status,
    isPeriodic: asBool(t.isPeriodic ?? t.is_periodic),
    createdAt: now,
    updatedAt: now,
  };
}

async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw e;
  } finally {
    conn.release();
  }
}

async function nextSeq(conn, weekName) {
  const [rows] = await conn.query(
    'SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM tasks WHERE week_name = ?',
    [weekName],
  );
  return Number(rows[0].next);
}

/** 删除/移动后把该周序号重新压紧为 1..N（两段式，避免唯一索引冲突） */
async function renumberWeek(conn, weekName) {
  if (!weekName) return;
  const [rows] = await conn.query(
    'SELECT id FROM tasks WHERE week_name = ? ORDER BY seq, id',
    [weekName],
  );
  if (rows.length === 0) return;
  await conn.query('UPDATE tasks SET seq = seq + 100000 WHERE week_name = ?', [weekName]);
  for (let i = 0; i < rows.length; i++) {
    await conn.query('UPDATE tasks SET seq = ? WHERE id = ?', [i + 1, rows[i].id]);
  }
}

async function insertTask(conn, task, seq) {
  const [result] = await conn.query(
    `INSERT INTO tasks (uid,week_name,seq,title,requester,priority,estimated_date,estimated_date_text,
      revised_date,revised_date_text,is_special_date,special_date_text,is_completed,completed_at,completed_at_text,
      remark,status,is_periodic,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      task.uid, task.weekName, seq, task.title, task.requester, task.priority,
      task.estimatedDate, task.estimatedDateText, task.revisedDate, task.revisedDateText,
      task.isSpecialDate ? 1 : 0, task.specialDateText || null, task.isCompleted ? 1 : 0,
      task.completedAt, task.completedAtText, task.remark, task.status, task.isPeriodic ? 1 : 0,
      task.createdAt, task.updatedAt,
    ],
  );
  return { id: result.insertId, seq };
}

/** 统一的状态流转：completed 自动补完成时间，取消/回退清空完成时间 */
function applyStatusTransition(task, targetStatus) {
  if (!TASK_STATUSES.has(targetStatus)) return;
  if (targetStatus === 'completed') {
    task.status = 'completed';
    task.isCompleted = true;
    if (!task.completedAt) {
      task.completedAt = todayISO();
      task.completedAtText = todayText();
    } else if (!task.completedAtText) {
      task.completedAtText = formatDateText(task.completedAt);
    }
    return;
  }
  task.status = targetStatus === 'inProgress' ? 'inProgress' : targetStatus;
  task.isCompleted = false;
  task.completedAt = null;
  task.completedAtText = '';
}

const DB_COLUMN = {
  weekName: 'week_name',
  seq: 'seq',
  title: 'title',
  requester: 'requester',
  priority: 'priority',
  estimatedDate: 'estimated_date',
  estimatedDateText: 'estimated_date_text',
  revisedDate: 'revised_date',
  revisedDateText: 'revised_date_text',
  isSpecialDate: 'is_special_date',
  specialDateText: 'special_date_text',
  isCompleted: 'is_completed',
  completedAt: 'completed_at',
  completedAtText: 'completed_at_text',
  remark: 'remark',
  status: 'status',
  isPeriodic: 'is_periodic',
};

const BOOL_FIELDS = new Set(['isSpecialDate', 'isCompleted', 'isPeriodic']);

/** 只记录用户能理解的字段，避免 estimatedDate/estimatedDateText 同时产生两条日志 */
const LOG_FIELDS = [
  'weekName', 'seq', 'title', 'requester', 'priority',
  'estimatedDateText', 'revisedDateText',
  'isCompleted', 'completedAtText', 'remark', 'status', 'isPeriodic',
];

function toLogString(value) {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

async function logChanges(conn, { taskId, taskTitle, weekName, before, after, source, fields }) {
  const changed = [];
  for (const field of fields) {
    const oldStr = toLogString(before[field]);
    const newStr = toLogString(after[field]);
    if (oldStr === newStr) continue;
    changed.push({ field, oldValue: oldStr, newValue: newStr });
  }
  for (const c of changed) {
    await conn.query(
      `INSERT INTO changelogs (task_id,week_name,task_title,field,old_value,new_value,changed_at,source)
       VALUES (?,?,?,?,?,?,?,?)`,
      [taskId, weekName, taskTitle, c.field, c.oldValue, c.newValue, Date.now(), source],
    );
  }
  return changed.length;
}

// ---------- 健康检查 ----------
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'connected', uptime: Math.round(process.uptime()) });
  } catch (e) {
    res.status(503).json({ ok: false, db: 'disconnected', error: e.message });
  }
});

// ---------- Settings ----------
function normalizeSettings(s) {
  return {
    id: 'app',
    weekStart: 1,
    priorityMap: s?.priorityMap && typeof s.priorityMap === 'object'
      ? { 1: String(s.priorityMap[1] ?? '高'), 2: String(s.priorityMap[2] ?? '中'), 3: String(s.priorityMap[3] ?? '低') }
      : DEFAULT_SETTINGS.priorityMap,
    specialTexts: Array.isArray(s?.specialTexts) && s.specialTexts.length
      ? s.specialTexts.map((x) => String(x).trim()).filter(Boolean)
      : DEFAULT_SETTINGS.specialTexts,
    periodicKeywords: Array.isArray(s?.periodicKeywords)
      ? s.periodicKeywords.map((x) => String(x).trim()).filter(Boolean)
      : DEFAULT_SETTINGS.periodicKeywords,
    weekOrder: Array.isArray(s?.weekOrder) ? s.weekOrder.map(String) : [],
  };
}

app.get('/api/settings', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM settings WHERE id = ?', ['app']);
    if (rows.length === 0) return res.json(DEFAULT_SETTINGS);
    const r = rows[0];
    const parseJson = (v, fallback) => {
      if (v == null) return fallback;
      if (typeof v === 'string') {
        try { return JSON.parse(v); } catch { return fallback; }
      }
      return v;
    };
    res.json(normalizeSettings({
      priorityMap: parseJson(r.priority_map, DEFAULT_SETTINGS.priorityMap),
      specialTexts: parseJson(r.special_texts, DEFAULT_SETTINGS.specialTexts),
      periodicKeywords: parseJson(r.periodic_keywords, DEFAULT_SETTINGS.periodicKeywords),
      weekOrder: parseJson(r.week_order, []),
    }));
  } catch (e) {
    fail(res, e);
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    const s = normalizeSettings(req.body);
    await pool.query(
      `INSERT INTO settings (id, week_start, priority_map, special_texts, periodic_keywords, week_order)
       VALUES (?,1,?,?,?,?)
       ON DUPLICATE KEY UPDATE week_start=VALUES(week_start), priority_map=VALUES(priority_map),
         special_texts=VALUES(special_texts), periodic_keywords=VALUES(periodic_keywords), week_order=VALUES(week_order)`,
      [
        'app',
        JSON.stringify(s.priorityMap),
        JSON.stringify(s.specialTexts),
        JSON.stringify(s.periodicKeywords),
        JSON.stringify(s.weekOrder),
      ],
    );
    invalidateSettingsCache();
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
});

// ---------- 每周统计 ----------
app.get('/api/tasks/week-stats', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT week_name AS week, COUNT(*) AS total,
              SUM(CASE WHEN is_completed=1 AND status<>'cancelled' THEN 1 ELSE 0 END) AS completed
       FROM tasks GROUP BY week_name`,
    );
    res.json(rows.map((r) => ({ week: r.week, total: Number(r.total), completed: Number(r.completed) })));
  } catch (e) {
    fail(res, e);
  }
});

// ---------- Tasks ----------
app.get('/api/tasks', async (req, res) => {
  try {
    const { week, limit, offset } = req.query;
    const ATT_COUNT = '(SELECT COUNT(*) FROM attachments a WHERE a.task_id = t.id AND a.deleted_at IS NULL) AS attachment_count';
    const weekParam = week ? String(week) : '';
    const weekName = weekParam ? normalizeWeekName(weekParam) : '';
    if (weekName) {
      let [rows] = await pool.query(
        `SELECT t.*, ${ATT_COUNT} FROM tasks t WHERE t.week_name = ? ORDER BY t.seq, t.id`,
        [weekName],
      );
      // 兼容未迁移的历史周名（如老书签里的 9月第二周）
      if (rows.length === 0 && weekName !== weekParam) {
        [rows] = await pool.query(
          `SELECT t.*, ${ATT_COUNT} FROM tasks t WHERE t.week_name = ? ORDER BY t.seq, t.id`,
          [weekParam],
        );
      }
      return res.json(rows.map(rowToTask));
    }
    if (limit != null && limit !== '') {
      const take = Math.min(Math.max(Number(limit) || 20, 1), 500);
      const skip = Math.max(Number(offset) || 0, 0);
      const [rows] = await pool.query(
        `SELECT t.*, ${ATT_COUNT} FROM tasks t ORDER BY t.week_name, t.seq, t.id LIMIT ? OFFSET ?`,
        [take, skip],
      );
      const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM tasks');
      return res.json({ items: rows.map(rowToTask), total: Number(total) });
    }
    const [rows] = await pool.query(
      `SELECT t.*, ${ATT_COUNT} FROM tasks t ORDER BY t.week_name, t.seq, t.id`,
    );
    res.json(rows.map(rowToTask));
  } catch (e) {
    fail(res, e);
  }
});

app.get('/api/tasks/weeks', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT DISTINCT week_name AS w FROM tasks ORDER BY week_name');
    res.json(rows.map((r) => r.w));
  } catch (e) {
    fail(res, e);
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const specialTexts = await getSpecialTexts();
    const task = normalizeTask(req.body, specialTexts);
    const result = await withTransaction(async (conn) => {
      const seq = await nextSeq(conn, task.weekName);
      return insertTask(conn, task, seq);
    });
    res.json(result);
  } catch (e) {
    fail(res, e, e.status || 500);
  }
});

app.post('/api/tasks/bulk', async (req, res) => {
  // 追加导入：按周依次追加序号
  try {
    const list = req.body;
    if (!Array.isArray(list) || list.length === 0) return res.json({ count: 0 });
    if (list.length > 5000) return res.status(400).json({ error: '单次导入不能超过 5000 条' });
    const specialTexts = await getSpecialTexts();
    const count = await withTransaction(async (conn) => {
      const seqMap = new Map();
      let inserted = 0;
      for (const raw of list) {
        const task = normalizeTask(raw, specialTexts);
        if (!seqMap.has(task.weekName)) {
          seqMap.set(task.weekName, await nextSeq(conn, task.weekName));
        }
        const seq = seqMap.get(task.weekName);
        await insertTask(conn, task, seq);
        seqMap.set(task.weekName, seq + 1);
        inserted++;
      }
      return inserted;
    });
    res.json({ count });
  } catch (e) {
    fail(res, e, e.status || 500);
  }
});

app.post('/api/tasks/bulk-upsert', async (req, res) => {
  // 合并导入：同周同名视为同一条任务，更新而不是重复插入；更新同样写变更日志
  try {
    const list = req.body;
    if (!Array.isArray(list) || list.length === 0) return res.json({ added: 0, updated: 0, logged: 0 });
    if (list.length > 5000) return res.status(400).json({ error: '单次导入不能超过 5000 条' });
    const specialTexts = await getSpecialTexts();
    const result = await withTransaction(async (conn) => {
      const [existing] = await conn.query('SELECT * FROM tasks');
      const byKey = new Map();
      for (const row of existing) byKey.set(`${row.week_name}\u0000${row.title}`, row);
      const seqMap = new Map();
      let added = 0;
      let updated = 0;
      let logged = 0;
      for (const raw of list) {
        const task = normalizeTask(raw, specialTexts);
        const key = `${task.weekName}\u0000${task.title}`;
        const found = byKey.get(key);
        if (found) {
          await conn.query(
            `UPDATE tasks SET requester=?, priority=?, estimated_date=?, estimated_date_text=?,
               revised_date=?, revised_date_text=?, is_special_date=?, special_date_text=?,
               is_completed=?, completed_at=?, completed_at_text=?, remark=?, status=?, is_periodic=?, updated_at=?
             WHERE id=?`,
            [
              task.requester, task.priority, task.estimatedDate, task.estimatedDateText,
              task.revisedDate, task.revisedDateText, task.isSpecialDate ? 1 : 0, task.specialDateText,
              task.isCompleted ? 1 : 0, task.completedAt, task.completedAtText,
              task.remark, task.status, task.isPeriodic ? 1 : 0, task.updatedAt, found.id,
            ],
          );
          // 记录「导入」来源的字段变更：seq/uid/createdAt 未参与 UPDATE，保持原值避免误报
          const before = rowToTask(found);
          const after = {
            ...task,
            uid: before.uid,
            seq: before.seq,
            createdAt: before.createdAt,
          };
          logged += await logChanges(conn, {
            taskId: found.id,
            taskTitle: before.title,
            weekName: before.weekName,
            before,
            after,
            source: 'import',
            fields: LOG_FIELDS,
          });
          updated++;
          byKey.set(key, { ...found, ...task, id: found.id });
        } else {
          if (!seqMap.has(task.weekName)) {
            seqMap.set(task.weekName, await nextSeq(conn, task.weekName));
          }
          const seq = seqMap.get(task.weekName);
          const created = await insertTask(conn, task, seq);
          added++;
          byKey.set(key, { ...task, id: created.id, seq });
          seqMap.set(task.weekName, seq + 1);
        }
      }
      return { added, updated, logged };
    });
    res.json(result);
  } catch (e) {
    fail(res, e, e.status || 500);
  }
});

app.patch('/api/tasks/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: '无效的任务 ID' });
    const patch = req.body || {};
    const specialTexts = await getSpecialTexts();
    const oldValues = await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM tasks WHERE id = ? FOR UPDATE', [id]);
      if (rows.length === 0) throw Object.assign(new Error('任务不存在'), { status: 404 });
      const before = rowToTask(rows[0]);
      const next = { ...before };
      const source = patch.source === 'status' ? 'status' : 'edit';

      if ('weekName' in patch) {
        const weekName = normalizeWeekName(asTrimmed(patch.weekName, 64));
        if (!weekName) throw Object.assign(new Error('所属周不能为空'), { status: 400 });
        if (weekName !== before.weekName) {
          next.weekName = weekName;
          next.seq = await nextSeq(conn, weekName);
        }
      }
      if ('seq' in patch) {
        const seq = Number(patch.seq);
        if (!Number.isInteger(seq) || seq < 1) throw Object.assign(new Error('序号必须是正整数'), { status: 400 });
        next.seq = seq;
      }
      if ('title' in patch) {
        const title = asTrimmed(patch.title, 255);
        if (!title) throw Object.assign(new Error('任务名称不能为空'), { status: 400 });
        next.title = title;
      }
      if ('requester' in patch) next.requester = asTrimmed(patch.requester, 64);
      if ('priority' in patch) {
        const p = Number(patch.priority);
        next.priority = PRIORITIES.has(p) ? p : 3;
      }
      if ('remark' in patch) next.remark = String(patch.remark ?? '').slice(0, 10000);
      if ('isPeriodic' in patch) next.isPeriodic = asBool(patch.isPeriodic);

      if ('estimatedDateText' in patch || 'estimatedDate' in patch) {
        const text = asTrimmed(patch.estimatedDateText ?? before.estimatedDateText, 64);
        const date = parseDateText(text) || parseDateText(patch.estimatedDate);
        next.estimatedDateText = text || (date ? formatDateText(date) : '');
        next.estimatedDate = date;
      }
      if ('revisedDateText' in patch || 'revisedDate' in patch) {
        const text = asTrimmed(patch.revisedDateText ?? before.revisedDateText, 64);
        const date = parseDateText(text) || parseDateText(patch.revisedDate);
        next.revisedDateText = text || (date ? formatDateText(date) : '');
        next.revisedDate = date;
      }
      if ('completedAtText' in patch || 'completedAt' in patch) {
        const text = asTrimmed(patch.completedAtText ?? before.completedAtText, 64);
        const date = parseDateText(text) || parseDateText(patch.completedAt);
        next.completedAtText = text || (date ? formatDateText(date) : '');
        next.completedAt = date;
        // 补完成时间即视为已完成；清空时间保持原完成状态，交给「异常」提醒去补
        if (date) {
          next.isCompleted = true;
          next.status = 'completed';
        }
      }

      if ('status' in patch) {
        applyStatusTransition(next, patch.status);
      } else if ('isCompleted' in patch) {
        applyStatusTransition(next, asBool(patch.isCompleted) ? 'completed' : 'notStarted');
      }

      next.isSpecialDate =
        isSpecialDateText(next.estimatedDateText, specialTexts)
        || isSpecialDateText(next.revisedDateText, specialTexts);
      next.specialDateText = isSpecialDateText(next.estimatedDateText, specialTexts)
        ? next.estimatedDateText
        : isSpecialDateText(next.revisedDateText, specialTexts)
          ? next.revisedDateText
          : null;

      const changedCols = [];
      const vals = [];
      for (const [field, col] of Object.entries(DB_COLUMN)) {
        const oldVal = before[field];
        const newVal = next[field];
        const equal = BOOL_FIELDS.has(field)
          ? Boolean(oldVal) === Boolean(newVal)
          : (oldVal == null ? null : String(oldVal)) === (newVal == null ? null : String(newVal));
        if (equal) continue;
        changedCols.push(col);
        vals.push(BOOL_FIELDS.has(field) ? (newVal ? 1 : 0) : newVal);
      }

      const nextTitle = next.title;
      if (changedCols.length > 0) {
        changedCols.push('updated_at');
        vals.push(Date.now(), id);
        await conn.query(`UPDATE tasks SET ${changedCols.map((c) => `${c}=?`).join(',')} WHERE id=?`, vals);
      }

      // 移动到别的周后，把原周的序号压紧
      if (next.weekName !== before.weekName) {
        await renumberWeek(conn, before.weekName);
      }

      await logChanges(conn, {
        taskId: id,
        taskTitle: nextTitle,
        weekName: before.weekName,
        before,
        after: next,
        source,
        fields: LOG_FIELDS,
      });

      const old = {};
      for (const key of Object.keys(patch)) {
        if (key in before) old[key] = before[key];
      }
      return old;
    });
    res.json({ ok: true, oldValues });
  } catch (e) {
    fail(res, e, e.status || 500);
  }
});

/** 统一状态接口：看板拖拽、表格状态下拉都走这里 */
app.post('/api/tasks/:id/status', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: '无效的任务 ID' });
    const target = req.body?.status;
    if (!TASK_STATUSES.has(target)) return res.status(400).json({ error: '无效的状态' });
    const ok = await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM tasks WHERE id = ? FOR UPDATE', [id]);
      if (rows.length === 0) throw Object.assign(new Error('任务不存在'), { status: 404 });
      const before = rowToTask(rows[0]);
      const next = { ...before };
      applyStatusTransition(next, target);
      const cols = [];
      const vals = [];
      for (const field of ['isCompleted', 'completedAt', 'completedAtText', 'status']) {
        const oldVal = before[field];
        const newVal = next[field];
        const equal = typeof oldVal === 'boolean'
          ? Boolean(oldVal) === Boolean(newVal)
          : (oldVal == null ? '' : String(oldVal)) === (newVal == null ? '' : String(newVal));
        if (!equal) {
          cols.push(DB_COLUMN[field]);
          vals.push(typeof newVal === 'boolean' ? (newVal ? 1 : 0) : newVal);
        }
      }
      if (cols.length) {
        cols.push('updated_at');
        vals.push(Date.now(), id);
        await conn.query(`UPDATE tasks SET ${cols.map((c) => `${c}=?`).join(',')} WHERE id=?`, vals);
      }
      await logChanges(conn, {
        taskId: id,
        taskTitle: before.title,
        weekName: before.weekName,
        before,
        after: next,
        source: 'status',
        fields: ['isCompleted', 'completedAtText', 'status'],
      });
      return true;
    });
    res.json({ ok, status: target });
  } catch (e) {
    fail(res, e, e.status || 500);
  }
});

app.post('/api/tasks/:id/complete', async (req, res) => {
  // 兼容旧接口：切换完成状态
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: '无效的任务 ID' });
    const target = asBool(req.body?.completed) ? 'completed' : 'notStarted';
    const ok = await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM tasks WHERE id = ? FOR UPDATE', [id]);
      if (rows.length === 0) throw Object.assign(new Error('任务不存在'), { status: 404 });
      const before = rowToTask(rows[0]);
      const next = { ...before };
      applyStatusTransition(next, target);
      const cols = [];
      const vals = [];
      for (const field of ['isCompleted', 'completedAt', 'completedAtText', 'status']) {
        const oldVal = before[field];
        const newVal = next[field];
        const equal = typeof oldVal === 'boolean'
          ? Boolean(oldVal) === Boolean(newVal)
          : (oldVal == null ? '' : String(oldVal)) === (newVal == null ? '' : String(newVal));
        if (!equal) {
          cols.push(DB_COLUMN[field]);
          vals.push(typeof newVal === 'boolean' ? (newVal ? 1 : 0) : newVal);
        }
      }
      if (cols.length) {
        cols.push('updated_at');
        vals.push(Date.now(), id);
        await conn.query(`UPDATE tasks SET ${cols.map((c) => `${c}=?`).join(',')} WHERE id=?`, vals);
      }
      await logChanges(conn, {
        taskId: id,
        taskTitle: before.title,
        weekName: before.weekName,
        before,
        after: next,
        source: 'status',
        fields: ['isCompleted', 'completedAtText', 'status'],
      });
      return true;
    });
    res.json({ ok, completed: target === 'completed' });
  } catch (e) {
    fail(res, e, e.status || 500);
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: '无效的任务 ID' });
    const result = await withTransaction(async (conn) => {
      const [taskRows] = await conn.query('SELECT week_name FROM tasks WHERE id=?', [id]);
      // 附件软删除：文件与记录先留着，撤销删除时可以挂回重建的任务；超过保留期由后台清理
      const [atts] = await conn.query(
        'SELECT id FROM attachments WHERE task_id=? AND deleted_at IS NULL',
        [id],
      );
      if (atts.length > 0) {
        await conn.query(
          'UPDATE attachments SET deleted_at=? WHERE task_id=? AND deleted_at IS NULL',
          [Date.now(), id],
        );
      }
      await conn.query('DELETE FROM tasks WHERE id=?', [id]);
      if (taskRows.length > 0) await renumberWeek(conn, taskRows[0].week_name);
      // 变更日志保留，作为历史审计；任务标题已冗余写入 task_title
      return { attachmentIds: atts.map((a) => a.id), weekName: taskRows[0]?.week_name ?? '' };
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    fail(res, e);
  }
});

app.post('/api/tasks/:id/copy', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: '无效的任务 ID' });
    const targetWeek = normalizeWeekName(asTrimmed(req.body?.targetWeek, 64));
    if (!targetWeek) return res.status(400).json({ error: '缺少目标周' });
    const result = await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM tasks WHERE id = ?', [id]);
      if (rows.length === 0) throw Object.assign(new Error('任务不存在'), { status: 404 });
      const src = rows[0];
      const now = Date.now();
      const task = {
        uid: randomUUID(),
        weekName: targetWeek,
        seq: 0,
        title: src.title,
        requester: src.requester,
        priority: Number(src.priority),
        estimatedDate: src.estimated_date,
        estimatedDateText: src.estimated_date_text || '',
        revisedDate: null,
        revisedDateText: '',
        isSpecialDate: !!src.is_special_date,
        specialDateText: src.special_date_text,
        isCompleted: false,
        completedAt: null,
        completedAtText: '',
        remark: src.remark || '',
        status: 'notStarted',
        isPeriodic: !!src.is_periodic,
        createdAt: now,
        updatedAt: now,
      };
      const seq = await nextSeq(conn, targetWeek);
      return insertTask(conn, task, seq);
    });
    res.json(result);
  } catch (e) {
    fail(res, e, e.status || 500);
  }
});

app.post('/api/tasks/clear', async (_req, res) => {
  try {
    const files = await withTransaction(async (conn) => {
      const [atts] = await conn.query('SELECT stored_name FROM attachments');
      await conn.query('DELETE FROM attachments');
      await conn.query('DELETE FROM tasks');
      await conn.query('DELETE FROM changelogs');
      await conn.query('DELETE FROM import_logs');
      return atts.map((a) => a.stored_name);
    });
    for (const name of files) removeStoredFile(name);
    res.json({ ok: true, removedFiles: files.length });
  } catch (e) {
    fail(res, e);
  }
});

// ---------- 周期任务批量生成 ----------
app.post('/api/tasks/generate-periodic', async (req, res) => {
  try {
    const targetWeek = normalizeWeekName(asTrimmed(req.body?.targetWeek, 64));
    if (!targetWeek) return res.status(400).json({ error: '缺少 targetWeek' });
    const result = await withTransaction(async (conn) => {
      const [periodic] = await conn.query('SELECT * FROM tasks WHERE is_periodic=1 ORDER BY id DESC');
      if (periodic.length === 0) return { count: 0, skipped: 0 };
      const [existing] = await conn.query('SELECT title FROM tasks WHERE week_name=?', [targetWeek]);
      const existingTitles = new Set(existing.map((r) => r.title));
      const seen = new Set();
      let seq = await nextSeq(conn, targetWeek);
      let created = 0;
      let skipped = 0;
      const now = Date.now();
      for (const src of periodic) {
        if (seen.has(src.title)) continue;
        seen.add(src.title);
        if (existingTitles.has(src.title)) { skipped++; continue; }
        const task = {
          uid: randomUUID(),
          weekName: targetWeek,
          seq: 0,
          title: src.title,
          requester: src.requester,
          priority: Number(src.priority),
          estimatedDate: null,
          estimatedDateText: '',
          revisedDate: null,
          revisedDateText: '',
          isSpecialDate: !!src.is_special_date,
          specialDateText: src.special_date_text,
          isCompleted: false,
          completedAt: null,
          completedAtText: '',
          remark: src.remark || '',
          status: 'notStarted',
          isPeriodic: true,
          createdAt: now,
          updatedAt: now,
        };
        await insertTask(conn, task, seq);
        seq++;
        created++;
      }
      return { count: created, skipped };
    });
    res.json(result);
  } catch (e) {
    fail(res, e, e.status || 500);
  }
});

// ---------- Changelogs ----------
app.get('/api/changelogs', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 300, 1), 1000);
    const { taskId, week } = req.query;
    const where = [];
    const vals = [];
    if (taskId) { where.push('task_id=?'); vals.push(Number(taskId)); }
    if (week) { where.push('week_name=?'); vals.push(String(week)); }
    const sql = `SELECT * FROM changelogs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY changed_at DESC LIMIT ?`;
    vals.push(limit);
    const [rows] = await pool.query(sql, vals);
    res.json(rows.map(rowToChangelog));
  } catch (e) {
    fail(res, e);
  }
});

// ---------- Import logs (Sheet2) ----------
app.get('/api/import-logs', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM import_logs ORDER BY imported_at DESC');
    res.json(rows.map(rowToImportLog));
  } catch (e) {
    fail(res, e);
  }
});

app.post('/api/import-logs/bulk', async (req, res) => {
  try {
    const logs = req.body;
    if (!Array.isArray(logs) || logs.length === 0) return res.json({ count: 0 });
    if (logs.length > 5000) return res.status(400).json({ error: '单次导入不能超过 5000 条' });
    const values = logs.map((l) => [
      String(l.updatedAt ?? '').slice(0, 32),
      String(l.version ?? '').slice(0, 128),
      l.relatedSheet ? String(l.relatedSheet).slice(0, 64) : null,
      Number(l.importedAt) || Date.now(),
    ]);
    const [r] = await pool.query('INSERT INTO import_logs (updated_at,version,related_sheet,imported_at) VALUES ?', [values]);
    res.json({ count: r.affectedRows });
  } catch (e) {
    fail(res, e);
  }
});

// ---------- 任务留档附件 ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = file.originalname.includes('.')
        ? file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase()
        : '';
      cb(null, `${Date.now()}-${randomUUID().slice(0, 10)}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
  // 白名单：拒绝 html/svg/js 等可能携带脚本或可执行的类型
  fileFilter: (_req, file, cb) => {
    const ext = extname(String(file.originalname || '')).toLowerCase();
    if (ALLOWED_UPLOAD_EXT.has(ext)) return cb(null, true);
    return cb(Object.assign(
      new Error(`不支持的文件类型${ext ? `（${ext}）` : ''}，允许：${ALLOWED_UPLOAD_LABEL}`),
      { status: 415 },
    ));
  },
});

app.get('/api/attachments/storage', async (_req, res) => {
  try {
    res.json(await uploadUsage());
  } catch (e) {
    fail(res, e);
  }
});

app.get('/api/tasks/:id/attachments', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: '无效的任务 ID' });
    const [rows] = await pool.query(
      'SELECT * FROM attachments WHERE task_id=? AND deleted_at IS NULL ORDER BY uploaded_at DESC',
      [id],
    );
    res.json(rows.map(rowToAttachment));
  } catch (e) {
    fail(res, e);
  }
});

app.post('/api/tasks/:id/attachments', upload.array('files', 10), async (req, res) => {
  const files = req.files || [];
  const discard = () => { for (const f of files) removeStoredFile(f.filename); };
  try {
    const id = parseId(req.params.id);
    if (!id) {
      discard();
      return res.status(400).json({ error: '无效的任务 ID' });
    }
    const [t] = await pool.query('SELECT id FROM tasks WHERE id=?', [id]);
    if (t.length === 0) {
      discard();
      return res.status(404).json({ error: '任务不存在' });
    }
    if (files.length === 0) {
      return res.status(400).json({ error: '没有收到文件' });
    }
    const incoming = files.reduce((sum, f) => sum + f.size, 0);
    const usage = await uploadUsage();
    if (usage.used + incoming > usage.quota) {
      discard();
      const needMb = (incoming / 1024 / 1024).toFixed(1);
      return res.status(413).json({
        error: `附件空间不足：已用 ${usage.usedMb}MB / 上限 ${usage.quotaMb}MB，本次需要 ${needMb}MB。`
          + '请清理旧附件，或调大 server/.env 里的 UPLOAD_QUOTA_MB。',
      });
    }
    for (const f of files) {
      let originalName = f.originalname;
      try {
        // multer/busboy 按 latin1 解码文件名，这里还原 UTF-8
        const decoded = Buffer.from(f.originalname, 'latin1').toString('utf8');
        if (!decoded.includes('\uFFFD')) originalName = decoded;
      } catch { /* 保底使用原始名 */ }
      await pool.query(
        'INSERT INTO attachments (task_id, original_name, stored_name, size, uploaded_at) VALUES (?,?,?,?,?)',
        [id, originalName, f.filename, f.size, Date.now()],
      );
    }
    const after = await uploadUsage();
    res.json({ count: files.length, used: after.used, quota: after.quota });
  } catch (e) {
    fail(res, e);
  }
});

app.get('/api/attachments/:id/download', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: '无效的附件 ID' });
    const [rows] = await pool.query('SELECT * FROM attachments WHERE id=? AND deleted_at IS NULL', [id]);
    if (rows.length === 0) return res.status(404).json({ error: '附件不存在' });
    const att = rowToAttachment(rows[0]);
    const filePath = storedFilePath(att.storedName);
    if (!filePath) return res.status(404).json({ error: '文件已丢失' });
    res.download(filePath, att.originalName);
  } catch (e) {
    fail(res, e);
  }
});

/** 撤销删除任务后，把软删除的附件挂回重建的任务 */
app.post('/api/attachments/restore', async (req, res) => {
  try {
    const taskId = parseId(req.body?.taskId);
    if (!taskId) return res.status(400).json({ error: '无效的任务 ID' });
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0).slice(0, 200)
      : [];
    if (ids.length === 0) return res.json({ count: 0 });
    const [t] = await pool.query('SELECT id FROM tasks WHERE id=?', [taskId]);
    if (t.length === 0) return res.status(404).json({ error: '任务不存在' });
    // 只允许恢复「已软删除、且原任务确实已不存在」的附件，避免把在用附件抢到别的任务上
    const [r] = await pool.query(
      `UPDATE attachments SET task_id=?, deleted_at=NULL
       WHERE id IN (?) AND deleted_at IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = attachments.task_id)`,
      [taskId, ids],
    );
    res.json({ count: r.affectedRows });
  } catch (e) {
    fail(res, e);
  }
});

app.delete('/api/attachments/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: '无效的附件 ID' });
    const [rows] = await pool.query('SELECT * FROM attachments WHERE id=?', [id]);
    if (rows.length === 0) return res.json({ ok: true });
    const att = rowToAttachment(rows[0]);
    await pool.query('DELETE FROM attachments WHERE id=?', [id]);
    removeStoredFile(att.storedName);
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
});

// ---------- 未知 API ----------
app.use('/api', (_req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// ---------- 静态托管前端构建产物（生产模式） ----------
if (existsSync(distDir)) {
  app.use(express.static(distDir, { maxAge: '1h', index: false }));
  // SPA fallback：非 /api 路由一律返回 index.html
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(join(distDir, 'index.html'));
  });
}

// ---------- 统一错误处理 ----------
app.use((err, _req, res, _next) => {
  console.error('[server]', err);
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: '单个文件不能超过 50MB' });
  }
  if (err?.code === 'LIMIT_FILE_COUNT' || err?.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: '一次最多上传 10 个文件' });
  }
  if (err?.status) {
    return res.status(err.status).json({ error: err.message });
  }
  res.status(500).json({ error: err?.message || '服务器内部错误' });
});

// ---------- 启动 ----------
ensureSchema()
  .then(async () => {
    migrateLegacyUploads();
    try {
      const purged = await purgeDeletedAttachments();
      if (purged > 0) console.log(`  · 已清理过期附件 ${purged} 个`);
      const usage = await uploadUsage();
      console.log(`✓ 附件目录：${uploadsDir}（${usage.count} 个 / ${usage.usedMb}MB，上限 ${usage.quotaMb}MB）`);
    } catch (e) {
      console.error('附件初始化失败：', e.message);
    }
    // 每小时清理一次超过保留期的软删除附件
    setInterval(() => {
      purgeDeletedAttachments()
        .then((n) => { if (n > 0) console.log(`[attachments] 清理过期附件 ${n} 个`); })
        .catch((e) => console.error('[attachments] 清理失败：', e.message));
    }, 60 * 60 * 1000).unref();

    const server = app.listen(config.serverPort, () => {
      console.log(`✓ 服务已启动: http://localhost:${config.serverPort}  (MySQL: ${config.database}@${config.host})`);
      if (existsSync(distDir)) console.log(`✓ 前端页面托管于同一端口，浏览器访问 http://localhost:${config.serverPort} 即可`);
    });

    const shutdown = async (signal) => {
      console.log(`\n收到 ${signal}，正在关闭…`);
      server.close(async () => {
        try { await pool.end(); } catch { /* ignore */ }
        process.exit(0);
      });
      setTimeout(() => process.exit(0), 5000).unref();
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  })
  .catch((e) => {
    console.error('启动失败，请检查 MySQL 是否运行、账号密码及数据库是否存在：', e.message);
    process.exit(1);
  });
