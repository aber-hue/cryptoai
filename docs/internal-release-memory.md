# Internal Release Memory

## 当前发布约定

- 当前项目按“内部项目”处理。
- 当前阶段允许把部署凭证和服务账号文件跟仓库一起维护。
- 这条约定仅适用于当前内部版本。
- 如果后续项目变成对外版本，或者仓库访问范围扩大，再把凭证迁出仓库。

## 配置管理约定

- 不再依赖开发者本机绝对路径。
- 统一使用仓库内稳定路径或相对路径。
- 当前推荐路径：
  - BigQuery service account: `./secrets/bigquery-service-account.json`
- 环境变量模板统一参考仓库根目录的 `.env.example`

## 关键配置项

- `DATABASE_URL`：主业务库
- `FEATURE_DATABASE_URL`：功能库，`signal` 模块依赖它
- `OAUTH_SERVER_URL`：OAuth 服务地址
- `BIGQUERY_PROJECT_ID`
- `BIGQUERY_DATASET`
- `BIGQUERY_CREDENTIALS_PATH`
- `CMC_API_KEY`

## Signal 相关约定

- `signal` 不是只依赖主库。
- `signal` 依赖 `FEATURE_DATABASE_URL`。
- 首次可用需要确认以下几点：
  - 功能库已连通
  - signal 表已创建
  - signal templates 已 seed
  - 至少执行过一次 signal scan，`signalEvents` 才会有数据
- BigQuery 未配置时，可能只影响链上相关 signal，不一定影响全部 signal 页面。

## BigQuery 相关约定

- 之前本地 BigQuery 连不上，主要按“本地环境/凭证问题”处理。
- 当前代码允许使用两种凭证方式：
  - `BIGQUERY_CREDENTIALS_PATH`
  - `BIGQUERY_CREDENTIALS_JSON`
- 当前内部版推荐优先用稳定路径：
  - `BIGQUERY_CREDENTIALS_PATH=./secrets/bigquery-service-account.json`

## 本地开发提醒

- 本地开发如依赖代理或网络转发，按开发机实际网络环境启动。
- 这类网络问题默认不视为代码逻辑问题。

## 简短发布检查清单

1. 确认本次要发的 Git 分支
2. 确认 `.env` 与仓库约定一致
3. 确认 BigQuery 凭证路径可用
4. 确认 `FEATURE_DATABASE_URL` 已配置
5. 如发布 signal，确认表结构与 seed 已准备
6. 执行 `pnpm install`
7. 执行 `pnpm build`
8. 执行 `pnpm start`

