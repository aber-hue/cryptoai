# 代币报告 Docx 生成与字段补齐方案

更新时间：2026-04-27

## 1. 目标

这份文档解决两个问题：

1. 代币研究报告最终要如何稳定生成 `.docx`
2. 当内部库部分字段缺失时，如何让大模型有序补齐，而不是自由发挥

核心原则只有一句话：

`大模型负责补信息和写叙事，不负责直接产最终文档，不负责编数字。`

---

## 2. 最终链路建议

建议把报告生成拆成 5 层：

```txt
数据采集层
-> report.raw.json
-> 字段补齐层
-> report.final.json
-> docx 渲染层
-> report.docx
```

对应职责：

- `report.raw.json`
  - 内部数据库、BigQuery、已有 API 能拿到的原始结构化数据
- `字段补齐层`
  - 用大模型补链接、团队、投资机构、项目简介等缺失字段
- `report.final.json`
  - 真正用于对外渲染的报告真源
- `docx 渲染层`
  - 只负责排版，不负责判断

不建议的链路：

```txt
symbol -> 大模型直接生成 docx
```

这个方式最大的问题是：

- 数据不可追溯
- 缺字段时模型会乱补
- 后续难复跑
- 很难做字段校对

---

## 3. 为什么必须先做 JSON 真源

如果最终要交付 `.docx`，也仍然建议先生成 `JSON`。

原因：

- 同一个报告可以反复渲染成 Markdown / Docx / PDF
- 字段补齐可以逐项留痕
- 内部审核只需要看 JSON diff
- 某一章要重跑时，不需要整份报告重做

建议产出 3 份中间对象：

- `report.raw.json`
- `report.enriched.json`
- `report.final.json`

推荐定义：

- `raw`
  - 只放内部确定性数据
- `enriched`
  - 加上外部检索和模型补齐结果
- `final`
  - 经过校验和人工确认后的最终版本

---

## 4. Docx 生成建议

## 4.1 生成原则

`.docx` 不应该由大模型直接生成内容布局，而应该由程序把 `report.final.json` 套进固定模板。

建议方式：

- 固定章节模板
- 固定表格模板
- 固定附录模板
- 程序填值

也就是说：

- 叙事文本可以来自大模型
- 版式结构必须来自模板

## 4.2 推荐输出链路

```txt
report.final.json
-> renderDocx(report.final.json, template)
-> report.docx
-> optional: pdf export
```

## 4.3 Docx 模板结构建议

建议模板分成这些部分：

1. 封面
2. 目录
3. 执行摘要
4. 章节正文
5. 风险提示
6. 数据来源附录
7. AI 补齐字段附录

其中正文里的内容建议全部模块化：

- 概览卡片
- 二列表格
- 多列表格
- 时间线表格
- 风险提示块
- 引用说明块

## 4.4 为什么要加“AI 补齐字段附录”

因为你后面一定会遇到这个问题：

- 正文读起来很顺
- 但内部会问：这条 Team / Twitter / 投资机构是哪里来的

所以建议在 docx 最后自动附一页：

- 字段名
- 字段值
- 是否 AI 补齐
- 补齐来源
- 置信度
- 抓取时间

这样正文不受影响，审校也方便。

---

## 5. 字段分类策略

不是所有字段都应该允许大模型补。

建议分成 3 类。

## 5.1 A 类：绝不允许模型编造

这些字段必须来自内部系统、链上、交易所 API 或可信数值源。

典型字段：

- `current_price`
- `market_cap`
- `fdv`
- `total_supply`
- `circulating_supply`
- `volume_24h`
- `listing_time`
- `price_at_list`
- `fdv_at_list`
- `unlock_amount`
- `monthly_release_ratio`
- `cumulative_release`
- `holder_count`

规则：

- 内部没数据就留空
- 可以去外部可信 API 补采
- 不能让模型“猜一个”

## 5.2 B 类：允许模型补齐，但必须给出处

这些字段通常是实体信息或链接信息，适合模型帮忙抽取或识别。

典型字段：

- `website`
- `docs_url`
- `app_url`
- `twitter_url`
- `github_url`
- `telegram_url`
- `discord_url`
- `team_members`
- `investor_names`
- `project_category`
- `one_liner`

规则：

- 必须带 `source_url`
- 必须带 `status`
- 必须带 `confidence`

## 5.3 C 类：允许模型生成总结

这些字段本质上是叙事，不是事实主数据。

典型字段：

- `business_description`
- `unlock_narrative`
- `listing_summary`
- `holder_summary`
- `risk_summary`
- `final_conclusion`

