// 简易 .env 读取（避免引入 dotenv 依赖）
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '.env');
if (existsSync(envPath)) {
  const text = readFileSync(envPath, 'utf-8');
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx < 0) continue;
    const k = t.slice(0, idx).trim();
    const v = t.slice(idx + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}

export const config = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  // 密码只从环境变量 / server/.env 读取，不在代码里写默认值
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'task_schedule',
  serverPort: Number(process.env.PORT || 3001),
  // 附件目录：默认放到用户数据目录，避免占用项目目录；可用 UPLOAD_DIR 覆盖
  uploadDir: process.env.UPLOAD_DIR ? resolve(process.env.UPLOAD_DIR) : '',
  uploadQuotaMb: Math.max(Number(process.env.UPLOAD_QUOTA_MB) || 2048, 64),
  // 任务删除后附件的保留时长（供「撤销删除」恢复），超时后由后台清理
  attachmentGraceHours: Math.max(Number(process.env.ATTACHMENT_GRACE_HOURS) || 24, 1),
};
