import { StoreProvider } from "@/lib/store";
import { ToastProvider } from "@/components/ui/Toast";
import { AppShell } from "@/components/shell/AppShell";
import { DemoSessionGate } from "@/components/auth/DemoSessionGate";

/**
 * Everything behind the app chrome: sidebar, top bar, store and toasts.
 *
 * `(app)` is a route group, so it adds no URL segment — `/`, `/signals` and
 * the rest keep their paths.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <DemoSessionGate>
      <ToastProvider>
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </ToastProvider>
    </DemoSessionGate>
  );
}
