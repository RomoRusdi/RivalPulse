// Keep the services and direct routes available while reducing navigation.
export const SHOW_ALERTS = false;
export const SHOW_RECOMMENDED_ACTIONS = false;

export function visibleDestination(href: string) {
  return (href !== "/alerts" || SHOW_ALERTS) && (href !== "/actions" || SHOW_RECOMMENDED_ACTIONS);
}

export function pageLabel(path: string) {
  if (path.startsWith("/financial-sources/")) return "Competitors / Financial source";
  if (path.startsWith("/signals/")) return "What changed / Finding";
  return ({ "/signals": "What changed", "/watchlists": "Competitors", "/settings": "Settings",
    "/profile": "Profile", "/sectors": "Research allowance", "/actions": "Recommended actions",
    "/alerts": "Alerts" } as Record<string, string>)[path] ?? "RivalPulse";
}
