import { randomUUID } from 'node:crypto';
import { parseDateText, formatDateText, isSpecialDateText } from './dates.js';
import { normalizeWeekName, parseWeekName } from './weeks.js';

/**
 * 一次性数据修复。每个步骤用 app_meta 记录，只执行一次；
 * 目的是把历史遗留的「日期文本未解析 / seq 全为 1 / uid 重复」修正，
 * 之后由服务端写入逻辑保证不再产生。
 */
async function hasRun(conn, key) {
  const [rows] = await conn.query('SELECT meta_value FROM app_meta WHERE meta_key = ?', [key]);
  return rows.length > 0;
}

async function markRun(conn, key, summary) {
  await conn.query(
    'INSERT INTO app_meta (meta_key, meta_value, updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE meta_value=VALUES(meta_value), updated_at=VALUES(updated_at)',
    [key, String(summary), Date.now()],
  );
}

async function ensureAppMeta(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS app_meta (
      meta_key VARCHAR(64) PRIMARY KEY,
      meta_value TEXT,
      updated_at BIGINT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function ensureChangelogTitle(conn) {
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'changelogs' AND COLUMN_NAME = 'task_title'`,
  );
  if (cols.length === 0) {
    await conn.query('ALTER TABLE changelogs ADD COLUMN task_title VARCHAR(255) NOT NULL DEFAULT \'\' AFTER week_name');
  }
  // 回填历史日志的任务标题，任务被删除后日志仍可读
  await conn.query(`
    UPDATE changelogs c JOIN tasks t ON t.id = c.task_id
    SET c.task_title = t.title
    WHERE c.task_title = ''
  `);
}

async function repairDates(conn) {
  if (await hasRun(conn, '2026-10-27-dates')) return;
  const [rows] = await conn.query(
    `SELECT id, estimated_date, estimated_date_text, revised_date, revised_date_text,
            completed_at, completed_at_text, is_special_date
     FROM tasks`,
  );
  let updated = 0;
  for (const r of rows) {
    const patch = {};
    const pairs = [
      ['estimated_date', 'estimated_date_text'],
      ['revised_date', 'revised_date_text'],
      ['completed_at', 'completed_at_text'],
    ];
    for (const [dateCol, textCol] of pairs) {
      if (!r[dateCol] && r[textCol]) {
        const iso = parseDateText(r[textCol]);
        if (iso) patch[dateCol] = iso;
      }
      if (r[dateCol] && !r[textCol]) {
        patch[textCol] = formatDateText(r[dateCol]);
      }
    }
    const special =
      isSpecialDateText(r.estimated_date_text) || isSpecialDateText(r.revised_date_text);
    if (special && !r.is_special_date) patch.is_special_date = 1;
    if (Object.keys(patch).length > 0) {
      const cols = Object.keys(patch);
      await conn.query(
        `UPDATE tasks SET ${cols.map((c) => `${c}=?`).join(',')} WHERE id=?`,
        [...cols.map((c) => patch[c]), r.id],
      );
      updated++;
    }
  }
  await markRun(conn, '2026-10-27-dates', `updated ${updated}`);
  console.log(`  · 日期修复：${updated} 条`);
}

async function repairSeq(conn) {
  if (await hasRun(conn, '2026-10-27-seq')) return;
  const [weeks] = await conn.query('SELECT DISTINCT week_name FROM tasks');
  const [idx] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND INDEX_NAME = 'uniq_tasks_week_seq' LIMIT 1`,
  );
  let updated = 0;
  for (const { week_name } of weeks) {
    // 如果唯一索引已经存在（上次执行中断的情况），先整体挪到高位，避免逐条更新时冲突
    if (idx.length > 0) {
      await conn.query('UPDATE tasks SET seq = seq + 100000 WHERE week_name = ?', [week_name]);
    }
    const [rows] = await conn.query(
      'SELECT id, seq FROM tasks WHERE week_name=? ORDER BY seq, id',
      [week_name],
    );
    for (let i = 0; i < rows.length; i++) {
      const next = i + 1;
      if (rows[i].seq !== next) {
        await conn.query('UPDATE tasks SET seq=? WHERE id=?', [next, rows[i].id]);
        updated++;
      }
    }
  }
  await markRun(conn, '2026-10-27-seq', `updated ${updated}`);
  console.log(`  · 序号修复：${updated} 条`);
}

async function repairUids(conn) {
  if (await hasRun(conn, '2026-10-27-uid')) return;
  const [dups] = await conn.query(
    'SELECT uid, COUNT(*) AS n FROM tasks GROUP BY uid HAVING n > 1',
  );
  let updated = 0;
  for (const { uid } of dups) {
    const [rows] = await conn.query('SELECT id FROM tasks WHERE uid=? ORDER BY id', [uid]);
    for (let i = 1; i < rows.length; i++) {
      await conn.query('UPDATE tasks SET uid=? WHERE id=?', [randomUUID(), rows[i].id]);
      updated++;
    }
  }
  await markRun(conn, '2026-10-27-uid', `updated ${updated}`);
  console.log(`  · uid 去重：${updated} 条`);
}

async function indexExists(conn, table, index) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [table, index],
  );
  return rows.length > 0;
}

