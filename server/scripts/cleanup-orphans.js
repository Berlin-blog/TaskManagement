/**
 * 附件体检 / 孤儿清理。
 *
 * 默认只体检（dry-run），加 --apply 才会真正删除：
 *   node server/scripts/cleanup-orphans.js            # 只报告
 *   node server/scripts/cleanup-orphans.js --apply    # 删除孤儿文件，并把「文件已丢失」的记录标记为软删除
 *
 * 孤儿文件 = 磁盘上存在、但数据库里没有任何记录（含软删除记录）的文件。
 * 常见来源：手工拷贝、迁移中断、历史版本直接删库。
 */
import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';
import { config } from '../env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const legacyUploadsDir = join(__dirname, '..', 'uploads');
const defaultUploadsDir = process.platform === 'win32' && process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, 'TaskSchedule', 'uploads')
  : legacyUploadsDir;
const uploadsDir = config.uploadDir || defaultUploadsDir;

const apply = process.argv.includes('--apply');
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    try {
      const st = statSync(full);
      if (st.isFile()) out.push({ name, size: st.size, path: full });
    } catch { /* 跳过无法读取的文件 */ }
  }
  return out;
}

async function main() {
  console.log(`附件目录：${uploadsDir}`);
  if (uploadsDir !== legacyUploadsDir && existsSync(legacyUploadsDir)) {
    console.log(`历史目录：${legacyUploadsDir}（启动服务时会自动迁移）`);
  }

  const [rows] = await pool.query(
    'SELECT id, task_id, original_name, stored_name, size, deleted_at FROM attachments',
  );
  const byStored = new Map(rows.map((r) => [r.stored_name, r]));
  const files = [...listFiles(uploadsDir), ...listFiles(legacyUploadsDir)];
  const diskNames = new Set(files.map((f) => f.name));

  const orphans = files.filter((f) => !byStored.has(f.name));
  const missing = rows.filter((r) => !diskNames.has(basename(r.stored_name)));
  const live = rows.filter((r) => !r.deleted_at);
  const used = live.reduce((sum, r) => sum + Number(r.size || 0), 0);

  console.log(`数据库：${rows.length} 条附件记录（有效 ${live.length} 条，占用 ${mb(used)}）`);
  console.log(`磁盘：${files.length} 个文件，${mb(files.reduce((s, f) => s + f.size, 0))}`);
  console.log(`孤儿文件：${orphans.length} 个${orphans.length ? `（${mb(orphans.reduce((s, f) => s + f.size, 0))}）` : ''}`);
  console.log(`记录存在但文件丢失：${missing.length} 条`);

  for (const f of orphans.slice(0, 20)) console.log(`  - 孤儿 ${f.name}  ${mb(f.size)}`);
  if (orphans.length > 20) console.log(`  … 其余 ${orphans.length - 20} 个略`);
  for (const r of missing.slice(0, 20)) console.log(`  - 丢失 #${r.id} ${r.original_name}（任务 #${r.task_id}）`);
  if (missing.length > 20) console.log(`  … 其余 ${missing.length - 20} 条略`);

  if (!apply) {
    if (orphans.length || missing.length) console.log('\n这是体检模式，未做任何修改。加 --apply 执行清理。');
    return;
  }

  let removed = 0;
  for (const f of orphans) {
    try {
      unlinkSync(f.path);
      removed++;
    } catch (e) {
      console.error(`  删除失败 ${f.name}：${e.message}`);
    }
  }

  let marked = 0;
  let purged = 0;
  for (const r of missing) {
    if (r.deleted_at) {
      await pool.query('DELETE FROM attachments WHERE id = ?', [r.id]);
      purged++;
    } else {
      // 文件已经没了，记录标记为软删除，交给后台按保留期彻底清掉
      await pool.query('UPDATE attachments SET deleted_at = ? WHERE id = ?', [Date.now(), r.id]);
      marked++;
    }
  }

  console.log(`\n已删除孤儿文件 ${removed} 个，标记丢失记录 ${marked} 条，删除过期记录 ${purged} 条`);
}

main()
  .catch((e) => {
    console.error('清理失败：', e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
