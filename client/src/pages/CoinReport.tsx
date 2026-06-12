import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { findTokenReport } from "@/lib/tokenReports";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Download } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useParams } from "wouter";

function AssetLogo({
  src,
  alt,
  fallback,
}: {
  src?: string | null;
  alt: string;
  fallback: string;
}) {
  if (src) {
    return <img src={src} alt={alt} className="h-14 w-14 rounded-2xl border border-[#d8e0eb] bg-white object-cover" />;
  }

  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#dbeafe,#c6f6e5)] text-lg font-semibold text-[#1d4ed8]">
      {fallback}
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(249,251,255,0.88))] shadow-[0_18px_48px_rgba(83,102,138,0.08)]">
      <CardContent className="p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="h-8 w-1.5 rounded-full bg-[linear-gradient(180deg,#244fb8,#28a389)]" />
          <h2 className="text-[1.18rem] font-semibold tracking-[0.01em] text-[oklch(var(--crypto-ink))]">{title}</h2>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function buildDownloadText(report: NonNullable<ReturnType<typeof findTokenReport>>) {
  const lines = [
    `${report.name} (${report.symbol}) 报告`,
    "",
    `Tag：${report.tags.join(" / ")}`,
    "",
    "CEX：",
    ...report.cex.map(item => `- ${item.venue}：${item.status}`),
    "",
    `赛道：${report.sectors.join(" / ")}`,
    "",
    `投资/背书：${report.grade}`,
    report.endorsement,
    "",
    "亮点：",
    ...report.highlights.map(item => `- ${item}`),
    "",
    "公售：",
    ...report.publicSale.map(item => `- ${item.label}：${item.value}`),
    "",
    "Tokenomic：",
    ...report.tokenomicSummary.map(item => `- ${item}`),
    ...report.tokenomics.map(item => `- ${item.category}：${item.allocation}；${item.tge}；${item.notes}`),
    "",
    "TGE+0释放：",
    ...report.tgeBreakdown.flatMap(group => [`- ${group.side}：${group.ratio}`, ...group.items.map(item => `  - ${item}`)]),
    "",
    "链上数据：",
    ...report.chainData.map(item => `- ${item.chain}：${item.amount}，${item.ratio}`),
    "",
    "BSC 链上分配：",
    ...report.bscAllocation.map(item => `- ${item}`),
    "",
    "Pancake LP 设置情况：",
    ...report.lpSetup.map(item => `- ${item}`),
  ];

  return lines.join("\n");
}

export default function CoinReport() {
  const { coinId } = useParams<{ coinId: string }>();
  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const routeTokenId = /^\d+$/.test(coinId ?? "") ? Number(coinId) : undefined;
  const tokenIdentityInput = { symbol: (coinId ?? "").toUpperCase(), tokenId: routeTokenId };
  const tokenProfileQuery = trpc.token.getProfile.useQuery(tokenIdentityInput, {
    enabled: Boolean(coinId),
  });

  const tokenProfile = tokenProfileQuery.data;
  const report = findTokenReport({
    tokenId: tokenProfile?.tokenId ?? routeTokenId,
    symbol: tokenProfile?.symbol ?? coinId,
    name: tokenProfile?.name ?? null,
  });

  const backHref = `/coin/${coinId}${searchParams.get("from") ? `?from=${encodeURIComponent(searchParams.get("from") ?? "")}` : ""}`;

  const downloadReport = () => {
    if (!report) return;
    const content = buildDownloadText(report);
    const blob = new Blob([`\uFEFF${content}`], { type: "text/plain;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${report.symbol.toLowerCase()}-report.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  if (!report) {
    return (
      <div className="space-y-6">
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          返回币种详情
        </Link>
        <Card className="rounded-[28px] border border-white/70 bg-white/78 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
          <CardContent className="p-8 text-center text-muted-foreground">
            当前币种暂无报告内容
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          返回币种详情
        </Link>
        <Button
          type="button"
          onClick={downloadReport}
          className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#244fb8,#28a389)] px-4 py-2 text-white shadow-[0_10px_22px_rgba(36,79,184,0.2)] hover:brightness-105"
        >
          <Download className="h-4 w-4" />
          下载报告
        </Button>
      </div>

      <Card className="rounded-[30px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.9),rgba(245,250,255,0.94))] shadow-[0_18px_50px_rgba(83,102,138,0.1)]">
        <CardContent className="flex flex-col gap-5 p-6">
          <div className="flex items-start gap-4">
            <AssetLogo src={tokenProfile?.logoUrl} alt={report.symbol} fallback={report.symbol.slice(0, 2)} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="page-title text-[oklch(var(--crypto-ink))]">{report.name}</h1>
                <Badge variant="secondary" className="rounded-full bg-white px-3 py-1 text-[#1d4ed8]">
                  {report.symbol}
                </Badge>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">项目研究报告</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {report.tags.map(tag => (
                  <Badge key={tag} className="rounded-full border border-[#d6e4ff] bg-[#eef4ff] px-3 py-1 text-[#244fb8] hover:bg-[#eef4ff]">
                    {tag}
                  </Badge>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {report.sectors.map(sector => (
                  <Badge key={sector} variant="secondary" className="rounded-full border border-[#e4eaf3] bg-white px-3 py-1 text-[#475467]">
                    {sector}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              report.publicSale.find(item => item.label === "价格")?.value,
              report.publicSale.find(item => item.label === "对应 FDV")?.value,
              report.tokenomicSummary[0],
              report.tokenomicSummary[1],
            ].map((value, index) => (
              <div
                key={`${value ?? "na"}-${index}`}
                className="rounded-[22px] border border-white/80 bg-white/80 px-4 py-3 shadow-[0_10px_24px_rgba(83,102,138,0.05)]"
              >
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {index === 0 ? "Sale Price" : index === 1 ? "FDV" : index === 2 ? "Supply" : "Initial Float"}
                </div>
                <div className="mt-2 text-base font-semibold text-[oklch(var(--crypto-ink))]">{value}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <SectionCard title="CEX">
        <div className="grid gap-4 lg:grid-cols-2">
          {report.cex.map(item => (
            <div key={item.venue} className="rounded-[24px] border border-[#dde7f3] bg-[linear-gradient(180deg,#fcfdff,#f6f9fd)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-[#28a389]" />
                <div className="text-base font-semibold text-[oklch(var(--crypto-ink))]">{item.venue}</div>
              </div>
              <div className="mt-3 text-sm leading-7 text-muted-foreground">{item.status}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="投资/背书">
        <div className="space-y-4">
          <Badge className="w-fit rounded-full bg-[linear-gradient(135deg,#244fb8,#28a389)] px-3 py-1 text-white">
            {report.grade}
          </Badge>
          <div className="rounded-[24px] border border-[#dde7f3] bg-[linear-gradient(180deg,#fcfdff,#f6f9fd)] px-5 py-5 text-sm leading-7 text-[oklch(var(--crypto-ink))]">
            {report.endorsement}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="亮点">
        <div className="space-y-3">
          {report.highlights.map((item, index) => (
            <div key={item} className="grid grid-cols-[44px_1fr] gap-4 rounded-[24px] border border-[#dde7f3] bg-[linear-gradient(180deg,#fcfdff,#f6f9fd)] px-4 py-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#244fb8,#28a389)] text-sm font-semibold text-white">
                {index + 1}
              </div>
              <div className="pt-1 text-sm leading-7 text-[oklch(var(--crypto-ink))]">
                {item}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="公售">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {report.publicSale.map(item => (
            <div key={item.label} className="rounded-[24px] border border-[#dde7f3] bg-[linear-gradient(180deg,#fcfdff,#f6f9fd)] p-4">
              <div className="text-sm text-muted-foreground">{item.label}</div>
              <div className="mt-2 text-base font-semibold text-[oklch(var(--crypto-ink))]">{item.value}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Tokenomic">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            {report.tokenomicSummary.map(item => (
              <div key={item} className="rounded-[24px] border border-[#dde7f3] bg-[linear-gradient(180deg,#fcfdff,#f6f9fd)] px-4 py-3 text-sm font-medium text-[oklch(var(--crypto-ink))]">
                {item}
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full overflow-hidden rounded-[24px] text-sm">
              <thead className="border-b border-[#d8e0eb] bg-[#f8fbff] text-left text-[13px] font-semibold text-[oklch(var(--crypto-ink))]">
                <tr>
                  <th className="px-3 py-4">类别</th>
                  <th className="px-3 py-4">分配占比</th>
                  <th className="px-3 py-4">TGE 解锁</th>
                  <th className="px-3 py-4">备注</th>
                </tr>
              </thead>
              <tbody>
                {report.tokenomics.map(item => (
                  <tr key={item.category} className="border-b border-[#e7edf4] align-top bg-white">
                    <td className="px-3 py-4 font-semibold text-[oklch(var(--crypto-ink))]">{item.category}</td>
                    <td className="px-3 py-4 font-mono text-[oklch(var(--crypto-ink))]">{item.allocation}</td>
                    <td className="px-3 py-4 font-mono text-[oklch(var(--crypto-ink))]">{item.tge}</td>
                    <td className="px-3 py-4 text-muted-foreground">{item.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="TGE+0释放">
        <div className="grid gap-4 lg:grid-cols-2">
          {report.tgeBreakdown.map(group => (
            <div key={group.side} className="rounded-[24px] border border-[#dde7f3] bg-[linear-gradient(180deg,#fcfdff,#f6f9fd)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-base font-semibold text-[oklch(var(--crypto-ink))]">{group.side}</div>
                <Badge className="rounded-full bg-[linear-gradient(135deg,#244fb8,#28a389)] px-3 py-1 text-white">
                  {group.ratio}
                </Badge>
              </div>
              <div className="mt-3 space-y-2">
                {group.items.map(item => (
                  <div key={item} className="rounded-2xl bg-white px-3 py-2.5 text-sm leading-6 text-[oklch(var(--crypto-ink))]">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="链上数据">
        <div className="grid gap-3 md:grid-cols-2">
          {report.chainData.map(item => (
            <div key={item.chain} className="rounded-[24px] border border-[#dde7f3] bg-[linear-gradient(180deg,#fcfdff,#f6f9fd)] p-4">
              <div className="text-base font-semibold text-[oklch(var(--crypto-ink))]">{item.chain}</div>
              <div className="mt-2 text-sm text-muted-foreground">{item.amount}</div>
              <div className="mt-1 text-sm font-semibold text-[#1d4ed8]">{item.ratio}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="BSC 链上分配">
        <div className="space-y-2">
          {report.bscAllocation.map(item => (
            <div key={item} className="rounded-[24px] border border-[#dde7f3] bg-[linear-gradient(180deg,#fcfdff,#f6f9fd)] px-4 py-3 text-sm leading-6 text-[oklch(var(--crypto-ink))]">
              {item}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Pancake LP 设置情况">
        <div className="space-y-2">
          {report.lpSetup.map(item => (
            <div key={item} className="rounded-[24px] border border-[#dde7f3] bg-[linear-gradient(180deg,#fcfdff,#f6f9fd)] px-4 py-3 text-sm leading-6 text-[oklch(var(--crypto-ink))]">
              {item}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
