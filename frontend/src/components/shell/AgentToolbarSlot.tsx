"use client";

import { createContext, useContext } from "react";

// The agent owns conversation state; the shell supplies its visual location.
export const AgentToolbarSlot = createContext<HTMLDivElement | null>(null);
export function useAgentToolbarSlot() { return useContext(AgentToolbarSlot); }
