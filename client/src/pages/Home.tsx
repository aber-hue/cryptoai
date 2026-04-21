import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { mockCryptoAiDataSource } from "@/features/crypto-ai/data-source";
import { cn } from "@/lib/utils";
import {
  Clock3,
  Pin,
  Search,
  Star,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

type SignalTab = "all" | "watching" | "upcoming";
type SortMode = "time" | "strength" | "urgency";

type EnrichedSignal = {
  id: string;
  symbol: string;
  name: string;
  signalType: string;
  strength: number;
  urgency: "high" | "medium" | "low";
  triggeredAt: string;
  relativeTime: string;
  ageHours: number;
  summary: string;
  theme: string;
  exchange: string;
  ruleCount: number;
  rules: Array<{ rule: string; value: string; source: string }>;
  isNew: boolean;
  watched?: boolean;
};

type UpcomingSignal = {
  id: string;
  symbol: string;
  name: string;
  signalType: string;
  theme: string;
  exchange: string;
  strength: number;
  urgency: "high" | "medium" | "low";
  satisfiedRules: number;
  totalRules: number;
  missingRule: string;
  gapText: string;
  preview: string;
  watched?: boolean;
};

function urgencyTone(urgency: "high" | "medium" | "low") {
  if (urgency === "high") {
    return "bg-[#fff0f0] text-[#d92d20]";
  }
  if (urgency === "medium") {
    return "bg-[#fff6e8] text-[#b54708]";
  }
  return "bg-[#eef9f3] text-[#067647]";
}

function ageTone(ageHours: number) {
  if (ageHours <= 1) return "opacity-100";
  if (ageHours <= 6) return "opacity-[0.93]";
  if (ageHours <= 24) return "opacity-[0.82]";
  return "opacity-[0.68]";
}

function sortWeight(urgency: "high" | "medium" | "low") {
  if (urgency === "high") return 3;
  if (urgency === "medium") return 2;
  return 1;
}

function signalTypeLabel(signalType: string) {
  return signalType.replaceAll("_", " ");
}

function SignalCard({
  signal,
  watched,
  onToggleWatch,
  onViewData,
}: {
  signal: EnrichedSignal;
  watched: boolean;
  onToggleWatch: () => void;
  onViewData: () => void;
}) {
  return (
    <Card
      className={cn(
        "rounded-[28px] border border-white/80 bg-white/90 shadow-[0_16px_40px_rgba(83,102,138,0.08)] transition hover:shadow-[0_20px_50px_rgba(83,102,138,0.12)]",
        ageTone(signal.ageHours)
      )}
    >
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[1.75rem] font-semibold leading-none text-[oklch(var(--crypto-ink))]">
                {signal.symbol}
              </div>
              <div className="text-base text-muted-foreground">{signal.name}</div>
              <Badge className="rounded-full bg-[oklch(var(--crypto-panel-soft))] px-3 py-1 text-[#344054] hover:bg-[oklch(var(--crypto-panel-soft))]">
                {signalTypeLabel(signal.signalType)}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-[#475467]">
              <span className="font-medium">{signal.triggeredAt}</span>
              <span>·</span>
              <span className="font-medium text-[oklch(var(--crypto-ink))]">{signal.relativeTime}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={watched ? "default" : "secondary"}
              className={cn(
                "h-9 rounded-full px-3.5",
                watched && "bg-[#0f66d8] hover:bg-[#0d59bf]"
              )}
              onClick={onToggleWatch}
            >
              <Star className={cn("mr-2 h-4 w-4", watched && "fill-current")} />
              关注
            </Button>
            <Button variant="secondary" className="h-9 rounded-full px-3.5" onClick={onViewData}>
              <Search className="mr-2 h-4 w-4" />
              看数据
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {[signal.theme, signal.exchange].map(item => (
            <Badge key={item} variant="secondary" className="rounded-full bg-[oklch(var(--crypto-panel-soft))] px-3 py-1 text-[#344054]">
              {item}
            </Badge>
          ))}
        </div>

        <div className="mt-4 rounded-[22px] border border-[#d6e4ff] bg-[linear-gradient(180deg,#f7fbff_0%,#eef5ff_100%)] px-4 py-4">
          <div className="text-xs uppercase tracking-[0.16em] text-[#175cd3]">触发规则</div>
          <div className="mt-2 text-[1.05rem] font-semibold leading-7 text-[oklch(var(--crypto-ink))]">
            {signal.rules[0]?.rule}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#475467]">
            <span className="font-medium text-[#175cd3]">{signal.rules[0]?.value}</span>
            <span>·</span>
            <span>{signal.rules[0]?.source}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const dashboard = mockCryptoAiDataSource.getDashboard();
  const [, setLocation] = useLocation();

  const activeSignals: EnrichedSignal[] = [
    {
      id: "sig_genius_alpha",
      symbol: "GENIUS",
      name: "Genius",
      signalType: "alpha_momentum",
      strength: 0.91,
      urgency: "high",
      triggeredAt: "11:20",
      relativeTime: "3 小时前触发",
      ageHours: 3,
      summary: "解锁前 3 天，OI 24h +42%，买盘深度加厚 55%。历史上类似模式更像拉盘配合出货，优先看节奏变化而不是单点追价。",
      theme: "Binance Alpha",
      exchange: "Binance Alpha",
      ruleCount: 1,
      isNew: true,
      watched: true,
      rules: [{ rule: "OI 24h 异动", value: "+42%", source: "oi_funding" }],
    },
    {
      id: "sig_genius_unlock",
      symbol: "GENIUS",
      name: "Genius",
      signalType: "unlock_window",
      strength: 0.82,
      urgency: "high",
      triggeredAt: "10:40",
      relativeTime: "4 小时前触发",
      ageHours: 4,
      summary: "活动奖励发放与新币流动性窗口重叠，若价格继续脱离深度支撑，容易出现短时流动性踩踏。",
      theme: "Binance Alpha",
      exchange: "Binance",
      ruleCount: 1,
      isNew: true,
      watched: true,
      rules: [{ rule: "奖励发放窗口临近", value: "T-2 天", source: "events" }],
    },
    {
      id: "sig_crmon_theme",
      symbol: "CRMon",
      name: "Salesforce (Ondo)",
      signalType: "rwa_rotation",
      strength: 0.7,
      urgency: "medium",
      triggeredAt: "10:48",
      relativeTime: "3.5 小时前触发",
      ageHours: 3.5,
      summary: "RWA 主题在同批 Binance Alpha 标的里持续轮动，CRMon 更适合做主题篮子里的相对强弱观察样本。",
      theme: "RWA",
      exchange: "Binance Alpha",
      ruleCount: 1,
      isNew: true,
      rules: [{ rule: "主题联动增强", value: "6 个相关标的", source: "theme_engine" }],
    },
    {
      id: "sig_appon_strength",
      symbol: "APPon",
      name: "AppLovin (Ondo)",
      signalType: "relative_strength",
      strength: 0.64,
      urgency: "medium",
      triggeredAt: "10:15",
      relativeTime: "4 小时前触发",
      ageHours: 4,
      summary: "相对强度仍在主题篮子前列，但成交量不足，优先放关注队列，不建议作为第一观察位。",
      theme: "RWA",
      exchange: "Binance Alpha",
      ruleCount: 1,
      isNew: true,
      watched: true,
      rules: [{ rule: "24h 相对强度领先", value: "+9.2%", source: "ohlcv" }],
    },
    {
      id: "sig_biduon_depth",
      symbol: "BIDUon",
      name: "Baidu (Ondo)",
      signalType: "depth_anomaly",
      strength: 0.58,
      urgency: "low",
      triggeredAt: "08:05",
      relativeTime: "6 小时前触发",
      ageHours: 6,
      summary: "盘口在上涨过程中变薄，说明追价接力意愿一般，更适合作为主题边缘观察而不是核心交易位。",
      theme: "RWA",
      exchange: "Gate",
      ruleCount: 1,
      isNew: true,
      rules: [{ rule: "卖盘深度下降", value: "-24%", source: "depth" }],
    },
    {
      id: "sig_check_campaign",
      symbol: "CHECK",
      name: "Anichess",
      signalType: "campaign_release",
      strength: 0.53,
      urgency: "medium",
      triggeredAt: "昨天 21:30",
      relativeTime: "16 小时前触发",
      ageHours: 16,
      summary: "活动发放窗口接近但二级量能承接不足，若后续公告确认节奏，容易先走情绪冲高再回落。",
      theme: "GameFi",
      exchange: "Bybit",
      ruleCount: 1,
      isNew: false,
      rules: [{ rule: "活动发放临近", value: "48h 内", source: "events" }],
    },
  ];

  const upcomingSignals: UpcomingSignal[] = [
    {
      id: "upcoming_coston",
      symbol: "COSTon",
      name: "Costco (Ondo)",
      signalType: "unlock_window",
      theme: "RWA",
      exchange: "Binance Alpha",
      strength: 0.74,
      urgency: "high",
      satisfiedRules: 2,
      totalRules: 3,
      missingRule: "OI 24h 增幅 > 20%",
      gapText: "当前 +13%，距离阈值还差 7%",
      preview: "价格和主题联动已经满足，但衍生品热度还没完全跟上，适合作为埋伏观察位。",
    },
    {
      id: "upcoming_bilion",
      symbol: "BILIon",
      name: "Bilibili (Ondo)",
      signalType: "theme_breakout",
      theme: "RWA",
      exchange: "OKX",
      strength: 0.62,
      urgency: "medium",
      satisfiedRules: 2,
      totalRules: 4,
      missingRule: "成交量 > $30K",
      gapText: "当前 $15.2K，距离阈值还差 $14.8K",
      preview: "主题强度已经在线，但成交量与深度都偏弱，只有放量后才更值得升级到活跃信号。",
    },
    {
      id: "upcoming_up",
      symbol: "UP",
      name: "Superform",
      signalType: "oi_shift",
      theme: "DeFi",
      exchange: "Gate",
      strength: 0.57,
      urgency: "medium",
      satisfiedRules: 1,
      totalRules: 3,
      missingRule: "资金费率转正",
      gapText: "当前 -0.01%，距离阈值还差 0.02%",
      preview: "若资金费率翻正且盘口继续增厚，可能从埋伏状态切到正式信号。",
    },
    {
      id: "upcoming_kite",
      symbol: "KITE",
      name: "Kite",
      signalType: "depth_rebuild",
      theme: "Meme",
      exchange: "Binance Alpha",
      strength: 0.68,
      urgency: "high",
      satisfiedRules: 3,
      totalRules: 4,
      missingRule: "买盘深度恢复到 7 日均值",
      gapText: "当前低于均值 11%，距离阈值还差 11%",
      preview: "只差最后一条深度恢复规则，若临近活动窗口修复完成，容易快速切入活跃池。",
      watched: true,
    },
  ];

  const [activeTab, setActiveTab] = useState<SignalTab>("all");
  const [sortMode, setSortMode] = useState<SortMode>("time");
  const [tokenQuery, setTokenQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [watchedIds, setWatchedIds] = useState<string[]>(
    [
      ...activeSignals.filter(item => item.watched).map(item => item.id),
      ...upcomingSignals.filter(item => item.watched).map(item => item.id),
    ]
  );

  const typeOptions = useMemo(
    () => Array.from(new Set([...activeSignals.map(item => item.signalType), ...upcomingSignals.map(item => item.signalType)])),
    [activeSignals, upcomingSignals]
  );

  const filterBase = <T extends { symbol: string; signalType: string; theme: string; exchange: string }>(items: T[]) =>
    items.filter(item => {
      const keyword = tokenQuery.trim().toLowerCase();
      if (
        keyword &&
        !item.symbol.toLowerCase().includes(keyword) &&
        !("name" in item && typeof item.name === "string" && item.name.toLowerCase().includes(keyword))
      ) {
        return false;
      }
      if (selectedType !== "all" && item.signalType !== selectedType) return false;
      return true;
    });

  const filteredActiveSignals = useMemo(() => {
    const items = filterBase(activeSignals).filter(item =>
      activeTab === "watching" ? watchedIds.includes(item.id) : true
    );

    return [...items].sort((a, b) => {
      if (sortMode === "strength") return b.strength - a.strength;
      if (sortMode === "urgency") return sortWeight(b.urgency) - sortWeight(a.urgency);
      return a.ageHours - b.ageHours;
    });
  }, [activeTab, sortMode, tokenQuery, selectedType, watchedIds]);

  const filteredUpcomingSignals = useMemo(() => {
    const items = filterBase(upcomingSignals).filter(item =>
      activeTab === "watching" ? watchedIds.includes(item.id) : true
    );

    return [...items].sort((a, b) => {
      if (sortMode === "strength") return b.strength - a.strength;
      if (sortMode === "urgency") return sortWeight(b.urgency) - sortWeight(a.urgency);
      return b.satisfiedRules / b.totalRules - a.satisfiedRules / a.totalRules;
    });
  }, [activeTab, sortMode, tokenQuery, selectedType, watchedIds]);

  const activeCount = activeSignals.length;
  const upcomingCount = upcomingSignals.length;

  return (
    <div className="space-y-6">
      <section className="rounded-[26px] border border-white/75 bg-white/72 px-5 py-3 shadow-[0_10px_28px_rgba(90,112,153,0.06)]">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[#475467]">
          <div className="inline-flex items-center gap-2 font-medium text-[oklch(var(--crypto-ink))]">
            <Clock3 className="h-4 w-4" />
            11:20
          </div>
          <div>活跃信号 {activeCount}</div>
          <div>即将触发 {upcomingCount}</div>
          <div>最后更新时间 {dashboard.headline.refreshedAt}</div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="inline-flex rounded-[22px] border border-white/80 bg-white/80 p-1 shadow-[0_10px_28px_rgba(90,112,153,0.06)]">
              {([
                ["all", "全部信号", activeCount],
                ["watching", "关注中", watchedIds.length],
                ["upcoming", "即将触发", upcomingCount],
              ] as Array<[SignalTab, string, number]>).map(([value, label, count]) => (
                <button
                  key={value}
                  onClick={() => setActiveTab(value)}
                  className={cn(
                    "rounded-[18px] px-4 py-2.5 text-sm font-medium transition",
                    activeTab === value ? "bg-[#101828] text-white" : "text-[#475467]"
                  )}
                >
                  {label} ({count})
                </button>
              ))}
            </div>
          </div>

          <Card className="rounded-[28px] border border-white/80 bg-white/88 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[240px] flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a2b3]" />
                  <input
                    value={tokenQuery}
                    onChange={event => setTokenQuery(event.target.value)}
                    placeholder="按照代币名称或 Symbol 搜索"
                    className="h-11 w-full rounded-full border border-[#d8e0eb] bg-white pl-11 pr-4 text-sm text-[#344054] outline-none transition focus:border-[#0f66d8]"
                  />
                </div>
                <select
                  value={selectedType}
                  onChange={event => setSelectedType(event.target.value)}
                  className="h-11 rounded-full border border-[#d8e0eb] bg-white px-4 text-sm text-[#344054]"
                >
                  <option value="all">全部信号类型</option>
                  {typeOptions.map(item => (
                    <option key={item} value={item}>
                      {signalTypeLabel(item)}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {activeTab === "upcoming" ? (
              filteredUpcomingSignals.map(signal => {
                const watched = watchedIds.includes(signal.id);
                return (
                  <Card key={signal.id} className="rounded-[28px] border border-white/80 bg-white/90 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
                    <CardContent className="p-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-[1.75rem] font-semibold text-[oklch(var(--crypto-ink))]">{signal.symbol}</div>
                            <div className="text-base text-muted-foreground">{signal.name}</div>
                            <Badge className="rounded-full bg-[oklch(var(--crypto-panel-soft))] px-3 py-1 text-[#344054] hover:bg-[oklch(var(--crypto-panel-soft))]">
                              {signalTypeLabel(signal.signalType)}
                            </Badge>
                          </div>
                          <div className="mt-3 text-sm text-[#475467]">
                            已满足 {signal.satisfiedRules}/{signal.totalRules} 条规则
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="rounded-full bg-[#edf3ff] px-3 py-1 text-[#175cd3] hover:bg-[#edf3ff]">
                            强度 {(signal.strength * 100).toFixed(0)}%
                          </Badge>
                          <Badge className={cn("rounded-full px-3 py-1 capitalize hover:opacity-100", urgencyTone(signal.urgency))}>
                            {signal.urgency}
                          </Badge>
                        </div>
                      </div>

                      <p className="mt-5 text-[15px] leading-7 text-[oklch(var(--crypto-ink))]">{signal.preview}</p>

                      <div className="mt-5 rounded-[22px] border border-[#e7edf4] bg-[#f8fafc] p-4">
                        <div className="text-sm font-medium text-[oklch(var(--crypto-ink))]">还差哪一条规则</div>
                        <div className="mt-2 text-sm text-[#344054]">{signal.missingRule}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{signal.gapText}</div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-3">
                        <Button
                          variant={watched ? "default" : "secondary"}
                          className={cn("h-10 rounded-full px-4", watched && "bg-[#0f66d8] hover:bg-[#0d59bf]")}
                          onClick={() =>
                            setWatchedIds(prev =>
                              prev.includes(signal.id) ? prev.filter(item => item !== signal.id) : [...prev, signal.id]
                            )
                          }
                        >
                          <Pin className={cn("mr-2 h-4 w-4", watched && "fill-current")} />
                          关注
                        </Button>
                        <Button variant="secondary" className="h-10 rounded-full px-4" onClick={() => setLocation(`/coin/${signal.symbol.toLowerCase()}`)}>
                          <Search className="mr-2 h-4 w-4" />
                          看数据
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              filteredActiveSignals.map(signal => (
                <SignalCard
                  key={signal.id}
                  signal={signal}
                  watched={watchedIds.includes(signal.id)}
                  onToggleWatch={() =>
                    setWatchedIds(prev =>
                      prev.includes(signal.id) ? prev.filter(item => item !== signal.id) : [...prev, signal.id]
                    )
                  }
                  onViewData={() => setLocation(`/coin/${signal.symbol.toLowerCase()}`)}
                />
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
