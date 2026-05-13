import { Link } from "wouter";
import { APP_TITLE } from "@/const";
import {
  Activity,
  Bot,
  BrainCircuit,
  CandlestickChart,
  Coins,
  ClipboardList,
  Radar,
} from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

export default function Navbar() {
  const [location] = useLocation();
  const workspaces = [
    { href: "/workbench", label: "工作台", icon: ClipboardList },
    { href: "/market", label: "Market Board", icon: CandlestickChart },
    { href: "/onchain", label: "On-chain Board", icon: Activity },
    { href: "/signals", label: "Signal Board", icon: Radar },
    { href: "/analysis", label: "Template Lab", icon: BrainCircuit },
    { href: "/chat", label: "Free Chat", icon: Bot },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/60 bg-background/80 backdrop-blur-xl">
      <div className="container flex min-h-18 flex-wrap items-center gap-3 py-3">
        <Link href="/market" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70 bg-[radial-gradient(circle_at_top,#fff_0%,#dfe7ff_44%,#bfd0ff_100%)] shadow-[0_12px_30px_rgba(69,97,197,0.16)]">
            <Coins className="h-5 w-5 text-[oklch(var(--crypto-ink))]" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold tracking-[0.18em] text-[11px] uppercase text-muted-foreground">
              Internal Console
            </div>
            <span className="block truncate font-semibold text-xl text-[oklch(var(--crypto-ink))]">
              {APP_TITLE}
            </span>
          </div>
        </Link>
        <div className="order-3 flex w-full gap-2 overflow-x-auto pb-1 md:order-2 md:w-auto md:flex-1 md:justify-center md:pb-0">
          {workspaces.map(item => {
            const Icon = item.icon;
            const active =
              item.href === "/market"
                ? location === "/market" ||
                  location === "/" ||
                  location.startsWith("/coin/") ||
                  location.startsWith("/depth/") ||
                  location.startsWith("/positions/")
                : item.href === "/analysis"
                  ? location === "/analysis" || location.startsWith("/analysis/")
                : location === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all",
                  active
                    ? "border-transparent bg-[linear-gradient(135deg,rgba(39,86,191,0.97),rgba(36,154,138,0.94))] text-white shadow-[0_12px_24px_rgba(49,102,187,0.22)]"
                    : "border-white/70 bg-white/80 text-[oklch(var(--crypto-ink))] hover:bg-white"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