规则：

- 必须基于已有结构化数据
- 不允许出现数据上下文之外的新数字

---

## 6. 字段补齐一定要指定路径

你说的这个点很关键：`必须给模型指定补齐路径`。

否则会发生 3 个问题：

- 模型自己决定去哪找，结果来源混乱
- 同一个字段不同轮补出来不一致
- 后面没法复核

所以建议对每个可补字段定义一个固定的 `fallback_path`。

## 6.1 字段补齐协议

每个字段建议都定义这几个元信息：

```json
{
  "field": "twitter_url",
  "required": false,
  "primary_source": "internal_db.token_socials.twitter",
  "fallback_path": [
    "official_website_outlinks",
    "official_docs_outlinks",
    "official_x_search",
    "trusted_aggregator"
  ],
  "validation_rule": [
    "must_be_url",
    "domain_in:x.com,twitter.com"
  ],
  "llm_allowed": true
}
```

这样模型执行的不是“自由补齐”，而是“按协议补齐”。

---

## 7. 推荐的补齐路径矩阵

下面是我建议你先固定下来的路径矩阵。

## 7.1 官方链接类

适用字段：

- `website`
- `docs_url`
- `app_url`
- `twitter_url`
- `github_url`
- `telegram_url`
- `discord_url`

推荐路径：

1. 内部数据库
2. 官网首页外链
3. 官网 docs 页外链
4. 官方 X 主页简介
5. 可信聚合站
6. 仍缺失则 `unknown`

校验建议：

- URL 必须合法
- 域名必须在允许名单内
- 去重
- 同类链接只能保留一个主值，其他放 `alternatives`

## 7.2 Team 类

适用字段：

- `member_name`
- `role`
- `bio`
- `linkedin_url`
- `twitter_url`
- `prev_companies`

推荐路径：

1. 内部数据库
2. 官网 team 页
3. docs / about / blog
4. RootData / 官方融资页
5. 个人 LinkedIn / X
6. 仍缺失则保守留空

校验建议：

- 人名与职位至少要能在官方页面或可信来源同时出现一次
- `prev_companies` 没有明确出处时不要补

## 7.3 投资机构类

适用字段：

- `funding_rounds`
- `lead_investors`
- `other_investors`

推荐路径：

1. 内部数据库
2. RootData
3. 官方融资公告
4. 可信聚合站
5. 缺失则不要补金额，只补机构名

校验建议：

- 金额与估值优先内部
- 模型最多补机构名单，不补融资数字

## 7.4 项目简介类

适用字段：

- `one_liner`
- `business_description`
- `customer_description`

推荐路径：

1. 内部 description
2. 官网 hero 区
3. docs overview
4. 官方文章
5. 模型总结

校验建议：

- 不允许加入数据上下文中不存在的客户名
- 不允许加入未经验证的合作关系

## 7.5 LP / 链上专题类

适用字段：

- `initial_lp_summary`
- `suspected_lp_address`
- `lp_note`

推荐路径：

1. `token_dex_action_raw`
2. `token_transfer_raw`
3. `wallet_info`
4. 模型仅负责解释，不负责判数

校验建议：

- 是否为项目方地址只能给 `suspected`
- 置信度必须低于审计级结论

---

## 8. 字段状态设计

建议所有可补字段都统一带状态。

推荐结构：

```json
{
  "twitter_url": {
    "value": "https://x.com/example",
    "status": "llm_filled",
    "source_type": "official_site_outlink",
    "source_url": "https://example.com",
    "as_of": "2026-04-27T10:30:00Z",
    "confidence": 0.93
  }
}
```

`status` 建议枚举：

- `internal`
- `external_verified`
- `llm_filled`
- `inferred`
- `unknown`
- `needs_review`

推荐解释：

- `internal`
  - 内部数据源直接给出
- `external_verified`
  - 外部可信来源直接可验证
- `llm_filled`
  - 模型补齐，但带来源
- `inferred`
  - 程序或模型推断得出
- `unknown`
  - 没找到
- `needs_review`
  - 有候选结果，但冲突或不确定

---

## 9. 模型补齐时的任务拆分

不要让一个大模型 prompt 同时做：

- 链接补齐
- team 补齐
- 投资机构补齐
- 项目简介写作
- 风险总结

这会很乱。

建议拆成 5 类 worker。

## 9.1 link_enricher

只负责：

- 官网
- docs
- app
- X
- Github
- Telegram
- Discord

输出：

