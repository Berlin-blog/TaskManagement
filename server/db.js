import mysql from 'mysql2/promise';
import { config } from './env.js';
import { runMigrations } from './migrations.js';

// 连接池
export const pool = mysql.createPool({
  host: config.host,
  port: config.port,
  user: config.user,
  password: config.password,
  database: config.database,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
});

// 空闲连接出错时不要让进程直接崩溃
pool.on('error', (err) => {
  console.error('MySQL 连接池错误：', err.message);
});

/** 启动时自动建表（如不存在） */
export async function ensureSchema() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        uid VARCHAR(64) NOT NULL,
        week_name VARCHAR(64) NOT NULL,
        seq INT NOT NULL DEFAULT 0,
        title VARCHAR(255) NOT NULL DEFAULT '',
        requester VARCHAR(64) NOT NULL DEFAULT '',
        priority TINYINT NOT NULL DEFAULT 3,
        estimated_date VARCHAR(20) DEFAULT NULL,
        estimated_date_text VARCHAR(64) NOT NULL DEFAULT '',
        revised_date VARCHAR(20) DEFAULT NULL,
        revised_date_text VARCHAR(64) NOT NULL DEFAULT '',
        is_special_date TINYINT(1) NOT NULL DEFAULT 0,
        special_date_text VARCHAR(64) DEFAULT NULL,
        is_completed TINYINT(1) NOT NULL DEFAULT 0,
        completed_at VARCHAR(20) DEFAULT NULL,
        completed_at_text VARCHAR(64) NOT NULL DEFAULT '',
        remark TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'notStarted',
        is_periodic TINYINT(1) NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        INDEX idx_week (week_name),
        INDEX idx_requester (requester),
        INDEX idx_priority (priority),
        INDEX idx_completed (is_completed),
        INDEX idx_uid (uid)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS changelogs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        week_name VARCHAR(64) NOT NULL DEFAULT '',
        task_title VARCHAR(255) NOT NULL DEFAULT '',
        field VARCHAR(64) NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_at BIGINT NOT NULL,
        source VARCHAR(20) NOT NULL DEFAULT 'edit',
        INDEX idx_task (task_id),
        INDEX idx_changed (changed_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS import_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        updated_at VARCHAR(32) NOT NULL DEFAULT '',
        version VARCHAR(128) NOT NULL DEFAULT '',
        related_sheet VARCHAR(64) DEFAULT NULL,
        imported_at BIGINT NOT NULL,
        INDEX idx_imported (imported_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS attachments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        stored_name VARCHAR(255) NOT NULL,
        size INT NOT NULL DEFAULT 0,
        uploaded_at BIGINT NOT NULL,
        deleted_at BIGINT DEFAULT NULL,
        INDEX idx_task (task_id),
        INDEX idx_deleted (deleted_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id VARCHAR(32) PRIMARY KEY,
        week_start TINYINT NOT NULL DEFAULT 1,
        priority_map JSON,
        special_texts JSON,
        periodic_keywords JSON,
        week_order JSON
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 旧表升级：补 week_order 列
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'settings' AND COLUMN_NAME = 'week_order'`,
      [config.database],
    );
    if (cols.length === 0) {
      await conn.query('ALTER TABLE settings ADD COLUMN week_order JSON');
    }

    // 旧表升级：附件软删除（任务删除后保留一段时间，支持「撤销」把附件一起恢复）
    const [attCols] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'attachments' AND COLUMN_NAME = 'deleted_at'`,
      [config.database],
    );
    if (attCols.length === 0) {
      await conn.query('ALTER TABLE attachments ADD COLUMN deleted_at BIGINT DEFAULT NULL');
      await conn.query('ALTER TABLE attachments ADD INDEX idx_deleted (deleted_at)');
    }

    // 默认 settings
    const [rows] = await conn.query('SELECT id FROM settings WHERE id = ?', ['app']);
    if (rows.length === 0) {
      await conn.query(
        'INSERT INTO settings (id, week_start, priority_map, special_texts, periodic_keywords) VALUES (?,1,?,?,?)',
        [
          'app',
          JSON.stringify({ 1: '高', 2: '中', 3: '低' }),
          JSON.stringify(['持续', '待定', '空']),
          JSON.stringify(['周报', '动销金额', '周日更新', '周一更新', '周五更新']),
        ],
      );
    }

    // 一次性数据修复 + 约束
    await runMigrations(conn);
  } finally {
    conn.release();
  }
}
