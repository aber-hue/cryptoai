import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import CoinDetail from "./pages/CoinDetail";
import ExchangeDepth from "./pages/ExchangeDepth";
import ExchangeStrategy from "./pages/ExchangeStrategy";
import DataAnalysis from "./pages/DataAnalysis";
import StrategyTemplateDetail from "./pages/StrategyTemplateDetail";
import OnChainBoard from "./pages/OnChainBoard";
import CexFlowDetail from "./pages/CexFlowDetail";
import DataManagement from "./pages/DataManagement";
import ComponentShowcase from "./pages/ComponentShowcase";
import Navbar from "./components/Navbar";
import Workbench from "./pages/Workbench";

// Pages that need full viewport width (no container max-width constraint)
const FULL_WIDTH_ROUTES = ["/chat"];

function Router() {
  const [location] = useLocation();
  const isFullWidth = FULL_WIDTH_ROUTES.some(route => location.startsWith(route));

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(183,211,255,0.45),transparent_30%),radial-gradient(circle_at_top_right,rgba(182,241,224,0.28),transparent_24%),linear-gradient(180deg,#f4f7fb_0%,#eef3f8_100%)]">
      <Navbar />
      <div className={isFullWidth ? "overflow-x-hidden px-4 lg:px-6" : "container"}>
        <main className="min-w-0 py-6 lg:py-8">
          <Switch>
            <Route path={"/"} component={DataManagement} />
            <Route path={"/market"} component={DataManagement} />
            <Route path={"/signals"} component={Home} />
            <Route path={"/coin/:coinId"} component={CoinDetail} />
            <Route path={"/depth/:exchangeId/:coinId"} component={ExchangeDepth} />
            <Route path={"/depth/:exchangeId"} component={ExchangeDepth} />
            <Route path={"/positions/:exchangeId/:coinId"} component={ExchangeStrategy} />
            <Route path={"/analysis"} component={DataAnalysis} />
            <Route path={"/analysis/:strategyId"} component={StrategyTemplateDetail} />
            <Route path={"/onchain"} component={OnChainBoard} />
            <Route path={"/onchain/cex-flow/:symbol"} component={CexFlowDetail} />
            <Route path={"/workbench"} component={Workbench} />
            <Route path={"/chat"} component={ComponentShowcase} />
            <Route path={"/404"} component={NotFound} />
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
    </div>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
