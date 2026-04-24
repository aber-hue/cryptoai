import { Link, useLocation } from "wouter";
import {
  Bot,
  BrainCircuit,
  CandlestickChart,
  Radar,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function Sidebar() {
  const [location] = useLocation();

  const workspaces = [
    {
      path: "/",
      label: "Signal Board",
      description: "日常信号、关注名单、Alpha 异动",
      icon: Radar,
    },
    {
      path: "/market",
      label: "Market Board",
      description: "代币、公告和默认数据展示区",
      icon: CandlestickChart,
    },
    {
      path: "/analysis",
      label: "Template Lab",
      description: "模板分析与结果工作台",
      icon: BrainCircuit,
    },
    {
      path: "/chat",
      label: "Free Chat",
      description: "自由追问、思路探索和 AI 对话",
      icon: Bot,
    },
  ];

  return (
    <aside className="sticky top-[73px] hidden h-[calc(100vh-73px)] w-72 shrink-0 border-r border-white/60 bg-white/55 backdrop-blur-xl lg:block">
      <div className="flex h-full flex-col px-5 py-6">
        <div>
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Workspaces
          </div>
          <div className="space-y-2">
            {workspaces.map((item) => {
              const Icon = item.icon;
              const isActive = item.path === "/analysis" ? location === item.path || location.startsWith("/analysis/") : location === item.path;

              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={cn(
                    "block rounded-[24px] border px-4 py-4 transition-all",
                    isActive
                      ? "border-transparent bg-[linear-gradient(135deg,rgba(39,86,191,0.97),rgba(36,154,138,0.94))] text-white shadow-[0_18px_42px_rgba(49,102,187,0.32)]"
                      : "border-white/70 bg-white/65 text-[oklch(var(--crypto-ink))] hover:border-white hover:bg-white"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl",
                        isActive ? "bg-white/16" : "bg-[oklch(var(--crypto-panel-soft))]"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold">{item.label}</div>
                      <div className={cn("mt-1 text-sm leading-6", isActive ? "text-white/78" : "text-muted-foreground")}>
                        {item.description}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
