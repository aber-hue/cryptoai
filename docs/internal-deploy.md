# Crypto AI 内部版部署说明

## 项目说明

这是一个前后端一体的 Node.js 应用，不是纯静态前端。

- 前端：React + Vite
- 后端：Express + tRPC
- 数据库：MySQL
- 启动后默认端口：`3000`

代码仓库：

`https://github.com/aber-hue/cryptoai`

## 部署方式

建议直接按整个项目部署，不需要拆开单独部署前端和 API。

开发拿到代码后，按下面流程即可：

```bash
git clone https://github.com/aber-hue/cryptoai.git
cd cryptoai
pnpm install
```

## 环境变量

项目依赖 `.env` 文件启动。

当前内部版本约定：

- 允许把部署用凭证和 service account 文件跟仓库一起维护
- 推荐统一参考仓库根目录 `.env.example`
- 推荐使用仓库内稳定路径，不再依赖某台开发机的绝对路径

至少需要以下变量：

```env
DATABASE_URL=
FEATURE_DATABASE_URL=
OAUTH_SERVER_URL=
CMC_API_KEY=
BIGQUERY_PROJECT_ID=
BIGQUERY_DATASET=
BIGQUERY_CREDENTIALS_PATH=./secrets/bigquery-service-account.json
```

补充说明：

- `DATABASE_URL`：主业务库
- `FEATURE_DATABASE_URL`：功能库
- `OAUTH_SERVER_URL`：OAuth 服务地址
- `CMC_API_KEY`：CoinMarketCap 接口 key
- `BIGQUERY_*`：链上 / On-chain 相关能力依赖它
- `BIGQUERY_CREDENTIALS_PATH`：当前内部版推荐指向仓库内稳定路径，例如 `./secrets/bigquery-service-account.json`

## Signal 模块补充

`signal` 模块除了主项目代码外，还依赖功能库。

需要确认：

- `FEATURE_DATABASE_URL` 已配置
- signal 相关表已创建
- signal templates 已 seed
- 如果页面要看到事件数据，还需要执行一次 signal scan

如果只配置了主库、没有配置功能库，signal 大概率会没有数据。

## 本地开发启动

```bash
pnpm dev
```

启动后默认访问：

`http://localhost:3000`

## 生产构建与启动

```bash
pnpm build
pnpm start
```

说明：

- `pnpm build` 会同时构建前端和服务端
- `pnpm start` 会以生产模式启动 Node 服务
- 生产环境需要保证 `.env` 已正确配置

## 可选检查

部署前可执行：

```bash
pnpm check
pnpm test
```

## 数据库说明

当前数据库由开发侧统一管理。

这次发布重点是产品端代码：

- 前端页面
- 后端 API

如果本次改动不涉及表结构变化，直接部署应用即可。

如果后续某次改动涉及数据库结构变更，再由开发侧决定是否执行：

```bash
pnpm db:push
```

## 日常内部发布流程

建议按下面的轻量流程执行：

1. 我本地修改并确认功能 OK
2. 代码 push 到 GitHub 仓库
3. 开发从仓库拉取最新代码
4. 更新 `.env`
5. 如需链上能力，确认 BigQuery 凭证文件路径可用
6. 如需 signal，确认 `FEATURE_DATABASE_URL`、表结构和 seed 已准备
7. 执行 `pnpm install`
8. 执行 `pnpm build`
9. 执行 `pnpm start`
10. 内部同事验证访问

## 我给开发的交付信息

每次发版我会提供：

- 仓库地址
- 分支名或 commit hash
- 本次改动说明
- 是否涉及数据库变更

## 当前建议

第一次内部部署，建议先按“整个项目直接拉下来部署”处理即可，不需要额外拆分工程。
