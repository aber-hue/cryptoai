import { analysisWorkspaceMockData, dashboardMockData } from "./mock-data";
import type {
  AnalysisWorkspaceViewModel,
  DashboardViewModel,
  FreeChatWorkspaceViewModel,
  MarketWorkspaceViewModel,
} from "./types";
import { freeChatWorkspaceMockData, marketWorkspaceMockData } from "./mock-data";

export interface CryptoAiDataSource {
  getDashboard(): DashboardViewModel;
  getAnalysisWorkspace(): AnalysisWorkspaceViewModel;
  getMarketWorkspace(): MarketWorkspaceViewModel;
  getFreeChatWorkspace(): FreeChatWorkspaceViewModel;
}

export const mockCryptoAiDataSource: CryptoAiDataSource = {
  getDashboard() {
    return dashboardMockData;
  },
  getAnalysisWorkspace() {
    return analysisWorkspaceMockData;
  },
  getMarketWorkspace() {
    return marketWorkspaceMockData;
  },
  getFreeChatWorkspace() {
    return freeChatWorkspaceMockData;
  },
};
