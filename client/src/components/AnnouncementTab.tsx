import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Bell, 
  Clock, 
  ExternalLink, 
  Copy, 
  Check, 
  TrendingUp, 
  Gift, 
  Target, 
  AlertTriangle,
  Zap,
  Users,
  DollarSign,
  Percent,
  ChevronRight
} from "lucide-react";

// 模拟公告数据类型
interface ListingAnnouncement {
  id: string;
  exchange: string;
  exchangeLogo: string;
  tokenSymbol: string;
  tokenName: string;
  tokenLogo: string;
  tags: string[];
  depositOpenTime: Date;
  tradingOpenTime: Date;
  tradingPairs: string[];
  projectDescription: string;
  contractAddresses: { chain: string; address: string }[];
  originalContent: string;
  publishTime: Date;
}

interface EventAnnouncement {
  id: string;
  exchange: string;
  exchangeLogo: string;
  title: string;
  eventType: string;
  rewardToken: string;
  rewardAmount: string;
  estimatedValue: string;
  dilutionRatio: string;
  coreObjective: string;
  participationThreshold: string;
  aprEstimate: string;
  operationSteps: string[];
  riskWarnings: string[];
  startTime: Date;
  endTime: Date;
  originalContent: string;
  publishTime: Date;
}

// 模拟交易所数据
const EXCHANGE_LOGOS: Record<string, string> = {
  'Binance': 'https://cryptologos.cc/logos/binance-coin-bnb-logo.png',
  'OKX': 'https://cryptologos.cc/logos/okb-okb-logo.png',
  'Bybit': 'https://cryptologos.cc/logos/bybit-bit-logo.png',
  'Bitget': 'https://cryptologos.cc/logos/bitget-token-bgb-logo.png',
  'Gate': 'https://cryptologos.cc/logos/gatetoken-gt-logo.png',
  'Kucoin': 'https://cryptologos.cc/logos/kucoin-token-kcs-logo.png',
  'Coinbase': 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
  'Upbit': 'https://cryptologos.cc/logos/bitcoin-btc-logo.png',
};

// 生成模拟上币公告数据
const generateListingAnnouncements = (): ListingAnnouncement[] => {
  const exchanges = ['Binance', 'OKX', 'Bybit', 'Bitget', 'Gate', 'Kucoin', 'Coinbase', 'Upbit'];
  const tokens = [
    { symbol: 'STRK', name: 'Starknet', logo: 'https://cryptologos.cc/logos/starknet-token-strk-logo.png' },
    { symbol: 'JUP', name: 'Jupiter', logo: 'https://cryptologos.cc/logos/jupiter-jup-logo.png' },
    { symbol: 'PYTH', name: 'Pyth Network', logo: 'https://cryptologos.cc/logos/pyth-network-pyth-logo.png' },
    { symbol: 'WIF', name: 'dogwifhat', logo: 'https://cryptologos.cc/logos/dogwifhat-wif-logo.png' },
    { symbol: 'ONDO', name: 'Ondo Finance', logo: 'https://cryptologos.cc/logos/ondo-ondo-logo.png' },
    { symbol: 'ENA', name: 'Ethena', logo: 'https://cryptologos.cc/logos/ethena-ena-logo.png' },
  ];
  const tags = ['New Listing', 'Seed Tag', 'Monitoring Tag', 'Innovation Zone'];

  const announcements: ListingAnnouncement[] = [];
  const now = new Date();

  for (let i = 0; i < 15; i++) {
    const exchange = exchanges[Math.floor(Math.random() * exchanges.length)];
    const token = tokens[Math.floor(Math.random() * tokens.length)];
    const hoursAgo = Math.floor(Math.random() * 72);
    const publishTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
    const depositOpenTime = new Date(publishTime.getTime() + 2 * 60 * 60 * 1000);
    const tradingOpenTime = new Date(publishTime.getTime() + 4 * 60 * 60 * 1000);

    announcements.push({
      id: `listing-${i}`,
      exchange,
      exchangeLogo: EXCHANGE_LOGOS[exchange] || '',
      tokenSymbol: token.symbol,
      tokenName: token.name,
      tokenLogo: token.logo,
      tags: [tags[Math.floor(Math.random() * tags.length)]],
      depositOpenTime,
      tradingOpenTime,
      tradingPairs: [`${token.symbol}/USDT`, `${token.symbol}/BTC`],
      projectDescription: `${token.name} is a cutting-edge blockchain project focused on scalability and security. It aims to revolutionize the DeFi ecosystem with innovative solutions.`,
      contractAddresses: [
        { chain: 'Ethereum', address: '0x1234...5678' },
        { chain: 'Solana', address: 'ABC...XYZ' },
      ],
      originalContent: `We are excited to announce the listing of ${token.symbol} (${token.name}) on ${exchange}. Deposits will open at ${depositOpenTime.toISOString()} and trading will commence at ${tradingOpenTime.toISOString()}.`,
      publishTime,
    });
  }

  return announcements.sort((a, b) => b.publishTime.getTime() - a.publishTime.getTime());
};

