import { COMPANY_CATALOGUE, MAX_COMPANIES, MIN_COMPANIES } from "./catalogue";
import type { Company, Watchlist } from "./types";

export type InstantAgentAction =
  | { type: "add_company"; company: Company }
  | { type: "remove_company"; ticker: string }
  | { type: "rename_watchlist"; name: string };

export interface InstantAgentResult {
  label: string;
  content: string;
  action?: InstantAgentAction;
}

/**
 * Cost-aware intent router for commands that do not need external evidence.
 * Returning null means the request needs the full research pipeline.
 *
 * Mutations remain deterministic: the LLM never gets permission to alter a
 * watchlist based on free-form output. Ambiguous commands ask for clarification.
 */
export function routeInstantMessage(
  input: string,
  watchlist: Watchlist | null,
): InstantAgentResult | null {
  const text = input.trim();
  const lower = text.toLocaleLowerCase();

  const rename = text.match(/\b(?:rename|call)\s+(?:my\s+|the\s+)?watchlist\s+(?:to|as)\s+["']?([^"']{2,80})["']?\s*$/i);
  if (rename) {
    const name = rename[1].trim();
    return {
      label: "Watchlist updated",
      content: `Done — I renamed this watchlist to “${name}”. This was a workspace command, so no research tools or provider credits were needed.`,
      action: { type: "rename_watchlist", name },
    };
  }

  const addCommand = /\b(?:add|track|monitor|include)\b/i.test(text);
  const removeCommand = /\b(?:remove|delete|drop|untrack|stop monitoring)\b/i.test(text);
  if (addCommand || removeCommand) {
    const company = findMentionedCompany(text);
    if (!company) {
      return {
        label: "Clarification needed",
        content: `I can ${addCommand ? "add" : "remove"} that competitor without running an investigation. Tell me its IDX ticker or company name.`,
      };
    }
    if (!watchlist) {
      return {
        label: "Watchlist unavailable",
        content: "I cannot update the watchlist until the workspace finishes loading. Try that command again in a moment.",
      };
    }

    const exists = watchlist.companies.some((item) => item.ticker === company.ticker);
    if (addCommand) {
      if (exists) {
        return {
          label: "Already monitored",
          content: `${company.name} (${company.ticker}) is already in “${watchlist.name}”. I did not run the research pipeline or spend provider credits.`,
        };
      }
      if (watchlist.companies.length >= MAX_COMPANIES) {
        return {
          label: "Watchlist limit reached",
          content: `“${watchlist.name}” already has ${MAX_COMPANIES} competitors. Remove one before adding ${company.ticker}.`,
        };
      }
      return {
        label: "Competitor added",
        content: `Added ${company.name} (${company.ticker}) to “${watchlist.name}”. This was an instant workspace action; no evidence pipeline was necessary.`,
        action: { type: "add_company", company },
      };
    }

    if (!exists) {
      return {
        label: "Not monitored",
        content: `${company.name} (${company.ticker}) is not in “${watchlist.name}”, so nothing changed.`,
      };
    }
    if (watchlist.companies.length <= MIN_COMPANIES) {
      return {
        label: "Minimum scope protected",
        content: `A watchlist needs at least ${MIN_COMPANIES} competitors for comparison. Add another company before removing ${company.ticker}.`,
      };
    }
    return {
      label: "Competitor removed",
      content: `Removed ${company.name} (${company.ticker}) from “${watchlist.name}”. Existing evidence remains stored, but future investigations will exclude it.`,
      action: { type: "remove_company", ticker: company.ticker },
    };
  }

  if (
    /\b(?:list|show|who|which)\b.*\b(?:watchlist|competitors?|companies)\b/i.test(text) ||
    /\bwhat\b.*\b(?:companies|competitors?)\b.*\b(?:in|on)\b.*\bwatchlist\b/i.test(text) ||
    /\b(?:watchlist|competitors?)\b.*\b(?:contain|include|tracking|monitoring)\b/i.test(text)
  ) {
    const companies = watchlist?.companies ?? [];
    return {
      label: "Current scope",
      content: companies.length
        ? `“${watchlist?.name}” currently monitors ${companies.map((company) => `${company.name} (${company.ticker})`).join(", ")}. No research run was needed.`
        : "This watchlist does not have any competitors yet.",
    };
  }

  if (/^(?:hi|hello|hey|good (?:morning|afternoon|evening))[!.\s]*$/i.test(text)) {
    return {
      label: "Ready",
      content: "Hi — I can update your watchlist instantly or run an evidence-backed competitor investigation. Ask naturally; I will choose the smallest sufficient workflow.",
    };
  }

  if (/^(?:thanks|thank you|okay|ok|got it)[!.\s]*$/i.test(text)) {
    return { label: "Acknowledged", content: "You’re welcome. I’m ready for the next command or investigation." };
  }

  if (/\b(?:what can you do|help|how do i use)\b/i.test(lower)) {
    return {
      label: "Agent capabilities",
      content: "I handle workspace commands such as adding or removing competitors instantly. Questions about market changes, positioning, campaigns, pricing, or financial momentum trigger the full cited research pipeline.",
    };
  }

  return null;
}

function findMentionedCompany(text: string): Company | null {
  const normalized = text.toLocaleLowerCase();
  return (
    COMPANY_CATALOGUE.find((company) =>
      new RegExp(`\\b${escapeRegExp(company.ticker)}\\b`, "i").test(text),
    ) ??
    COMPANY_CATALOGUE.find((company) => normalized.includes(company.name.toLocaleLowerCase())) ??
    null
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
