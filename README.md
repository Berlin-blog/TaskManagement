# 任务排期管理工具

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D18-339933.svg)](https://nodejs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8-4479a1.svg)](https://www.mysql.com/)

个人使用的任务排期管理小工具。前端 Vite + React，后端 Node + Express，数据存入**本地 MySQL 数据库**，清空浏览器缓存也不会丢失。

单用户本地工具，**不需要注册登录**，也不需要公网服务器；跑在自己电脑上，通过浏览器访问 `http://localhost:3001`。

## 功能一览

- **导入**：读取 xlsx 所有 sheet，按表头名称识别列（列顺序可调整），兼容真实 Excel 日期单元格、`26.9.7`、`2026/9/7` 与 Excel 序列号；Sheet2 作为历史更新日志导入。
- **周名自动补年份**：sheet 名 `9月第二周` 会存成 `2026年9月第二周`，跨年同名周不会互相覆盖；老链接里的 `?week=9月第二周` 会自动对齐到带年份的周。年份推断规则：未来超过 3 个月的周算去年，其余算今年；也可以在周名里直接写 `2027年1月第一周`。
- **年 / 周两级选择**：顶栏先选年份（列出数据中出现过的年份 + 前后一年，没建周的年份也能先选），周下拉只显示该年的周；切换年份会自动落到该年最接近今天的一周，该年还没有周时直接打开「新建周」并按该年补全年份。选「全部」则跨年份浏览，非当前年份的周会带上年份前缀。
- **合并导入**：同周同名任务按更新处理，不会重复新增；导入前显示「新增 / 更新」数量与样例预览。
- **任务页**：周视图 + 全部任务合并为一页；URL 保存周/关键词/需求人/P/状态/排序/页码，可刷新、可分享；全量排序后分页；支持行内编辑、新增/删除、批量完成/删除、移动周、复制周期任务。
- **全部任务**：跨周汇总，默认按周分组再按序号；同筛选/排序。
- **看板**：按未开始/进行中/已完成/延期/取消分列，默认显示最近一周，支持拖拽和状态下拉。
- **统计**：每周总数/完成/未完成/取消/延期/完成率，按需求人，按 P，按周趋势（Recharts）。
- **更新日志**：字段变更由服务端在事务内记录，含任务标题与真实周名；合并导入带来的修改记为「导入」来源；任务删除后历史仍可读；Sheet2 历史日志单独展示。
- **完成时间自动写入**：勾选完成→自动写今天；取消→清空；看板/表格/仪表盘共用同一套状态流转。
- **周期任务**：标记后可一键复制到新一周。
- **特殊日期**：`持续`/`待定`/`空` 不强行转日期，按原文保留；设置页自定义的特殊文本服务端同样生效。
- **留档附件**：上传白名单（xlsx/xls/csv、docx/doc、pptx/ppt、pdf、图片、txt/md、zip/7z/rar），单文件 50MB、单次 10 个、总量默认 2GB；任务删除后附件保留 24 小时，撤销删除可一并恢复；目录默认在 `%LOCALAPPDATA%\TaskSchedule\uploads`。
- **导出**：当前筛选结果 xlsx、全部任务 xlsx、全部任务 csv；周顺序按自然周排序。
- **设置**：P 映射、特殊文本、周期关键词、周顺序、清空数据。
- **移动端**：任务表格自动切换为卡片列表，顶部导航可横向滑动。
- **数据修复**：启动时执行一次性迁移，自动补齐日期解析、重排历史序号、去除重复 uid、给周名补年份并加唯一索引（见「数据修复」）。

## 技术栈

- 前端：Vite + React 18 + TypeScript + Tailwind CSS + Zustand + Recharts + SheetJS + react-router-dom
- 后端：Node.js + Express + mysql2
- 数据库：MySQL（本地）

## 快速开始

```bash
# 1. 建库（表由后端启动时自动创建）
mysql -u root -p -e "CREATE DATABASE task_schedule DEFAULT CHARSET utf8mb4;"

# 2. 配置数据库连接（.env 已被 gitignore，密码不会进仓库）
cp server/.env.example server/.env        # Windows: copy server\.env.example server\.env
# 编辑 server/.env，填入 DB_PASSWORD

# 3. 安装依赖并启动
npm install
npm --prefix server install
npm run dev
```

Windows 用户也可以直接双击项目根目录的 `启动任务排期.bat`：会自动装依赖、跑类型检查并构建前端、启动服务，然后打开 <http://localhost:3001>。

> 完整步骤、字段映射与常见问题见下方各节。

## 数据存储说明

数据保存在本地 MySQL 数据库，**不依赖浏览器存储**，清空浏览器缓存、换浏览器都不影响数据。只要 MySQL 服务在运行、数据库存在，数据就在。

留档附件默认保存在 `%LOCALAPPDATA%\TaskSchedule\uploads`（不再占用项目目录），表结构里只存文件名与元数据。**数据库备份和附件目录需要分别备份**。

## 一、准备 MySQL 数据库

确保本机已安装并启动 MySQL（建议 8.0+），然后建一个空数据库（表会由后端自动创建）：

```sql
CREATE DATABASE task_schedule DEFAULT CHARSET utf8mb4;
```

数据库连接默认值如下，密码**必须**通过 `server/.env` 提供：

| 项 | 默认值 |
|---|---|
| 主机 | localhost |
| 端口 | 3306 |
| 用户名 | root |
| 密码 | 取自 `server/.env` 的 `DB_PASSWORD`（代码中不写默认密码） |
| 数据库名 | task_schedule |

复制 `server/.env.example` 为 `server/.env` 并按实际情况修改：

```bash
cd server
cp .env.example .env
# 编辑 .env 填入你的实际配置
```

可配置项：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DB_HOST` / `DB_PORT` / `DB_USER` | `localhost` / `3306` / `root` | MySQL 连接信息 |
| `DB_PASSWORD` | 空 | MySQL 密码，**必填**（除空密码账号） |
| `DB_NAME` | `task_schedule` | 数据库名 |
| `PORT` | `3001` | 后端服务端口 |
| `UPLOAD_DIR` | `%LOCALAPPDATA%\TaskSchedule\uploads` | 附件目录；改成别的盘符可避免 C 盘占满 |
| `UPLOAD_QUOTA_MB` | `2048` | 附件总量上限，超过后拒绝上传 |
| `ATTACHMENT_GRACE_HOURS` | `24` | 删除任务后附件保留时长，供「撤销删除」恢复 |

## 二、启动方式

### 方式一：一键启动（推荐，Windows）

项目根目录的 `启动任务排期.bat` **双击即可**，它会自动完成：

1. 检测服务是否已在运行（在运行则直接打开页面）
2. 首次运行自动安装前后端依赖
3. 每次启动都会先跑 TypeScript 类型检查并构建前端（避免双击后看到旧页面）
4. 启动服务（一个最小化窗口，关闭该窗口即停止服务）
5. 自动打开浏览器访问 `http://localhost:3001`

> 一键启动模式下，前端页面由后端 Express 直接托管，**只需一个进程**，浏览器访问 `http://localhost:3001`。
> 如果启动失败，窗口会提示常见原因（MySQL 未启动、数据库不存在、密码不对）。
> 脚本以自身所在目录为项目根目录，放在任意路径都能运行。

### 方式二：开发模式（改代码时用）

```bash
npm install
cd server && npm install && cd ..
npm run dev
```

- 后端 API：`http://localhost:3001`
- 前端开发服务器：`http://localhost:5173`（热更新，自动打开）

### 停止服务

关闭「任务排期-服务」窗口，或用任务管理器结束对应的 node 进程。macOS / Linux 下 `Ctrl+C` 即可。

## 三、导入你的 Excel

1. 打开页面后，在左侧导航点击「**导入导出**」。
2. 将你的排期 Excel（如 `时间排期.xlsx`）拖入上传区，或点击「选择文件」。
3. 预览将显示：解析出的任务数、历史日志数、周名列表，以及「新增 / 更新」数量和前几条样例。
4. 选择「合并（同周同名更新）」或「覆盖」，点击「确认导入」。
5. 导入完成后，顶部周选择器出现 `9月第二周`、`9月第三周`、`9月第四周`，并显示每周完成进度；点击查看。

> 仓库不包含示例数据文件（避免提交真实业务内容），请按下方「Excel 字段映射」准备自己的表格。

## Excel 字段映射

| Excel 列 | 字段 | 规则 |
|---|---|---|
| 序号 | `seq` | 整数 |
| 名称 | `title` | 字符串 |
| 需求人 | `requester` | 字符串 |
| P | `priority` | 1 高 / 2 中 / 3 低 |
| 预估时间 | `estimatedDate` + `estimatedDateText` | `26.9.7`→`2026-09-07`；`持续/待定/空`→保留原文、标记特殊 |
| 修订时间 | `revisedDate` + `revisedDateText` | 同上 |
| 是否完成 | `isCompleted` + `status` | 是→已完成；否/空→未开始 |
| 完成时间 | `completedAt` | 同日期规则 |
| 备注 | `remark` | 字符串 |
| sheet 名 | `weekName` | 原样保留 |

Sheet2（更新日志）字段：更新时间、版本、涉及表单，导入到历史日志。

## 页面说明

| 路由 | 页面 |
|---|---|
| `/` | 仪表盘（含今日待办与延期提醒） |
| `/calendar` | 日历视图（按月展示每天任务） |
| `/tasks` | 任务（周视图 + 全部任务；`?week=`、`?q=`、`?status=` 等参数可直接分享） |
| `/week/:weekName` | 旧链接兼容，自动重定向到 `/tasks?week=...` |
| `/board` | 看板（默认最近一周） |
| `/stats` | 统计 |
| `/changelog` | 更新日志 |
| `/settings` | 设置 |
| `/import-export` | 导入导出 |

## 构建与检查

```bash
npm run typecheck   # 前端 + vite.config 类型检查
npm run build       # 先 typecheck，再构建 dist
npm run dev         # 开发模式（前端 5173 + 后端 3001）
```

一键启动脚本以 `cd /d "%~dp0"` 定位项目，不依赖硬编码路径；每次启动都会先跑类型检查和构建。

## 数据修复与备份

启动时后端会执行一次 `server/migrations.js` 中的修复（已执行过会记录在 `app_meta` 表，不重复执行）：

- 把历史「预估/修订/完成时间」文本解析为 ISO 日期（`持续/待定/空` 保持为空）
- 把每周 `seq` 重排为 `1..N`，并建立 `(week_name, seq)` 唯一索引
- 去除重复 `uid`，并建立 `uid` 唯一索引
- 给 `changelogs` 补 `task_title` 列并回填历史任务标题
- 给历史周名补年份（`9月第二周` → `2026年9月第二周`，同步改写变更日志里的周名）

附件目录首次启动时会从旧的 `server/uploads/` 自动复制到新目录，全部成功后才删除旧文件；失败则保留旧目录并回退读取，不会丢附件。启动日志会打印附件数量与占用。

数据库备份：启动前可用 `mysqldump` 导出；`backups/` 目录已加入 `.gitignore`。附件不包含在 Excel 导出中，请单独备份附件目录。

附件体检 / 清理孤儿文件：

```bash
cd server
npm run cleanup            # 只报告（dry-run）
npm run cleanup -- --apply # 删除孤儿文件，并把「文件已丢失」的记录标记为软删除
```

## 已知限制

- 单用户工具，没有登录/权限；默认监听所有网卡，**不要直接暴露到公网**。手机访问建议加反向代理/HTTPS 或 Tailscale。
- 数据库密码只从 `server/.env` 读取（模板见 `server/.env.example`），共享环境请使用独立账号，且不要把 `.env` 提交进仓库。
- 前端轮询间隔 15 秒；多标签页同时编辑同一条任务时以最后一次写入为准。
- 周名里的年份按当前日期推断（未来 3 个月以上算去年）。跨年新建周时如果推断结果不对，直接在周名里写年份，如 `2027年1月第一周`。
- 删除任务后附件在保留期内仍占配额与磁盘，超时由后台每小时清理。
- 一键启动脚本面向 Windows；macOS / Linux 请用「开发模式」的两条命令启动。

## 目录结构

```
├─ server/                    # Node + Express 后端
│  ├─ index.js               # Express 路由 + REST API
│  ├─ db.js                  # MySQL 连接池 + 自动建表
│  ├─ dates.js               # 服务端日期解析（含 Excel 序列号）
│  ├─ weeks.js               # 周名解析 / 补年份 / 排序键
│  ├─ migrations.js          # 一次性数据修复 + 索引
│  ├─ env.js                 # 读取 .env 配置
│  ├─ scripts/cleanup-orphans.js  # 附件体检 / 孤儿清理
│  ├─ .env.example           # 配置模板
│  └─ package.json
├─ public/favicon.svg
├─ src/
│  ├─ db/api.ts              # 前端 API 客户端（fetch 封装）
│  ├─ hooks/useTasks.ts      # 轮询查询 + 增删改 + 错误提示
│  ├─ lib/excel.ts           # SheetJS 导入导出（表头映射/日期归一化）
│  ├─ lib/date.ts  status.ts  taskSort.ts  weekSort.ts  utils.ts
│  ├─ types/index.ts
│  ├─ components/            # UI 组件 + Layout + TaskTable + TaskForm
│  ├─ pages/                 # 8 个页面
│  └─ store/uiStore.ts
├─ 启动任务排期.bat            # Windows 一键启动
├─ LICENSE                   # MIT
└─ package.json              # npm run dev / build / typecheck
```

## 参与贡献

欢迎提 Issue 或 PR，开发约定见 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请参考 [SECURITY.md](SECURITY.md)。

## 开源协议

本项目基于 [MIT License](LICENSE) 开源，Copyright (c) 2026 Berlin-blog。
