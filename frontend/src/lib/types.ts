import type { z } from "zod";
import type {
  AgentRunSchema,
  AlertStatusSchema,
  ChatReplySchema,
  CompanySchema,
  CreditUsageSchema,
  DashboardAggregatesSchema,
  DashboardResponseSchema,
  EvidenceKindSchema,
  EvidenceSchema,
  FinancialContextSchema,
  MixSliceSchema,
  PipelineStageSchema,
  RangeSchema,
  RunStatusSchema,
  RunStepSchema,
  SeveritySchema,
  SignalSchema,
  SignalTypeSchema,
  ToolCallSchema,
  UserProfileSchema,
  WatchlistSchema,
} from "./schemas";

/**
 * Domain types for RivalPulse.
 *
 * Every type here is derived from the zod schemas in `schemas.ts`, so the
 * runtime contract and the compile-time types can never drift apart. Edit
 * `schemas.ts`; these follow automatically.
 */

export type Severity = z.infer<typeof SeveritySchema>;
export type SignalType = z.infer<typeof SignalTypeSchema>;
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;
export type Company = z.infer<typeof CompanySchema>;
export type Watchlist = z.infer<typeof WatchlistSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type FinancialContext = z.infer<typeof FinancialContextSchema>;
export type Signal = z.infer<typeof SignalSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export type RunStep = z.infer<typeof RunStepSchema>;
export type ToolCall = z.infer<typeof ToolCallSchema>;
export type AgentRun = z.infer<typeof AgentRunSchema>;
export type PipelineStage = z.infer<typeof PipelineStageSchema>;
export type MixSlice = z.infer<typeof MixSliceSchema>;
export type CreditUsage = z.infer<typeof CreditUsageSchema>;
export type DashboardAggregates = z.infer<typeof DashboardAggregatesSchema>;
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
export type Range = z.infer<typeof RangeSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type AlertStatus = z.infer<typeof AlertStatusSchema>;

/**
 * A signal decorated with local read state.
 *
 * `seen` is deliberately not part of the wire contract: today it lives in
 * browser storage, and when the backend grows per-user state it becomes a
 * server field without any component changing.
 */
export type SignalWithState = Signal & { seen: boolean };
export type ChatReply = z.infer<typeof ChatReplySchema>;
