# 地址角色识别系统方案说明 v2

> 这份文档给产品、运营、研究、研发同事快速对齐用。
> 目标不是一次性自动贴对所有最终标签，而是稳定产出“可审阅的角色、证据和地址簇”。

---

## 1. 为什么要改方案

之前的思路是：

```text
token -> detector -> 直接猜 team_vault / investor_vault / airdrop_vault
```

这个方向在真实链上场景里很容易失真，原因很简单：

- mint 后的初始分发通常会经过多层中转，不会直接到最终业务地址
- 很多地址的语义不是静态属性，而是某一时间窗口里的“角色”
- `community / ecosystem / rewards / liquidity` 这类 tokenomics 分类本身就高度重叠
- 单次 run 很难直接得出“最终标签”，但可以先得出“这个地址更像什么角色，有哪些证据”

所以 v2 的核心转向是：

**不要先追求最终标签，要先稳定识别角色、证据和地址簇。**

---

## 2. v2 想解决什么

系统要先回答 3 个问题：

1. 这批地址在 mint 后早期分发路径里是什么结构
2. 这些地址更像哪种角色
3. 这些角色结合 tokenomics 之后，能不能收敛成业务标签

也就是说，系统输出分成三层：

```text
地址 / 地址簇
-> 角色 proposal
-> 最终业务标签 proposal
```

---

## 3. 新的系统主流程

```text
运营选代币
-> 系统构建 mint 后早期分发图
-> 生成地址簇
-> detector 产出角色证据
-> 归因器收敛出角色 proposal
-> 结合 tokenomics 产出最终标签 proposal
-> 人工审核
-> 审核通过后入生产表
```

这条链路和旧版最大的区别是：

- 中间多了“地址簇”
- detector 不再直接输出最终标签
- 人工审核不只看一个结论，而是看一组解释

---

## 4. 先识别什么，不先识别什么

### 4.1 第一优先级：角色

这类更适合先做，因为证据更直接：

- `vault_like`
- `distributor_like`
- `sink_like`
- `cex_like`
- `pool_like`
- `multisig_like`
- `contract_distributor_like`
- `claim_receiver_like`

### 4.2 第二优先级：地址簇

我们更关心“这一组地址是不是同一个结构的一部分”，而不是急着给单个地址定性。

常见簇包括：

- 同一控制人或同一 deployer 关联地址
- 早期窗口里互转密集的一组中转地址
- 共同向大量下游分发的一组 distributor
- 共同流向同一 sink 的归集地址

### 4.3 第三优先级：最终业务标签

这些标签不要第一步就猜：

- `team_vault`
- `investor_vault`
- `foundation_vault`
- `community_vault`
- `ecosystem_vault`
- `airdrop_vault`

这些应当基于：

- 角色判断
- 地址簇结构
- tokenomics 先验
- 时间窗口行为

共同收敛出来。

---

## 5. 为什么“角色”比“最终标签”更可靠

因为很多判断本质上不是“这个地址永远是什么”，而是“它在这段时间扮演了什么角色”。

比如：

- 一个地址可能在 TGE 后 3 天是 distributor
- 30 天后变成 treasury
- 另一个地址长期是 multisig，但在某个 token 的早期阶段承担 team custody

所以 v2 要避免把第一步判断做得过满。

更合理的顺序是：

```text
先判断角色
再结合上下文推最终标签
```

---

## 6. detector 在 v2 里怎么变

旧版是：

```text
detector -> final label
```

新版改成：

```text
detector -> evidence
evidence -> role attribution
role attribution + tokenomics -> final label
```

也就是说 detector 不直接说“这是 team_vault”，而是先说：

- 这个地址在 mint 后 4 层内收到大量早期分发
- 这个地址短期内高保留、低扇出
- 这个地址命中了 multisig / contract / cex / pool 特征
- 这个地址和另一组地址高度共现或互转

最后再由归因器把这些证据组合起来。

---

## 7. v2 的审核页要看什么

审核对象不应该只是“一个标签结论”，而应该是“一段解释”。

审核页应该优先展示：

- 地址或地址簇
- 所在层级
- 上游是谁
- 下游分发给了多少地址
- 在观察窗口里保留了多少
- 当前是否命中 CEX / LP / multisig / contract
- 为什么系统认为它像某个角色
- 为什么系统进一步认为它可能对应某个业务标签

简单说，审核的重点从：

```text
approve label
```

改成：

```text
approve explanation
```

---

## 8. 工作台在 v2 里会变成什么

顶部“工作台”不再只是：

- run 列表
- proposal 列表
- active labels

而是会分成 4 个视角：

1. `分发图`
   展示 mint 后早期 4 层结构

2. `角色候选`
   展示每个地址或地址簇为什么像 vault / distributor / sink

3. `最终标签候选`
   展示角色判断和 tokenomics 收敛后的业务标签建议

4. `生产标签`
   展示已经审核通过并生效的结果

这样研究同事看到的不是“系统猜了个答案”，而是“系统给出了一条可验证的推理链路”。

---

## 9. 这版最务实的实施顺序

### 第一步

先稳定跑出 `mint 后 4 层分发图`。

目标：

- 知道谁是源头
- 知道前 4 层主要流向
- 知道每个节点的接收、转出、扇出、保留

### 第二步

基于分发图做 `role proposal`。

目标：

- 不急着出最终业务标签
- 先把明显的 `vault_like / distributor_like / sink_like / cex_like / pool_like` 跑出来

### 第三步

做 `cluster proposal`。

目标：

- 把高度相关的一组地址收成一个审核对象
- 降低单地址误判

### 第四步

再做 `final label attribution`。

目标：

- 用角色、簇和 tokenomics 共同推导最终标签

---

## 10. 一句话总结

v2 不是“地址标签系统”，更准确地说是一个：

**基于 mint 后早期分发图的地址角色、证据和地址簇归因系统。**

它的目标不是立刻自动给出完美答案，而是稳定产出能被研究同事快速判断、快速修正、持续沉淀的高质量中间结果。
