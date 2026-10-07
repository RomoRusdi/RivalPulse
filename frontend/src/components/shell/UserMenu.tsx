"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { LogOut, Settings as SettingsIcon, User } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cx } from "@/components/ui/primitives";
import { useOptionalAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { signOutDemo } from "@/lib/api";
import { useReversiblePresence } from "@/lib/motion";

const ITEMS: { href: Route; label: string; icon: typeof User }[] = [
  { href: "/profile", label: "Profile", icon: User },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

/**
 * The top-bar avatar, which used to be a decorative circle.
 *
 * Roving focus rather than a focus trap: a menu should let Tab leave, while
 * the arrow keys walk the items and Escape returns focus to the trigger.
 */
export function UserMenu() {
  const { profile } = useStore();
  const auth = useOptionalAuth();
  const router = useRouter();
  const { open, present, setOpen } = useReversiblePresence();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<(HTMLAnchorElement | HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open, setOpen]);

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const focusItem = (index: number) => {
    const count = itemsRef.current.length;
    if (count === 0) return;
    const next = (index + count) % count;
    itemsRef.current[next]?.focus();
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const current = itemsRef.current.findIndex(
      (el) => el === document.activeElement,
    );
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(current + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(current - 1);
    }
  };

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);
    try {
      if (auth) { await auth.logout(); return; }
      await signOutDemo();
      setOpen(false);
      router.replace("/login");
      router.refresh();
    } catch {
      setSignOutError("Could not sign out. Try again.");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div ref={containerRef} className="relative shrink-0" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${profile.name}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => focusItem(0));
          }
        }}
        className="hidden cursor-pointer rounded-full transition-console hover:opacity-85 active:scale-[0.97] sm:block"
      >
        <Avatar name={profile.name} size="md" />
      </button>

      {present ? (
        <div
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          data-open={open} inert={!open} aria-hidden={!open}
          className="rp-popover absolute right-0 z-50 mt-2 w-[236px] rounded-field border border-border bg-card p-1 shadow-frame"
          style={{ transformOrigin: "top right" }}
        >
          <div className="flex items-center gap-2.5 border-b border-divider px-2.5 py-2.5">
            <Avatar name={profile.name} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-bold">{profile.name}</p>
              <p className="truncate text-xs text-muted">{profile.email}</p>
            </div>
          </div>

          <div className="py-1">
            {ITEMS.map((item, i) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  ref={(el) => {
                    itemsRef.current[i] = el;
                  }}
                  onClick={() => setOpen(false)}
                  className={ITEM_CLASS}
                >
                  <Icon aria-hidden size={16} strokeWidth={1.5} />
                  {item.label}
                </Link>
              );
            })}

            <button
              type="button"
              role="menuitem"
              ref={(el) => {
                itemsRef.current[ITEMS.length] = el;
              }}
              onClick={() => { void signOut(); }}
              disabled={signingOut}
              className={cx(ITEM_CLASS, "w-full text-left disabled:cursor-wait disabled:opacity-50")}
            >
              <LogOut aria-hidden size={16} strokeWidth={1.5} />
              Sign out
            </button>
            {signOutError ? <p role="alert" className="px-2.5 py-2 text-xs text-accent-ink">{signOutError}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const ITEM_CLASS =
  "flex cursor-pointer items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-sm text-ink-2 no-underline transition-console hover:bg-subtle";
