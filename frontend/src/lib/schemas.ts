import { z } from "zod";

/**
 * The wire contract between this frontend and the RivalPulse backend.
 *
 * This file is the single source of truth: `types.ts` derives its TypeScript
 * types from these schemas, and `api.ts` parses every response through them.
 * If the backend sends a field this file does not describe, the parse fails
 * loudly and names the field — far better than `undefined%` rendering into a
 * demo video.
 *
 * Backend: match these shapes. Frontend: change them here, nowhere else.
 */

export const SeveritySchema = z.enum(["high", "medium", "low"]);

export const SignalTypeSchema = z.enum([
  "Pricing",
  "Product",
  "Partnership",
  "Campaign",
]);

/** The three claim kinds the agent is allowed to emit. Never collapse these. */
export const EvidenceKindSchema = z.enum([
  "fact",
  "observed_signal",
  "hypothesis",
]);

export const CompanySchema = z.object({
  ticker: z.string().min(1),
  name: z.string().min(1),
  industry: z.string().min(1),
});

export const WatchlistSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  // The MVP scope is 2-5 competitors per list.
  companies: z.array(CompanySchema).max(5),
});

/**
 * The signed-in person. Separate from workspace settings on purpose: this is
 * who you are, `/settings` is how the agent behaves.
 */
export const UserProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Name cannot be empty").max(80),
  /** Job title, shown under the name everywhere the avatar appears. */
  role: z.string().min(1, "Role cannot be empty").max(80),
  email: z.email("Enter a valid email address"),
  /** IANA zone. Every timestamp in the product is rendered against this. */
  timezone: z.string().min(1),
  /** ISO date, YYYY-MM-DD. */
  joinedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  workspace: z.string().min(1),
});

export const EvidenceSchema = z.object({
  kind: EvidenceKindSchema,
  /** e.g. "Sectors v2", "Press release", "Pricing page diff" */
  source: z.string().min(1),
  text: z.string().min(1),
});

export const FinancialContextSchema = z.object({
  seriesCaption: z.string(),
  series: z.array(
    z.object({
      label: z.string(),
      value: z.number(),
      highlight: z.boolean().optional(),
    }),
  ),
  metrics: z.array(
    z.object({
      value: z.string(),
      label: z.string(),
      accent: z.boolean().optional(),
    }),
  ),
  /** The "why marketing should care" callout — the product's whole point. */
  whyItMatters: z.string(),
});

export const SignalSchema = z.object({
  id: z.string().min(1),
  company: z.string().min(1),
  companyName: z.string().min(1),
  type: SignalTypeSchema,
  title: z.string().min(1),
  /** One-line provenance summary shown in list rows. */
  subline: z.string(),
  headline: z.string().min(1),
  severity: SeveritySchema,
  /** ISO date, YYYY-MM-DD. */
  detectedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  runId: z.string(),
  storedAt: z.string(),
  comparedAgainstRunId: z.string(),
  evidence: z.array(EvidenceSchema).min(1),
  financialContext: FinancialContextSchema,
});

export const RunStatusSchema = z.enum([
  "idle",
  "queued",
  "running",
  "complete",
  "failed",
]);

export const RunStepSchema = z.object({
  id: z.string(),
  label: z.string(),
});

export const ToolCallSchema = z.object({
  name: z.string(),
  detail: z.string(),
});

export const AgentRunSchema = z.object({
  id: z.string(),
  query: z.string(),
  status: RunStatusSchema,
  /** Index into `steps`; -1 before the first step starts. */
  currentStep: z.number().int(),
  steps: z.array(RunStepSchema),
  elapsedSeconds: z.number(),
  etaSeconds: z.number(),
  toolCalls: z.array(ToolCallSchema),
  failedTool: z.string().optional(),
  resultSummary: z.string().optional(),
  coverageStatus: z.enum(["queued", "running", "completed", "partial", "failed"]).optional(),
  financialBrief: z.object({
    period: z.string().nullable(),
    rows: z.array(z.object({
      symbol: z.string(),
      name: z.string(),
      comparison_note: z.string(),
      metrics: z.array(z.object({
        metric: z.string(), value: z.string(), currency: z.string().nullable(),
        unit: z.string(), period: z.string(), comparison_basis: z.string(),
        source_url: z.string().url(), json_pointer: z.string(),
        snapshot_id: z.string(), claim_id: z.string(),
      })),
    })),
    interpretation: z.object({
      text: z.string(), supporting_claim_ids: z.array(z.string()),
      uncertainty: z.enum(["low", "medium", "high"]),
    }).nullable(),
    caveats: z.array(z.string()),
  }).optional(),
  /** Signals the run produced. Present once status is "complete". */
  producedSignalIds: z.array(z.string()).optional(),
});

export const PipelineStageSchema = z.object({
  label: z.string(),
  count: z.number(),
  percent: z.number().min(0).max(100),
  tone: z.enum(["accent", "ink", "neutral"]),
});

export const MixSliceSchema = z.object({
  label: SignalTypeSchema,
  /** Absolute count. `percent` is derived from it, never stored independently. */
  count: z.number().int().min(0),
  percent: z.number().min(0).max(100),
  color: z.string(),
});

export const CreditUsageSchema = z.object({
  used: z.number().int().min(0),
  total: z.number().int().positive(),
  cacheHitRate: z.number().min(0).max(1),
});

export const DashboardAggregatesSchema = z.object({
  companiesTracked: z.number().int(),
  /**
   * Signals delivered in the selected range. The store recomputes this, the
   * mix and the pipeline's final stage from the actual feed, so the dashboard
   * cannot show three numbers that disagree with each other.
   */
  signalsInRange: z.number().int(),
  highSeverityCount: z.number().int(),
  credits: CreditUsageSchema,
  pipeline: z.array(PipelineStageSchema),
  mix: z.array(MixSliceSchema),
  mixTotal: z.number().int(),
  interpretation: z.object({
    body: z.string(),
    counts: z.object({
      facts: z.number().int(),
      observedSignals: z.number().int(),
      hypotheses: z.number().int(),
    }),
  }),
  lastRunAt: z.string(),
});

export const RangeSchema = z.enum(["week", "month"]);

export const AlertStatusSchema = z.object({
  enabled: z.boolean(),
  provider: z.string(),
  recipient: z.string().nullable(),
  minimum_severity: z.enum(["medium", "high"]),
  delivery_policy: z.string(),
});

/** Envelope for GET /dashboard. */
export const DashboardResponseSchema = z.object({
  mode: z.enum(["live", "yahoo", "replay"]),
  watchlist: WatchlistSchema,
  aggregates: DashboardAggregatesSchema,
  signals: z.array(SignalSchema),
});
