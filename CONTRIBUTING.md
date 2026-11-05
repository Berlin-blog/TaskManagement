# 贡献指南

感谢关注这个项目！这是一个个人使用的本地排期工具，欢迎 Issue 和 PR。

## 开发环境

- Node.js >= 18
- MySQL 8.0+（本地）
- Windows / macOS / Linux 均可开发

```bash
npm install
npm --prefix server install
cp server/.env.example server/.env   # 填入 DB_PASSWORD
npm run dev                          # 前端 5173 + 后端 3001
```

提交前请确保通过：

```bash
npm run typecheck
npm run build
```

## 分支与提交

- 从 `main` 切出分支开发，例如 `feat/xxx`、`fix/xxx`。
- 提交信息建议使用 Conventional Commits 风格：`feat: 支持按标签筛选`、`fix: 修复跨年周名排序`。
- 一个 PR 尽量只做一件事，附带复现步骤或截图更好。

## 代码约定

- 前端 TypeScript，避免 `any`；复用 `src/components/ui` 里的基础组件。
- 后端保持纯 ESM（`import`），数据库操作集中在 `server/db.js` / `server/index.js`，写库用事务。
- 中文界面文案保持简洁一致，不要引入新的 UI 框架。
- 不要提交 `server/.env`、数据库备份、上传附件或任何真实业务数据。

## 报告问题

提 Issue 时请附上：操作系统、Node / MySQL 版本、复现步骤、相关日志（**先删除密码等敏感信息**）。
