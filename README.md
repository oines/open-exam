# open-exam

基于 Next.js + SQLite 的私有化在线考试系统，单机零外部数据库依赖，支持多场考试复用。

## 主要功能

- **多场考试管理**：每场考试独立配置题库、抽题数、限时、及格线、切屏上限与访问密码，生成独立入口 `/exam/[slug]`，并可指定首页默认考试。
- **随机抽题与防泄密**：服务端使用 `crypto.randomInt` 无放回随机抽题；考试期间下发给前端的数据不含答案与解析；同一学号断线或刷新自动恢复原试卷、已选草稿与剩余时间。
- **切屏防作弊**：同时监听 `visibilitychange` 与 `window.blur`（850ms 去重防误判），记录每次切屏时刻与离开时长；超过设定上限（默认 > 3 次）前端冻结并由服务端锁卷自动判作弊交卷，后台支持查看时间轴并人工复核。
- **自动改卷与统计后台（`/admin`）**：自动判分、按科目/题型拆解正确率、分数段分布、题库错题排行、单人答卷详情、JSON 题库导入与 UTF-8 BOM CSV 导出。
- **学院/班级二级联动**：支持关键词搜索班级，后台可在线维护全局院系班级字典。

## 快速开始

需要 **Node.js 22.13+**（使用内置 `node:sqlite`）。

```bash
cp .env.example .env.local
# 请务必修改 .env.local 中的 ADMIN_PASSWORD 和 ADMIN_SESSION_SECRET

npm ci
npm run build
npm run start
```

- 考试入口：`http://localhost:3000`
- 管理后台：`http://localhost:3000/admin`（默认开发密码见 `.env.example`，上线前请修改）

## Docker 部署

```bash
ADMIN_PASSWORD=your_strong_password \
ADMIN_SESSION_SECRET=your_long_random_secret \
docker compose up -d --build
```

SQLite 数据文件持久化挂载在 `./data/exam.db`。如需在反代后记录客户端 IP，请在 Nginx 配置 `X-Real-IP` 与 `X-Forwarded-For` 请求头。

## 私有题库与班级初始化

首次启动且数据库为空时，系统会优先加载 `./data/seed-exam.json`（初始考试与题库）和 `./data/seed-colleges.json`（学院班级字典，格式为 `{ "学院名": ["班级1", "班级2"] }`）；若不存在则自动写入内置的通用示例数据。`/data/` 目录已被 `.gitignore` 忽略，也可以直接在 `/admin` 后台在线导入。

## License

MIT
