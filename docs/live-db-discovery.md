# 实库探测记录

更新时间：
- 2026-04-20

探测方式：
- 只读连接数据库
- 查询 `information_schema`
- 少量样本与行数统计

目的：
- 确认当前真实数据库是否和文档一致
- 判断 `Market Board` 与 `On-chain Board` 的真实可接入程度

## 一、连通性结果

当前只读外网访问方式：
- `mysql -h 34.69.208.251 -u observer -P 8876 -pobserver01234TapFy`
- 项目内 `DATABASE_URL` 已切换到同一入口，默认数据库名按 `cryptoaivipdb` 使用
- 该入口说明为“不限制访问源地址”

已确认：
- `DATABASE_URL` 可正常连接
- `OAUTH_SERVER_URL` 已配置成功

数据库最小验证：
- `SELECT 1` 返回成功

注意：
- 连接串中的 `connection_limit`、`pool_timeout` 在 `mysql2` 单连接模式下会产生 warning
- 当前不影响连通性

## 二、真实存在的主要表

本次探测到的核心表：

- `activity_events`
- `chaindata_address`
- `chaindata_flow`
- `exchange_activities`
- `exchange_announcements`
- `exchange_delisting_risk`
- `exchange_listings`
- `exchange_listings_history`
- `exchange_pairs`
- `exchange_platforms`
- `funding_rate_daily`
- `task_update_planning`
- `token_address`
- `token_allocation`
- `token_holding`
- `token_profiles`
- `token_socials`
- `token_trade_depth_daily`
- `token_trade_depth_snapshot`
- `token_unlocks`
- `wallet_address_tags`

## 三、关键表结构确认

## 1. `token_profiles`

已确认字段包括：
- `id`
- `slug`
- `symbol`
- `name`
- `description`
- `logo_url`
- `website`
- `whitepaper_url`
- `current_price`
- `market_cap`
- `fdv`
- `total_supply`
- `circulating_supply`
- `volume_24h`
- `price_change_24h`
- `price_change_7d`
- `coin_tags`
- `token_holder_count`

判断：
- 足够支撑 `Market Board` 列表页和详情页左侧的大部分基础信息

## 2. `token_holding`

已确认字段包括：
- `token_id`
- `chain_name`
- `address`
- `balance`
- `percentage_of_circulating`
- `is_exchange`
- `exchange_id`
- `exchangeType`
- `label`

判断：
- 足够支撑持仓集中度基础版
- 也能支撑标签地址与 Top 持仓列表基础版

缺口：
- 没看到按日历史版本字段
- 不足以直接做“新增 / 流失 Top 地址”

## 3. `exchange_listings`

已确认字段包括：
- `token_id`
- `exchange_id`
- `listing_time`
- `announcement_id`
- `price_at_list`
- `circulating_supply_at_list`
- `fdv_at_list`
- `market_cap_at_list`
- `volume_24h_at_list`
- `price_pre_24h`
- `change_pre_24h`
- `price_post_15m`
- `change_post_15m`
- `deposit_time`
- `pair_name`
- `pairs_id`

判断：
- 对 `Coin Detail -> listing` 非常有帮助
- 比之前文档推测的还更完整

## 4. `exchange_announcements`

已确认字段包括：
- `exchange_slug`
- `title`
- `url`
- `published_at`
- `content`
- `content_summary`
- `is_activity`
- `is_listing`
- `is_delisting_risk`

判断：
- 足够支撑 `Market Board` 公告页
- 也可支撑详情页“最新公告”

## 5. `exchange_pairs`

已确认字段包括：
- `token_id`
- `exchange_id`
- `pair_name`
- `quote_currency`
- `price`
- `depth_sell_2`
- `depth_buy_2`
- `volume_24h`
- `listing_time`
- `price_at_list`
- `symbol`
- `funding_rate`
- `open_interest`
- `close_price_first_day`
- `high_price_first_day`

判断：
- 这张表对 `Market Board` 和 `Coin Detail` 很关键
- 市场深度、交易量、资金费率、OI 都有基础支撑

## 6. `token_address`

已确认字段包括：
- `token_id`
- `symbol`
- `chain_name`
- `address`