- 链接字段 + 来源 + 置信度

## 9.2 team_enricher

只负责：

- 成员名
- 职位
- 个人链接
- 简短 bio

## 9.3 investor_enricher

只负责：

- 投资机构名单
- 轮次文本补充

不允许：

- 自己补融资金额
- 自己补估值

## 9.4 narrative_writer

只负责：

- 项目概述
- 解锁说明
- 上线与流动性说明
- Holder / 资金流说明
- 风险总结

## 9.5 report_reviewer

只负责：

- 检查有没有越界生成
- 检查引用和字段状态是否完整
- 检查 docx 输出前是否还有 `needs_review`

---

## 10. Prompt 设计原则

大模型补齐时，prompt 一定要非常明确地告诉它：

- 当前字段是什么
- 内部已知值是什么
- 缺失值是什么
- 允许使用哪些来源
- 输出格式必须是什么
- 不能做什么

## 10.1 推荐输入格式

```json
{
  "field_group": "official_links",
  "symbol": "CHIP",
  "project_name": "USD.AI",
  "known_values": {
    "website": "https://..."
  },
  "missing_fields": [
    "twitter_url",
    "github_url",
    "docs_url"
  ],
  "fallback_path": [
    "official_website_outlinks",
    "official_docs_outlinks",
    "official_x_profile"
  ],
  "rules": [
    "must return source_url for every field",
    "if unsure return unknown",
    "do not fabricate numeric values"
  ]
}
```

## 10.2 推荐输出格式

```json
{
  "results": [
    {
      "field": "twitter_url",
      "value": "https://x.com/xxx",
      "status": "llm_filled",
      "source_type": "official_site_outlink",
      "source_url": "https://project.com",
      "confidence": 0.94,
      "note": "found in homepage footer"
    }
  ]
}
```

---

## 11. 校验建议

字段补齐后建议至少跑 4 类校验。

## 11.1 格式校验

- URL 合法性
- 数组结构完整性
- 必填字段非空

## 11.2 域名校验

比如：

- `twitter_url` 只能是 `x.com` / `twitter.com`
- `github_url` 只能是 `github.com`
- `docs_url` 不允许跳奇怪短链当主值

## 11.3 冲突校验

如果两个来源给出不同值：

- 标成 `needs_review`
- 不要自动覆盖

## 11.4 叙事越界校验

LLM 写的总结里如果出现：

- 结构化数据里不存在的新数字
- 未验证的新机构名
- 未验证的新合作客户

则直接打回重写。

---

## 12. 人工审核建议

不是每个字段都要人工看，但有些字段最好设为强审。

建议强审字段：

- team 成员
- 投资机构
- 客户 / 合作伙伴
- 初始 LP 判定
- 所有 `needs_review`

建议弱审字段：

- Twitter / Github / Docs 链接
- one-liner
- business_description

---

## 13. 结合你当前项目的落地建议

基于当前代码，我建议直接新增下面这些模块：

```txt
server/reports/
  schema.ts
  builder.ts
  enrich/
    linkEnricher.ts
    teamEnricher.ts
    investorEnricher.ts
    narrativeWriter.ts
  validators.ts
  renderers/
    markdown.ts
    docx.ts
```

建议先做的先后顺序：

1. 先把 `report.raw.json` 跑通
2. 再做 `link/team/investor` 三类补齐
3. 再做 `narrative`
4. 最后做 `docx` 渲染

不要一开始就从 docx 模板反推数据逻辑。

---

## 14. 我最建议你先冻结的 3 份东西

如果你准备正式开做，我建议先把下面 3 个东西定住。

## 14.1 `report.schema.json`

它定义：

- 报告有哪些字段
- 字段类型是什么
- 哪些字段允许 AI 补齐

## 14.2 `field_completion_policy.json`

它定义：

- 每个字段的主源
- fallback 路径
- 校验规则
- 是否允许模型补

## 14.3 `docx_template_spec.md`

它定义：

- docx 的章节顺序
- 各模块用什么版式
- 哪些字段正文显示
- 哪些字段进入附录

这三份一旦定了，后面的实现就会很顺。

---

## 15. 最终建议

如果你要把这套能力做稳，我建议这样理解：

- `报告系统的核心不是 docx，而是 report.final.json`
- `字段补齐的核心不是模型能力，而是字段补齐协议`
- `可校对的核心不是正文，而是 provenance 和 status`

一句话总结：

`让大模型补齐字段可以，但必须按字段、按路径、按格式、按来源补；让程序产 docx，不让模型直接产最终文档。`

