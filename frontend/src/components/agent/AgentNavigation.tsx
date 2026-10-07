"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface AgentNavigationActions {
  blocked: boolean;
  onNew: () => void;
  onHistory: () => void;
}

const ActionsContext = createContext<AgentNavigationActions | null>(null);
const RegistrationContext = createContext<((actions: AgentNavigationActions | null) => void) | null>(null);

/** Only bridges existing workspace actions to the sidebar; owns no chat data. */
export function AgentNavigationProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<AgentNavigationActions | null>(null);
  return <RegistrationContext.Provider value={setActions}><ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider></RegistrationContext.Provider>;
}

export const useAgentNavigation = () => useContext(ActionsContext);

export function useRegisterAgentNavigation({ blocked, onNew, onHistory }: AgentNavigationActions) {
  const register = useContext(RegistrationContext);
  const handlers = useRef({ onNew, onHistory });
  useLayoutEffect(() => { handlers.current = { onNew, onHistory }; }, [onNew, onHistory]);
  // Publish the busy restriction before paint without temporarily unregistering
  // the menu: disabling a focused trigger would dismiss it as a run starts.
  useLayoutEffect(() => {
    register?.({ blocked, onNew: () => handlers.current.onNew(), onHistory: () => handlers.current.onHistory() });
  }, [register, blocked]);
  useLayoutEffect(() => () => register?.(null), [register]);
}
