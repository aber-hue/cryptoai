import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { orchestrateChatMessage } from "./chat/orchestrator";
import type { ChatSignalContext } from "./chat/types";
import { runSignalScan } from "./signal/engine";
import * as db from "./db";
import {
  getExchangeDepthViewBySymbol,
  getExchangeHoldersViewBySymbol,
  getOnchainFundFlowBySymbol,
  getOnchainCexFlowTransferDetailsBySymbol,
  getOnchainCexFlowsBySymbol,
  getOnchainHoldersBySymbol,
  getOnchainLargeTransfersBySymbol,
  getOnchainOverviewBySymbol,
  getOnchainPoolAddsByPoolId,
  getOnchainPoolAddsBySymbol,
  getTokenFundingViewBySymbol,
  getTokenSocialHeatViewBySymbol,
  getTokenKlineBySymbol,
  getTokenDepthViewBySymbol,
  getTokenDepthTrendBySymbol,
  getTokenHoldersViewBySymbol,
  getTokenListingViewBySymbol,
  getTokenProfileBySymbol,
  getTokenUnlockViewBySymbol,
  listMarketWatchlist,
  listAvailableOnchainPools,
  listAvailableOnchainTokens,
  listMarketTokens,
  searchListingAnnouncements,
  searchAnnouncements,
  toggleMarketWatchlist,
} from "./liveData";
import {
  getActiveLabels,
  getLabelRun,
  getReviewQueue,
  listLabelDefinitions,
  listLabelRuns,
  reviewLabelProposal,
  startLabelAnalysis,
} from "./labelWorkbench";