// 生成模拟活动公告数据
const generateEventAnnouncements = (): EventAnnouncement[] => {
  const exchanges = ['Binance', 'OKX', 'Bybit', 'Bitget', 'Gate', 'Kucoin'];
  const eventTypes = ['Launchpool', 'Airdrop', 'Trading Competition', 'Staking', 'Learn & Earn'];
  const tokens = ['BNB', 'ETH', 'SOL', 'AVAX', 'MATIC', 'ARB'];

  const announcements: EventAnnouncement[] = [];
  const now = new Date();

  for (let i = 0; i < 12; i++) {
    const exchange = exchanges[Math.floor(Math.random() * exchanges.length)];
    const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    const rewardToken = tokens[Math.floor(Math.random() * tokens.length)];
    const hoursAgo = Math.floor(Math.random() * 48);
    const publishTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
    const startTime = new Date(publishTime.getTime() + 24 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 7 * 24 * 60 * 60 * 1000);
    const rewardAmount = (Math.floor(Math.random() * 10) + 1) * 100000;
    const estimatedValue = rewardAmount * (Math.random() * 10 + 1);

    announcements.push({
      id: `event-${i}`,
      exchange,
      exchangeLogo: EXCHANGE_LOGOS[exchange] || '',
      title: `${exchange} ${eventType}: Earn ${rewardToken}`,
      eventType,
      rewardToken,
      rewardAmount: `${rewardAmount.toLocaleString()} ${rewardToken}`,
      estimatedValue: `$${estimatedValue.toLocaleString()}`,
      dilutionRatio: `${(Math.random() * 2).toFixed(2)}%`,
      coreObjective: eventType === 'Launchpool' 
        ? `通过质押 ${rewardToken} 赚取新币` 
        : eventType === 'Trading Competition'
        ? '鼓励用户充值并交易指定币种'
        : eventType === 'Airdrop'
        ? '奖励早期用户和活跃交易者'
        : '参与学习并获得奖励',
      participationThreshold: eventType === 'Launchpool'
        ? '需持仓 100 USDT 以上'
        : eventType === 'Trading Competition'
        ? '需 KYC，交易量达 1000 USDT'
        : '仅限前 10000 名用户',
      aprEstimate: `${(Math.random() * 50 + 10).toFixed(1)}%`,
      operationSteps: [
        '1. 登录交易所账户并完成 KYC',
        '2. 将资产转入活动账户',
        '3. 点击参与活动按钮',
        '4. 等待活动结束后领取奖励',
      ],
      riskWarnings: [
        '代币价格可能波动，请谨慎参与',
        '部分地区用户可能无法参与',
        '奖励可能有锁定期',
      ],
      startTime,
      endTime,
      originalContent: `Join our ${eventType} event and earn ${rewardToken}! Total rewards: ${rewardAmount.toLocaleString()} ${rewardToken}.`,
      publishTime,
    });
  }

  return announcements.sort((a, b) => b.publishTime.getTime() - a.publishTime.getTime());
};

// 格式化时间差
const formatTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  return `${diffDays}天前`;
};

// 格式化具体日期时间
const formatDateTime = (date: Date): string => {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
};

// 格式化倒计时或具体时间
const formatCountdown = (date: Date): string => {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  
  // 如果时间已过，显示具体日期时间
  if (diffMs <= 0) {
    return formatDateTime(date);
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffHours > 24) {
    const days = Math.floor(diffHours / 24);
    return `${days}天${diffHours % 24}小时后`;
  }
  return `${diffHours}小时${diffMins}分钟后`;
};

