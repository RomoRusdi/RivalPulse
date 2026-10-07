import { StoreProvider } from "@/lib/store";
import { ToastProvider } from "@/components/ui/Toast";
import { AppShell } from "@/components/shell/AppShell";
import { AuthBoundary } from "@/lib/auth";
import { AgentNavigationProvider } from "@/components/agent/AgentNavigation";

/**
 * Everything behind the app chrome: sidebar, top bar, store and toasts.
 *
 * `(app)` is a route group, so it adds no URL segment — `/`, `/signals` and
 * the rest keep their paths.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthBoundary>
      <ToastProvider>
        <StoreProvider>
          <AgentNavigationProvider><AppShell>{children}</AppShell></AgentNavigationProvider>
        </StoreProvider>
      </ToastProvider>
    </AuthBoundary>
  );
}