判断：
- 可支撑多链合约地址展示
- 也可以作为链上明细表的查询入口

## 7. `token_unlocks`

已确认字段包括：
- `token_id`
- `unlock_date`
- `unlock_amount`
- `percentage_of_total_supply`
- `recipient_category`

判断：
- 可以支撑 `unlock` 页
- 但累计值需要在 BFF 层再算

## 8. `chaindata_flow`

已确认字段包括：
- `token_address_id`
- `time`
- `from_address`
- `to_address`
- `to_address_id`
- `amount`
- `txhash`
- `log_index`
- `block_number`
- `raw_json`
- `action`

判断：
- 这是链上资金流最关键的真实表
- 但它是原始明细结构，不是现成的“分层资金流图”

缺口：
- 没有直接的 `layer`
- 没有直接的地址标签字段
- 标签需要额外 join `wallet_address_tags`

## 9. `wallet_address_tags`

已确认字段包括：
- `address`
- `tags`

判断：
- 可以给资金流图补标签
- 也可以辅助控盘 / 地址分类分析

## 10. 其他对页面很有价值的表

### `funding_rate_daily`
- 有 `snapshot_ts`、`funding_rate`、`open_interest`
- 对 `holders` 页趋势图有价值

### `token_trade_depth_daily`
- 有 `snapshot_ts`、`bid_amt`、`ask_amt`、`funding_rate`、`open_interest`
- 对 `depth` 页历史图有价值

### `token_trade_depth_snapshot`
- 有 `depth_buy_2`、`depth_sell_2`、`price`、`volume_24h`
- 对 `depth` 页当日快照有价值

### `exchange_activities`
- 有活动标题、奖励金额、开始结束时间、公告关联
- 对上市活动和任务活动展示有价值

### `token_allocation`
- 有 `category`、`amount`、`percentage`
- 可做控盘结构的“近似版”

## 四、样本与规模观察

样本 token：
- `BABA`
- `AVGO`
- `MSFT`
- `XMN`
- `CHIP`

关键行数：
- `token_profiles`: `1300`
- `token_holding`: `14869`
- `chaindata_flow`: `64`

这说明几个重要事实：

### 1. 库里不全是加密 token

`token_profiles` 样本里出现了：
- `BABA`
- `AVGO`
- `MSFT`

判断：
- 这套库是“更广义的资产池”，不只是纯链上代币
- 前端做筛选时，后续可能要增加“仅 crypto / 仅有链上地址”的过滤逻辑

### 2. 链上流向数据覆盖还比较薄

`chaindata_flow` 当前只有 `64` 条记录。

判断：
- 现阶段很难直接支撑一个大规模、稳定的资金流图产品页
- 更像是实验或早期积累数据

### 3. 市场数据基础比链上数据成熟

从表结构完整度看：
- `token_profiles`
- `exchange_listings`
- `exchange_pairs`
- `exchange_announcements`
- `token_unlocks`

都比链上聚合层更成熟。

结论：
- 应优先接 `Market Board`
- `On-chain Board` 先接基础版资金流图，不要一次做太重

## 五、对当前项目的实际影响

## 更适合先接真实数据的页面

- `/market`
- `/coin/:symbol` 左侧基础信息
- `/coin/:symbol` listing
- `/coin/:symbol` unlock
- `/coin/:symbol` depth` 的表格和快照部分

## 仍需谨慎推进的页面

- `/onchain`
- `/coin/:symbol` 的链上数据 tab

原因：
- 缺少统一链上宽表
- `chaindata_flow` 还是原始明细
- 标签、层级、历史聚合都要自己补拼

## 六、当前建议

最现实的推进顺序：

1. 先从 `Market Board` 开始接真实数据
2. 再接 `Coin Detail` 的基础信息 / listing / unlock / depth 表格
3. 最后再接 `On-chain Board` 的 `snapshot / holdings / transfers`

如果后面继续探测，最值得看的下一批内容是：
- `chaindata_address` 实际字段
- `exchange_platforms` 与 `exchange_id` 的映射
- `token_profiles` 是否有区分 crypto / non-crypto 的字段
- `chaindata_flow` 中哪些 `token_address_id` 实际有足够明细可画图