async function ensureIndexes(conn) {
  if (await hasRun(conn, '2026-10-27-indexes')) return;
  if (!(await indexExists(conn, 'tasks', 'uniq_tasks_uid'))) {
    await conn.query('ALTER TABLE tasks ADD UNIQUE INDEX uniq_tasks_uid (uid)');
  }
  if (!(await indexExists(conn, 'tasks', 'uniq_tasks_week_seq'))) {
    await conn.query('ALTER TABLE tasks ADD UNIQUE INDEX uniq_tasks_week_seq (week_name, seq)');
  }
  if (!(await indexExists(conn, 'changelogs', 'idx_task_changed'))) {
    await conn.query('ALTER TABLE changelogs ADD INDEX idx_task_changed (task_id, changed_at)');
  }
  await markRun(conn, '2026-10-27-indexes', 'ok');
  console.log('  · 唯一索引已建立');
}

/**
 * 给历史周名补年份（9月第二周 -> 2026年9月第二周）。
 * 旧数据没有年份，跨年同名周会被合并导入覆盖；这里按当前日期推断年份并一次性改写。
 * 已带年份的自定义周名不动。
 */
async function normalizeWeekYears(conn) {
  if (await hasRun(conn, '2026-11-02-week-year')) return;
  const now = new Date();
  const [weeks] = await conn.query(
    'SELECT week_name, COUNT(*) AS n FROM tasks GROUP BY week_name',
  );
  let tasksUpdated = 0;
  let logsUpdated = 0;
  let skipped = 0;
  for (const { week_name: weekName } of weeks) {
    const parsed = parseWeekName(weekName);
    if (!parsed || parsed.year) continue;
    const target = normalizeWeekName(weekName, now);
    if (!target || target === weekName) continue;
    const [exists] = await conn.query('SELECT id FROM tasks WHERE week_name = ? LIMIT 1', [target]);
    if (exists.length > 0) {
      // 目标周已存在（曾手工建过带年份的周）：保留原样，避免撞唯一索引；导入时人工确认
      skipped++;
      console.warn(`  ! 周名补年份跳过：${weekName} -> ${target} 已存在`);
      continue;
    }
    const [t] = await conn.query('UPDATE tasks SET week_name = ? WHERE week_name = ?', [target, weekName]);
    const [c] = await conn.query('UPDATE changelogs SET week_name = ? WHERE week_name = ?', [target, weekName]);
    tasksUpdated += t.affectedRows;
    logsUpdated += c.affectedRows;
  }
  await markRun(conn, '2026-11-02-week-year', `tasks ${tasksUpdated}, logs ${logsUpdated}, skipped ${skipped}`);
  console.log(`  · 周名补年份：任务 ${tasksUpdated} 条、日志 ${logsUpdated} 条${skipped ? `，跳过 ${skipped} 个` : ''}`);
}

export async function runMigrations(conn) {
  await ensureAppMeta(conn);
  await ensureChangelogTitle(conn);
  await repairDates(conn);
  await repairSeq(conn);
  await repairUids(conn);
  await ensureIndexes(conn);
  await normalizeWeekYears(conn);
}