export const appRouter = router({
  system: systemRouter,
  labels: router({
    getLabelDictionary: publicProcedure.query(() => {
      return listLabelDefinitions();
    }),
    listRuns: publicProcedure.query(() => {
      return listLabelRuns();
    }),
    getRun: publicProcedure
      .input(z.object({ runId: z.string().trim().min(1) }))
      .query(async ({ input }) => {
        const run = await getLabelRun(input.runId);
        if (!run) {
          throw new Error("Run not found");
        }
        return run;
      }),
    getReviewQueue: publicProcedure
      .input(
        z.object({
          runId: z.string().trim().min(1),
          status: z.enum(["pending", "approved", "rejected"]).default("pending"),
          keyword: z.string().trim().optional(),
        })
      )
      .query(async ({ input }) => {
        const queue = await getReviewQueue(input.runId, input.status, input.keyword);
        if (!queue) {
          throw new Error("Run not found");
        }
        return queue;
      }),
    getActiveLabels: publicProcedure
      .input(
        z.object({
          tokenId: z.number().int(),
          chain: z.string().trim().optional(),
        })
      )
      .query(async ({ input }) => {
        return {
          items: await getActiveLabels(input),
        };
      }),
    startAnalysis: publicProcedure
      .input(
        z.object({
          symbol: z.string().trim().min(1),
          chain: z.string().trim().min(1),
          preWindowDays: z.number().int().min(1).max(60),
          claimWindowDays: z.number().int().min(1).max(60),
          tolerancePct: z.number().min(0).max(5),
        })
      )
      .mutation(async ({ input, ctx }) => {
        return await startLabelAnalysis({
          ...input,
          triggeredBy: ctx.user?.openId ?? "current-user",
        });
      }),
    reviewProposal: publicProcedure
      .input(
        z.object({
          proposalId: z.string().trim().min(1),
          action: z.enum(["approve", "reject"]),
          reviewNote: z.string().trim().optional(),
        })
      )
      .mutation(async ({ input }) => {
        if (input.action === "reject" && !input.reviewNote) {
          throw new Error("Review note is required when rejecting a proposal");
        }
        return await reviewLabelProposal(input);
      }),
  }),
  signal: router({
    listTemplates: publicProcedure
      .input(
        z
          .object({
            category: z.string().trim().min(1).optional(),
            enabledOnly: z.boolean().optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return await db.listSignalTemplates({
          category: input?.category,
          enabledOnly: input?.enabledOnly ?? false,
        });
      }),
    listEvents: publicProcedure
      .input(
        z
          .object({
            symbol: z.string().trim().min(1).optional(),
            signalType: z.string().trim().min(1).optional(),
            category: z.string().trim().min(1).optional(),
            status: z.enum(["new", "active", "muted", "expired"]).optional(),
            limit: z.number().int().min(1).max(200).optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return await db.listSignalEvents(input ?? {});
      }),
    getEvent: publicProcedure
      .input(z.object({ id: z.string().trim().min(1) }))
      .query(async ({ input }) => {
        return await db.getSignalEventById(input.id);
      }),
    updateEventStatus: protectedProcedure
      .input(
        z.object({
          signalEventId: z.string().trim().min(1),
          toStatus: z.enum(["new", "active", "muted", "expired"]),
          actionType: z.enum(["mark_active", "mute", "unmute", "expire", "reopen"]),
          note: z.string().trim().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const current = await db.getSignalEventById(input.signalEventId);
        if (!current) {
          throw new Error("Signal event not found");
        }

        await db.updateSignalEventStatus({
          signalEventId: input.signalEventId,
          fromStatus: current.event.status,
          toStatus: input.toStatus,
          actionType: input.actionType,
          operatorOpenId: ctx.user?.openId ?? null,
          note: input.note ?? null,
        });

        return {
          success: true,
        } as const;
      }),
    runScan: protectedProcedure
      .input(
        z
          .object({
            symbols: z.array(z.string().trim().min(1)).optional(),
            limit: z.number().int().min(10).max(100).optional(),
          })
          .optional()
      )
      .mutation(async ({ input }) => {
        return await runSignalScan({
          symbols: input?.symbols,
          limit: input?.limit,
        });
      }),
  }),
  chat: router({
    sendMessage: publicProcedure
      .input(
        z.object({
          conversationId: z.string().trim().min(1).optional(),
          title: z.string().trim().min(1).optional(),
          persist: z.boolean().optional(),
          workspace: z.enum(["free_chat", "signal"]).optional(),
          signalContext: z
            .object({
              signalId: z.string().trim().min(1),
              signalType: z.string().trim().min(1),
              symbol: z.string().trim().min(1),
              name: z.string().trim().min(1).optional(),
              summary: z.string().trim().min(1),
              urgency: z.enum(["high", "medium", "low"]),
              strength: z.number().min(0).max(1),
              exchange: z.string().trim().min(1).optional(),
              theme: z.string().trim().min(1).optional(),
              marketPhase: z.enum(["active", "upcoming"]).optional(),
              triggeredAt: z.string().trim().min(1).optional(),
              relativeTime: z.string().trim().min(1).optional(),
              missingRule: z.string().trim().min(1).optional(),
              gapText: z.string().trim().min(1).optional(),
              rules: z
                .array(
                  z.object({
                    rule: z.string().trim().min(1),
                    value: z.string().trim().min(1),
                    source: z.string().trim().min(1),
                  })
                )
                .optional(),
            })
            .optional(),
          messages: z.array(
            z.object({
              role: z.enum(["system", "user", "assistant"]),
              content: z.string().trim().min(1),
            })
          ),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const payload = await orchestrateChatMessage(input.messages, {
          workspace: input.workspace,
          signalContext: input.signalContext as ChatSignalContext | undefined,
        });

        if (input.persist !== false && ctx.user?.openId) {
          const summary = payload.keyFindings[0] ?? payload.message.slice(0, 240);
          const stateJson = JSON.stringify({
            citations: payload.citations,
            executionSteps: payload.executionSteps,
            detectedSymbol: payload.detectedSymbol,
            taskType: payload.taskType,
            intent: payload.intent ?? null,
            usedTools: payload.usedTools,
            researchPlan: payload.researchPlan ?? null,
            suggestedNextActions: payload.suggestedNextActions,
            workspace: input.workspace ?? "free_chat",
            signalContext: input.signalContext ?? null,
          });

          const conversation = await db.upsertChatConversation({
            conversationId: input.conversationId,
            ownerOpenId: ctx.user.openId,
            title: input.title ?? (payload.detectedSymbol ? `${payload.detectedSymbol} 分析` : "Free Chat"),
            detectedSymbol: payload.detectedSymbol,
            taskType: payload.taskType,
            summary,
            stateJson,
          });

          await db.replaceChatMessages({
            conversationId: conversation.id,
            messages: [
              ...input.messages,
              {
                role: "assistant",
                content: buildAssistantMessage(payload),
              },
            ],
          });

          await db.replaceChatArtifacts({
            conversationId: conversation.id,
            artifacts: payload.artifacts.map(artifact => ({
              id: artifact.id,
              name: artifact.name,
              type: artifact.type,
              status: artifact.status,
              summary: artifact.summary,
              content: buildReportMarkdown({
                title: artifact.name,
                prompt: input.messages.filter(item => item.role === "user").at(-1)?.content ?? "",
                payload,
              }),
            })),
          });

          payload.conversationId = conversation.id;
        }

        return payload;
      }),
    listConversations: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user?.openId) return [];
      const rows = await db.listChatConversationsByOwner(ctx.user.openId);
      return rows.map(row => ({
        id: row.id,
        title: row.title,
        detectedSymbol: row.detectedSymbol,
        taskType: row.taskType,
        summary: row.summary,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
    }),
    getConversation: publicProcedure
      .input(z.object({ id: z.string().trim().min(1) }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user?.openId) return null;
        const result = await db.getChatConversationById(input.id, ctx.user.openId);
        if (!result) return null;

        const state = safeParseJson(result.conversation.stateJson);
        return {
          id: result.conversation.id,
          title: result.conversation.title,
          detectedSymbol: result.conversation.detectedSymbol,
          taskType: result.conversation.taskType,
          summary: result.conversation.summary,
          createdAt: result.conversation.createdAt,
          updatedAt: result.conversation.updatedAt,
          messages: result.messages.map(message => ({
            id: message.id,
            role: message.role,
            content: message.content,
            timestamp: message.createdAt,
          })),
          citations: Array.isArray(state?.citations) ? state.citations : [],
          executionSteps: Array.isArray(state?.executionSteps) ? state.executionSteps : [],
          intent: state?.intent ?? null,
          usedTools: Array.isArray(state?.usedTools) ? state.usedTools : [],
          researchPlan: state && isResearchPlan(state.researchPlan) ? state.researchPlan : null,
          suggestedNextActions: Array.isArray(state?.suggestedNextActions) ? state.suggestedNextActions : [],
          artifacts: result.artifacts.map(artifact => ({
            id: artifact.id,
            name: artifact.name,
            type: artifact.type,
            status: artifact.status,
            summary: artifact.summary,
            createdAt: artifact.createdAt,
          })),
        };
      }),
    getArtifact: publicProcedure
      .input(z.object({ id: z.string().trim().min(1) }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user?.openId) return null;
        return await db.getChatArtifactById(input.id, ctx.user.openId);
      }),
  }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  market: router({
    listTokens: publicProcedure
      .input(
        z
          .object({
            query: z.string().trim().optional(),
            symbols: z.array(z.string().trim().min(1)).optional(),
            exchangeIds: z.array(z.number().int().positive()).optional(),
            marketType: z.enum(["all", "spot", "perps"]).optional(),
            sortBy: z.enum(["listedAt", "marketCap", "volume24h"]).optional(),
            sortOrder: z.enum(["asc", "desc"]).optional(),
            page: z.number().int().positive().optional(),
            pageSize: z.number().int().positive().max(100).optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return await listMarketTokens(input ?? {});
      }),
    searchAnnouncements: publicProcedure
      .input(
        z
          .object({
            query: z.string().trim().optional(),
            symbol: z.string().trim().optional(),
            exchangeSlug: z.string().trim().optional(),
            type: z.enum(["listing", "delisting", "event", "other"]).optional(),
            limit: z.number().int().positive().max(100).optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return await searchAnnouncements(input ?? {});
      }),
    listRecentListings: publicProcedure
      .input(
        z
          .object({
            query: z.string().trim().optional(),
            exchangeSlug: z.string().trim().optional(),
            limit: z.number().int().positive().max(100).optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return await searchListingAnnouncements(input ?? {});
      }),
    getWatchlist: publicProcedure.query(async () => {
      return await listMarketWatchlist();
    }),
    toggleWatchlist: publicProcedure
      .input(
        z.object({
          symbol: z.string().trim().min(1),
          tokenId: z.number().int().positive().nullable().optional(),
          tokenName: z.string().trim().nullable().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await toggleMarketWatchlist(input);
      }),
  }),

  token: router({
    getProfile: publicProcedure
      .input(
        z.object({
          symbol: z.string().trim().min(1),
        })
      )
      .query(async ({ input }) => {
        return await getTokenProfileBySymbol(input.symbol);
      }),
    getUnlockView: publicProcedure
      .input(
        z.object({
          symbol: z.string().trim().min(1),
        })
      )
      .query(async ({ input }) => {
        return await getTokenUnlockViewBySymbol(input.symbol);
      }),
    getListingView: publicProcedure
      .input(
        z.object({
          symbol: z.string().trim().min(1),
        })
      )
      .query(async ({ input }) => {
        return await getTokenListingViewBySymbol(input.symbol);
      }),
    getKline: publicProcedure
      .input(
        z.object({
          symbol: z.string().trim().min(1),
          range: z.enum(["1m", "3m", "6m", "1y"]).optional(),
        })
      )
      .query(async ({ input }) => {
        return await getTokenKlineBySymbol(input.symbol, input.range ?? "3m");
      }),
    getDepthView: publicProcedure
      .input(
        z.object({
          symbol: z.string().trim().min(1),
          marketType: z.enum(["spot", "perps"]).optional(),
        })
      )
      .query(async ({ input }) => {
        return await getTokenDepthViewBySymbol(input.symbol, input.marketType);
      }),
    getDepthTrend: publicProcedure
      .input(
        z.object({
          symbol: z.string().trim().min(1),
          days: z.number().int().min(7).max(365).optional(),
          marketType: z.enum(["spot", "perps"]).optional(),
        })
      )
      .query(async ({ input }) => {
        return await getTokenDepthTrendBySymbol(input.symbol, input.days, input.marketType);
      }),
    getExchangeDepthView: publicProcedure
      .input(
        z.object({
          symbol: z.string().trim().min(1),
          exchangeSlug: z.string().trim().min(1),
          timeframe: z.enum(["1h", "4h", "12h", "1d"]).optional(),
        })
      )
      .query(async ({ input }) => {
        return await getExchangeDepthViewBySymbol(input.symbol, input.exchangeSlug, input.timeframe ?? "1h");
      }),
    getHoldersView: publicProcedure
      .input(
        z.object({
          symbol: z.string().trim().min(1),
          timeframe: z.enum(["1h", "4h", "12h", "1d"]).optional(),
        })
      )
      .query(async ({ input }) => {
        return await getTokenHoldersViewBySymbol(input.symbol, input.timeframe);
      }),
    getExchangeHoldersView: publicProcedure
      .input(
        z.object({
          symbol: z.string().trim().min(1),
          exchangeSlug: z.string().trim().min(1),
          timeframe: z.enum(["1h", "4h", "12h", "1d"]).optional(),
        })
      )
      .query(async ({ input }) => {
        return await getExchangeHoldersViewBySymbol(input.symbol, input.exchangeSlug, input.timeframe);
      }),
    getFundingView: publicProcedure
      .input(
        z.object({
          symbol: z.string().trim().min(1),
        })
      )
      .query(async ({ input }) => {
        return await getTokenFundingViewBySymbol(input.symbol);
      }),
    getSocialHeatView: publicProcedure
      .input(
        z.object({
          symbol: z.string().trim().min(1),
        })
      )
      .query(async ({ input }) => {
        return await getTokenSocialHeatViewBySymbol(input.symbol);
      }),
  }),

  onchain: router({
    listTokens: publicProcedure
      .input(
        z.object({
          limit: z.number().int().min(5).max(100).optional(),
          chainId: z.number().int().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        return await listAvailableOnchainTokens(input?.limit ?? 20, input?.chainId);
      }),
    listPools: publicProcedure
      .input(
        z.object({
          page: z.number().int().min(1).optional(),
          pageSize: z.number().int().min(20).max(100).optional(),
          query: z.string().trim().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        return await listAvailableOnchainPools(input?.page ?? 1, input?.pageSize ?? 100, input?.query);
      }),
    getOverview: publicProcedure
      .input(
        z.object({
          symbol: z.string().trim().min(1),
          tokenId: z.number().int().optional(),
          chainId: z.number().int().optional(),
        })
      )
      .query(async ({ input }) => {
        return await getOnchainOverviewBySymbol(input.symbol, {
          tokenId: input.tokenId,
          chainId: input.chainId,
        });
      }),
    getFundFlow: publicProcedure
      .input(
        z.object({
          symbol: z.string().trim().min(1),
          tokenId: z.number().int().optional(),
          chainId: z.number().int().optional(),
          date: z.string().trim().optional(),
          depth: z.number().int().min(1).max(4).optional(),
          limitPerLayer: z.number().int().min(5).max(120).optional(),
        })
      )
      .query(async ({ input }) => {
        return await getOnchainFundFlowBySymbol(input.symbol, {
          tokenId: input.tokenId,
          chainId: input.chainId,
          date: input.date,
          depth: input.depth,
          limitPerLayer: input.limitPerLayer,
        });
      }),
    getHolders: publicProcedure
      .input(
        z.object({
          symbol: z.string().trim().min(1),
          tokenId: z.number().int().optional(),
          chainId: z.number().int().optional(),
          date: z.string().trim().optional(),
          page: z.number().int().min(1).optional(),
          pageSize: z.number().int().min(10).max(100).optional(),
        })
      )
      .query(async ({ input }) => {
        return await getOnchainHoldersBySymbol(input.symbol, {
          tokenId: input.tokenId,
          chainId: input.chainId,
          date: input.date,
          page: input.page,
          pageSize: input.pageSize,
        });
      }),
    getLargeTransfers: publicProcedure
      .input(
        z.object({
          symbol: z.string().trim().min(1),
          tokenId: z.number().int().optional(),
          chainId: z.number().int().optional(),
          page: z.number().int().min(1).optional(),
          pageSize: z.number().int().min(10).max(500).optional(),
          search: z.string().trim().optional(),
          sortOrder: z.enum(["asc", "desc"]).optional(),
        })
      )
      .query(async ({ input }) => {
        return await getOnchainLargeTransfersBySymbol(input.symbol, {
          tokenId: input.tokenId,
          chainId: input.chainId,
          page: input.page,
          pageSize: input.pageSize,
          search: input.search,
          sortOrder: input.sortOrder,
        });
      }),
    getCexFlows: publicProcedure
      .input(
        z.object({
          symbol: z.string().trim().min(1),
          tokenId: z.number().int().optional(),
          chainId: z.number().int().optional(),
        })
      )
      .query(async ({ input }) => {
        return await getOnchainCexFlowsBySymbol(input.symbol, {
          tokenId: input.tokenId,
          chainId: input.chainId,
        });
      }),
    getPoolAdds: publicProcedure
      .input(
        z.object({
          symbol: z.string().trim().min(1),
          tokenId: z.number().int().optional(),
          chainId: z.number().int().optional(),
        })
      )
      .query(async ({ input }) => {
        return await getOnchainPoolAddsBySymbol(input.symbol, {
          tokenId: input.tokenId,
          chainId: input.chainId,
        });
      }),
    getPoolAddsByPool: publicProcedure
      .input(
        z.object({
          poolRegistryId: z.string().trim().min(1),
        })
      )
      .query(async ({ input }) => {
        return await getOnchainPoolAddsByPoolId(input.poolRegistryId);
      }),
    getCexFlowTransfers: publicProcedure
      .input(
        z.object({
          symbol: z.string().trim().min(1),
          date: z.string().trim().min(1),
          exchange: z.string().trim().optional(),
          direction: z.enum(["all", "inflow", "outflow"]),
        })
      )
      .query(async ({ input }) => {
        return await getOnchainCexFlowTransferDetailsBySymbol(input.symbol, {
          date: input.date,
          exchange: input.exchange,
          direction: input.direction,
        });
      }),
  }),

  // ==================== Coin Routes ====================
  coins: router({
    list: publicProcedure.query(async () => {
      return await db.getAllCoins();
    }),
    
    getById: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        return await db.getCoinById(input.id);
      }),
    
    create: protectedProcedure
      .input(z.object({
        id: z.string(),
        symbol: z.string(),
        name: z.string(),
        description: z.string().optional(),
        logoUrl: z.string().optional(),
        website: z.string().optional(),
        whitepaperUrl: z.string().optional(),
        currentPrice: z.number().optional(),
        marketCap: z.number().optional(),
        fdv: z.number().optional(),
        totalSupply: z.number().optional(),
        circulatingSupply: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.createCoin(input);
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.string(),
        updates: z.object({
          symbol: z.string().optional(),
          name: z.string().optional(),
          description: z.string().optional(),
          logoUrl: z.string().optional(),
          website: z.string().optional(),
          whitepaperUrl: z.string().optional(),
          currentPrice: z.number().optional(),
          marketCap: z.number().optional(),
          fdv: z.number().optional(),
          totalSupply: z.number().optional(),
          circulatingSupply: z.number().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        await db.updateCoin(input.id, input.updates);
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await db.deleteCoin(input.id);
        return { success: true };
      }),
  }),

  // ==================== Exchange Routes ====================
  exchanges: router({
    list: publicProcedure.query(async () => {
      return await db.getAllExchanges();
    }),
    
    getById: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        return await db.getExchangeById(input.id);
      }),
    
    create: protectedProcedure
      .input(z.object({
        id: z.string(),
        name: z.string(),
        logoUrl: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.createExchange(input);
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.string(),
        updates: z.object({
          name: z.string().optional(),
          logoUrl: z.string().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        await db.updateExchange(input.id, input.updates);
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await db.deleteExchange(input.id);
        return { success: true };
      }),
  }),

  // ==================== Listing Routes ====================
  listings: router({
    list: publicProcedure.query(async () => {
      return await db.getAllListings();
    }),
    
    getByCoinId: publicProcedure
      .input(z.object({ coinId: z.string() }))
      .query(async ({ input }) => {
        return await db.getListingsByCoinId(input.coinId);
      }),
    
    getByExchangeId: publicProcedure
      .input(z.object({ exchangeId: z.string() }))
      .query(async ({ input }) => {
        return await db.getListingsByExchangeId(input.exchangeId);
      }),
    
    getByCoinAndExchange: publicProcedure
      .input(z.object({ 
        coinId: z.string(),
        exchangeId: z.string(),
      }))
      .query(async ({ input }) => {
        return await db.getListingByCoinAndExchange(input.coinId, input.exchangeId);
      }),
    
    create: protectedProcedure
      .input(z.object({
        coinId: z.string(),
        exchangeId: z.string(),
        hasSpot: z.boolean().optional(),
        hasFutures: z.boolean().optional(),
        spotListingTime: z.date().optional(),
        futuresListingTime: z.date().optional(),
        listingPrice: z.number().optional(),
        listingVolume24h: z.number().optional(),
        listingCirculatingSupply: z.number().optional(),
        listingFdv: z.number().optional(),
        currentVolume24h: z.number().optional(),
        currentDepthUp2: z.number().optional(),
        currentDepthDown2: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.createListing(input);
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        updates: z.object({
          hasSpot: z.boolean().optional(),
          hasFutures: z.boolean().optional(),
          spotListingTime: z.date().optional(),
          futuresListingTime: z.date().optional(),
          listingPrice: z.number().optional(),
          listingVolume24h: z.number().optional(),
          listingCirculatingSupply: z.number().optional(),
          listingFdv: z.number().optional(),
          currentVolume24h: z.number().optional(),
          currentDepthUp2: z.number().optional(),
          currentDepthDown2: z.number().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        await db.updateListing(input.id, input.updates);
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteListing(input.id);
        return { success: true };
      }),
  }),

  // ==================== Activity Routes ====================
  activities: router({
    getByCoinId: publicProcedure
      .input(z.object({ coinId: z.string() }))
      .query(async ({ input }) => {
        return await db.getActivitiesByCoinId(input.coinId);
      }),
    
    getByExchangeId: publicProcedure
      .input(z.object({ exchangeId: z.string() }))
      .query(async ({ input }) => {
        return await db.getActivitiesByExchangeId(input.exchangeId);
      }),
    
    getByCoinAndExchange: publicProcedure
      .input(z.object({ 
        coinId: z.string(),
        exchangeId: z.string(),
      }))
      .query(async ({ input }) => {
        return await db.getActivitiesByCoinAndExchange(input.coinId, input.exchangeId);
      }),
    
    create: protectedProcedure
      .input(z.object({
        coinId: z.string(),
        exchangeId: z.string(),
        title: z.string(),
        content: z.string().optional(),
        url: z.string().optional(),
        publishTime: z.date(),
      }))
      .mutation(async ({ input }) => {
        return await db.createActivity(input);
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteActivity(input.id);
        return { success: true };
      }),
  }),

  // ==================== TokenUnlock Routes ====================
  tokenUnlocks: router({
    getByCoinId: publicProcedure
      .input(z.object({ coinId: z.string() }))
      .query(async ({ input }) => {
        return await db.getTokenUnlocksByCoinId(input.coinId);
      }),
    
    create: protectedProcedure
      .input(z.object({
        coinId: z.string(),
        unlockDate: z.date(),
        unlockAmount: z.number(),
        percentageOfTotalSupply: z.number().optional(),
        recipientCategory: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.createTokenUnlock(input);
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteTokenUnlock(input.id);
        return { success: true };
      }),
  }),

  // ==================== Dashboard Routes ====================
  dashboard: router({
    recentListings: publicProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ input }) => {
        return await db.getRecentListings(input.limit);
      }),
    
    exchangeStats: publicProcedure.query(async () => {
      return await db.getExchangeStats();
    }),
  }),

  // ==================== AddressHolding Routes ====================
  addressHoldings: router({
    getByCoinId: publicProcedure
      .input(z.object({ coinId: z.string() }))
      .query(async ({ input }) => {
        return await db.getAddressHoldingsByCoinId(input.coinId);
      }),
    
    getExchangeHoldings: publicProcedure
      .input(z.object({ coinId: z.string() }))
      .query(async ({ input }) => {
        return await db.getExchangeAddressHoldings(input.coinId);
      }),
    
    getNonExchangeHoldings: publicProcedure
      .input(z.object({ 
        coinId: z.string(),
        limit: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return await db.getNonExchangeAddressHoldings(input.coinId, input.limit);
      }),
    
    create: protectedProcedure
      .input(z.object({
        coinId: z.string(),
        address: z.string(),
        balance: z.number(),
        percentageOfCirculating: z.number().optional(),
        isExchange: z.boolean().optional(),
        exchangeId: z.string().optional(),
        label: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.createAddressHolding(input);
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteAddressHolding(input.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;

function buildAssistantMessage(payload: Awaited<ReturnType<typeof orchestrateChatMessage>>) {
  return [
    payload.message,
    payload.keyFindings.length > 0 ? "" : null,
    payload.keyFindings.length > 0 ? "**关键发现**" : null,
    ...payload.keyFindings.map(item => `- ${item}`),
    payload.suggestedNextActions.length > 0 ? "" : null,
    payload.suggestedNextActions.length > 0 ? "**下一步建议**" : null,
    ...payload.suggestedNextActions.map(item => `- ${item}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildReportMarkdown(input: {
  title: string;
  prompt: string;
  payload: Awaited<ReturnType<typeof orchestrateChatMessage>>;
}) {
  const { title, prompt, payload } = input;
  return [
    `# ${title}`,
    "",
    `生成时间: ${new Date().toISOString()}`,
    payload.detectedSymbol ? `Symbol: ${payload.detectedSymbol}` : null,
    `任务类型: ${payload.taskType}`,
    "",
    "## 用户问题",
    prompt || "N/A",
    "",
    "## 分析结论",
    payload.message,
    "",
    "## 关键发现",
    ...(payload.keyFindings.length > 0 ? payload.keyFindings.map(item => `- ${item}`) : ["- 无"]),
    "",
    "## 建议动作",
    ...(payload.suggestedNextActions.length > 0
      ? payload.suggestedNextActions.map(item => `- ${item}`)
      : ["- 无"]),
    "",
    "## 数据引用",
    ...(payload.citations.length > 0
      ? payload.citations.map(
          item => `- ${item.title} | ${item.source} | ${item.fetchedAt}\n  ${item.summary}`
        )
      : ["- 无"]),
  ]
    .filter(Boolean)
    .join("\n");
}

function safeParseJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isResearchPlan(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.subQuestions) &&
    Array.isArray(record.plannedTools) &&
    typeof record.rationale === "string"
  );
}