// 上币公告卡片组件
function ListingCard({ announcement, onClick }: { announcement: ListingAnnouncement; onClick: () => void }) {
  return (
    <Card className="glass hover:border-[oklch(var(--crypto-blue))] transition-all cursor-pointer" onClick={onClick}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <img src={announcement.exchangeLogo} alt={announcement.exchange} className="w-6 h-6 rounded-full" />
            <img src={announcement.tokenLogo} alt={announcement.tokenSymbol} className="w-6 h-6 rounded-full" />
          </div>
          <div className="flex gap-1">
            {announcement.tags.map((tag, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        <CardTitle className="text-lg">{announcement.tokenSymbol}</CardTitle>
        <CardDescription>{announcement.tokenName}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">充值开启</div>
            <div className="font-medium">{formatCountdown(announcement.depositOpenTime)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">交易开启</div>
            <div className="font-medium text-[oklch(var(--crypto-green))]">
              {formatCountdown(announcement.tradingOpenTime)}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {announcement.tradingPairs.map((pair, idx) => (
            <Badge key={idx} variant="outline" className="text-xs">
              {pair}
            </Badge>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{announcement.exchange}</span>
          <span>{formatTimeAgo(announcement.publishTime)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// 活动公告卡片组件
function EventCard({ announcement, onClick }: { announcement: EventAnnouncement; onClick: () => void }) {
  return (
    <Card className="glass hover:border-[oklch(var(--crypto-purple))] transition-all cursor-pointer" onClick={onClick}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <img src={announcement.exchangeLogo} alt={announcement.exchange} className="w-6 h-6 rounded-full" />
            <Badge variant="default" className="text-xs">
              {announcement.eventType}
            </Badge>
          </div>
          <Badge variant="outline" className="text-xs text-[oklch(var(--crypto-green))]">
            APR {announcement.aprEstimate}
          </Badge>
        </div>
        <CardTitle className="text-base line-clamp-1">{announcement.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1">
            <Gift className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">奖励</span>
          </div>
          <div className="font-medium text-right text-sm">{announcement.rewardAmount}</div>
          
          <div className="flex items-center gap-1">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">预计价值</span>
          </div>
          <div className="font-medium text-right text-sm text-[oklch(var(--crypto-green))]">
            {announcement.estimatedValue}
          </div>
          
          <div className="flex items-center gap-1">
            <Percent className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">稀释比例</span>
          </div>
          <div className="font-medium text-right text-sm">{announcement.dilutionRatio}</div>
        </div>
        
        <div className="p-2 bg-muted/50 rounded-md">
          <div className="flex items-center gap-1 mb-1">
            <Target className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">核心目标</span>
          </div>
          <p className="text-xs">{announcement.coreObjective}</p>
        </div>
        
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{announcement.exchange}</span>
          <span>{formatTimeAgo(announcement.publishTime)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// 上币详情弹窗
function ListingDetailDialog({ 
  announcement, 
  open, 
  onOpenChange 
}: { 
  announcement: ListingAnnouncement | null; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  if (!announcement) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <img src={announcement.tokenLogo} alt={announcement.tokenSymbol} className="w-10 h-10 rounded-full" />
            <div>
              <DialogTitle className="text-xl">{announcement.tokenSymbol}</DialogTitle>
              <DialogDescription>{announcement.tokenName}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* 项目简介 */}
          <div>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <Zap className="h-4 w-4" />
              项目简介
            </h4>
            <p className="text-sm text-muted-foreground">{announcement.projectDescription}</p>
          </div>

          {/* 合约地址 */}
          <div>
            <h4 className="font-semibold mb-2">合约地址</h4>
            <div className="space-y-2">
              {announcement.contractAddresses.map((contract, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                  <div>
                    <span className="text-xs text-muted-foreground">{contract.chain}</span>
                    <div className="font-mono text-sm">{contract.address}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyAddress(contract.address)}
                  >
                    {copiedAddress === contract.address ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* 时间轴 */}
          <div>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              时间轴
            </h4>
            <div className="relative pl-4 border-l-2 border-muted space-y-4">
              <div className="relative">
                <div className="absolute -left-[21px] w-4 h-4 rounded-full bg-yellow-500" />
                <div className="text-sm font-medium">充值开启</div>
                <div className="text-xs text-muted-foreground">
                  {announcement.depositOpenTime.toLocaleString()}
                </div>
              </div>
              <div className="relative">
                <div className="absolute -left-[21px] w-4 h-4 rounded-full bg-green-500" />
                <div className="text-sm font-medium">交易开启</div>
                <div className="text-xs text-muted-foreground">
                  {announcement.tradingOpenTime.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {/* 原文内容 */}
          <div>
            <h4 className="font-semibold mb-2">公告原文</h4>
            <div className="p-3 bg-muted/50 rounded-md text-sm">
              {announcement.originalContent}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 活动详情弹窗
function EventDetailDialog({ 
  announcement, 
  open, 
  onOpenChange 
}: { 
  announcement: EventAnnouncement | null; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  if (!announcement) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <img src={announcement.exchangeLogo} alt={announcement.exchange} className="w-10 h-10 rounded-full" />
            <div>
              <DialogTitle className="text-xl">{announcement.title}</DialogTitle>
              <DialogDescription>{announcement.exchange} • {announcement.eventType}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* AI 分析摘要 */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Gift className="h-4 w-4 text-[oklch(var(--crypto-blue))]" />
                  <span className="text-sm font-medium">奖励代币</span>
                </div>
                <div className="text-lg font-bold">{announcement.rewardToken}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-[oklch(var(--crypto-green))]" />
                  <span className="text-sm font-medium">预计价值</span>
                </div>
                <div className="text-lg font-bold text-[oklch(var(--crypto-green))]">{announcement.estimatedValue}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-[oklch(var(--crypto-purple))]" />
                  <span className="text-sm font-medium">预估 APR</span>
                </div>
                <div className="text-lg font-bold text-[oklch(var(--crypto-purple))]">{announcement.aprEstimate}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">参与门槛</span>
                </div>
                <div className="text-sm">{announcement.participationThreshold}</div>
              </CardContent>
            </Card>
          </div>

          {/* 操作步骤 */}
          <div>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <ChevronRight className="h-4 w-4" />
              操作步骤
            </h4>
            <div className="space-y-2">
              {announcement.operationSteps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-2 p-2 bg-muted/50 rounded-md">
                  <span className="text-sm">{step}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 风险提示 */}
          <div>
            <h4 className="font-semibold mb-2 flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="h-4 w-4" />
              风险提示
            </h4>
            <div className="space-y-2">
              {announcement.riskWarnings.map((warning, idx) => (
                <div key={idx} className="flex items-start gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-md text-sm">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 原文内容 */}
          <div>
            <h4 className="font-semibold mb-2">公告原文</h4>
            <div className="p-3 bg-muted/50 rounded-md text-sm">
              {announcement.originalContent}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 主组件
export default function AnnouncementTab() {
  const [activeTab, setActiveTab] = useState<'listing' | 'events'>('listing');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [selectedExchange, setSelectedExchange] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedListing, setSelectedListing] = useState<ListingAnnouncement | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventAnnouncement | null>(null);
  const [listingDialogOpen, setListingDialogOpen] = useState(false);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);

  // 生成模拟数据
  const listingAnnouncements = useMemo(() => generateListingAnnouncements(), []);
  const eventAnnouncements = useMemo(() => generateEventAnnouncements(), []);

  // 过滤后的公告
  const filteredListings = useMemo(() => {
    return listingAnnouncements.filter(a => {
      if (selectedExchange !== 'all' && a.exchange !== selectedExchange) return false;
      if (searchQuery && !a.tokenSymbol.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !a.tokenName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [listingAnnouncements, selectedExchange, searchQuery]);

  const filteredEvents = useMemo(() => {
    return eventAnnouncements.filter(a => {
      if (selectedExchange !== 'all' && a.exchange !== selectedExchange) return false;
      if (searchQuery && !a.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [eventAnnouncements, selectedExchange, searchQuery]);

  // 最近1小时的公告（用于滚动条）
  const recentAnnouncements = useMemo(() => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const listings = listingAnnouncements
      .filter(a => a.publishTime > oneHourAgo)
      .map(a => ({ type: 'listing' as const, title: `${a.exchange} 上线 ${a.tokenSymbol}`, time: a.publishTime }));
    const events = eventAnnouncements
      .filter(a => a.publishTime > oneHourAgo)
      .map(a => ({ type: 'event' as const, title: a.title, time: a.publishTime }));
    return [...listings, ...events].sort((a, b) => b.time.getTime() - a.time.getTime());
  }, [listingAnnouncements, eventAnnouncements]);

  const exchanges = ['Binance', 'OKX', 'Bybit', 'Bitget', 'Gate', 'Kucoin', 'Coinbase', 'Upbit'];

  return (
    <div className="space-y-4">
      {/* 实时滚动条 */}
      {recentAnnouncements.length > 0 && (
        <Card className="glass overflow-hidden">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-[oklch(var(--crypto-blue))] flex-shrink-0" />
              <div className="overflow-hidden whitespace-nowrap">
                <div className="inline-flex animate-marquee">
                  {recentAnnouncements.map((a, idx) => (
                    <span key={idx} className="mx-4 text-sm">
                      <Badge variant={a.type === 'listing' ? 'default' : 'secondary'} className="mr-2 text-xs">
                        {a.type === 'listing' ? '上币' : '活动'}
                      </Badge>
                      {a.title}
                      <span className="text-muted-foreground ml-2">{formatTimeAgo(a.time)}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 筛选区域 */}
      <Card className="glass">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="搜索代币或活动..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
            <Select value={selectedExchange} onValueChange={setSelectedExchange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="选择交易所" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部交易所</SelectItem>
                {exchanges.map(ex => (
                  <SelectItem key={ex} value={ex}>{ex}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'card' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('card')}
              >
                卡片视图
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                列表视图
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 公告类型切换 */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'listing' | 'events')}>
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="listing" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            上币监控 ({filteredListings.length})
          </TabsTrigger>
          <TabsTrigger value="events" className="flex items-center gap-2">
            <Gift className="h-4 w-4" />
            活动发现 ({filteredEvents.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="listing" className="mt-4">
          {viewMode === 'card' ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredListings.map(announcement => (
                <ListingCard
                  key={announcement.id}
                  announcement={announcement}
                  onClick={() => {
                    setSelectedListing(announcement);
                    setListingDialogOpen(true);
                  }}
                />
              ))}
            </div>
          ) : (
            <Card className="glass">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">交易所</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">代币</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">标签</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">充值开启</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">交易开启</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">交易对</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredListings.map(announcement => (
                        <tr key={announcement.id} className="border-b hover:bg-muted/50 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <img src={announcement.exchangeLogo} alt={announcement.exchange} className="w-6 h-6 rounded-full" />
                              <span className="font-medium">{announcement.exchange}</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <img src={announcement.tokenLogo} alt={announcement.tokenSymbol} className="w-6 h-6 rounded-full" />
                              <div>
                                <div className="font-bold">{announcement.tokenSymbol}</div>
                                <div className="text-xs text-muted-foreground">{announcement.tokenName}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex flex-wrap gap-1">
                              {announcement.tags.map((tag, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">{tag}</Badge>
                              ))}
                            </div>
                          </td>
                          <td className="p-4 text-sm">
                            {announcement.depositOpenTime.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="p-4 text-sm">
                            {announcement.tradingOpenTime.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="p-4">
                            <div className="flex flex-wrap gap-1">
                              {announcement.tradingPairs.map((pair, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">{pair}</Badge>
                              ))}
                            </div>
                          </td>
                          <td className="p-4">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedListing(announcement);
                                setListingDialogOpen(true);
                              }}
                            >
                              查看详情
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          {filteredListings.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              暂无符合条件的上币公告
            </div>
          )}
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          {viewMode === 'card' ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredEvents.map(announcement => (
                <EventCard
                  key={announcement.id}
                  announcement={announcement}
                  onClick={() => {
                    setSelectedEvent(announcement);
                    setEventDialogOpen(true);
                  }}
                />
              ))}
            </div>
          ) : (
            <Card className="glass">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">交易所</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">活动标题</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">活动类型</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">奖励代币</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">奖励总量</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">预计价值</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">APR</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEvents.map(announcement => (
                        <tr key={announcement.id} className="border-b hover:bg-muted/50 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <img src={announcement.exchangeLogo} alt={announcement.exchange} className="w-6 h-6 rounded-full" />
                              <span className="font-medium">{announcement.exchange}</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="max-w-[300px] truncate font-medium">{announcement.title}</div>
                          </td>
                          <td className="p-4">
                            <Badge variant="secondary">{announcement.eventType}</Badge>
                          </td>
                          <td className="p-4 font-medium">{announcement.rewardToken}</td>
                          <td className="p-4 text-sm">{announcement.rewardAmount}</td>
                          <td className="p-4 text-sm font-medium text-green-600">{announcement.estimatedValue}</td>
                          <td className="p-4 text-sm font-medium text-blue-600">{announcement.aprEstimate}</td>
                          <td className="p-4">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedEvent(announcement);
                                setEventDialogOpen(true);
                              }}
                            >
                              查看详情
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          {filteredEvents.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              暂无符合条件的活动公告
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* 详情弹窗 */}
      <ListingDetailDialog
        announcement={selectedListing}
        open={listingDialogOpen}
        onOpenChange={setListingDialogOpen}
      />
      <EventDetailDialog
        announcement={selectedEvent}
        open={eventDialogOpen}
        onOpenChange={setEventDialogOpen}
      />
    </div>
  );
}
