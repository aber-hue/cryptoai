# Field Completion Policy

更新时间：2026-04-27

## 总规则

- 只按预设路径补齐，不自由发挥
- 上一级命中后，不继续往下找
- 走完整条路径仍无结果，则留空
- 不猜、不编、不估算
- `Initial LP` 和 `Onchain` 不做外部补齐

## 模块规则

### 1. Overview

- 允许补齐
- 路径：`CMC`
- `CMC` 没有就不补

### 2. Official Links

- 允许补齐
- 路径：`CMC -> RootData`

### 3. Funding

- 允许补齐
- 路径：`RootData -> CryptoRank`

### 4. Team

- 允许补齐
- 路径：`RootData -> CryptoRank`

### 5. Tokenomics

- 允许补齐
- 路径：`CMC -> 官网 -> 白皮书`

### 6. Market

- 允许补齐
- 路径：`交易所官方数据`

### 7. Initial LP

- 不补
- 只使用内部链上 / DEX 数据

### 8. Onchain

- 不补
- 只使用内部链上数据

### 9. Conclusion

- 不做外部补齐
- 基于已有结构化数据自动生成总结

## 字段级硬规则

### 数值字段

- 只能取数据源原值
- 不允许模型估算
- 无数据就留空

### 链接 / 实体字段

- 可以补齐
- 必须记录来源

### 总结字段

- 可以生成
- 不允许新增未经验证的数字和实体

