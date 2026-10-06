"use client";
import { Select } from "@/components/ui/Select";
import { EmailStatus } from "@/components/auth/EmailStatus";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardHeader,
  Disclaimer,
  PageTitle,
  Pill,
  Skeleton,
  cx,
} from "@/components/ui/primitives";
import { Avatar } from "@/components/ui/Avatar";
import { useOptionalAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { PasswordForm } from "@/components/auth/PasswordForm";
import { longDate } from "@/lib/format";
import type { UserProfile } from "@/lib/types";
import { signOutDemo, USE_MOCKS } from "@/lib/api";

const TIMEZONES = [
  { id: "Asia/Jakarta", label: "Asia/Jakarta (WIB)" },
  { id: "Asia/Makassar", label: "Asia/Makassar (WITA)" },
  { id: "Asia/Jayapura", label: "Asia/Jayapura (WIT)" },
  { id: "Asia/Singapore", label: "Asia/Singapore (SGT)" },
  { id: "UTC", label: "UTC" },
];

export default function ProfilePage() {
  const auth = useOptionalAuth();
  const {
    profile,
    updateProfile,
    profileEdited,
    signals,
    watchlist,
    lastCheckedAt,
    loading,
    resetDemoState,
  } = useStore();

  const [draft, setDraft] = useState<UserProfile>(profile);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setDraft(profile);
    setError(null);
    setSaved(false);
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const problem = await updateProfile(draft);
    setSaving(false);
    setError(problem);
    if (!problem) {
      setEditing(false);
      setSaved(true);
    }
  };

  // Account identity loads before the workspace; feed cards wait for data.
  const seenCount = signals.filter((s) => s.seen).length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageTitle>Profile</PageTitle>
          <p className="mt-0.5 text-sm text-muted">
            Who you are in this workspace. Agent behaviour lives in{" "}
            <Link
              href="/settings"
              className="font-semibold text-accent-ink no-underline transition-console hover:text-accent"
            >
              Settings
            </Link>
            .
          </p>
        </div>
        {saved ? <Pill tone="neutral">Saved</Pill> : null}
      </div>

      {/* Identity */}
      <Card className="min-w-0">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={profile.name} size="xl" />
          <div className="min-w-0 flex-1 basis-60">
            <p className="text-2xl font-extrabold tracking-[-0.03em]">
              {profile.name}
            </p>
            <p className="mt-1.5 text-[13px] text-muted">{profile.email}</p>
          </div>
          {!editing ? (
            <Button onClick={startEditing}>Edit profile</Button>
          ) : null}
        </div>
      </Card>

      {editing ? (
        <Card className="min-w-0">
          <CardHeader title="Edit profile" />
          <form onSubmit={save} className="flex flex-col gap-3.5">
            <Field
              label="Display name"
              value={draft.name}
              onChange={(v) => setDraft((d) => ({ ...d, name: v }))}
              autoFocus
            />
            <Field
              label="Work email"
              type="email"
              value={draft.email}
              onChange={(v) => setDraft((d) => ({ ...d, email: v }))}
              readOnly={Boolean(auth)}
            />

            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-ink-2">
                Timezone
              </span>
              <Select label="Timezone" value={draft.timezone} onChange={(timezone) => setDraft((d) => ({ ...d, timezone }))} options={TIMEZONES.map((tz) => ({ value: tz.id, label: tz.label }))} />
              <span className="text-[13px] text-muted">
                Run times and signal timestamps are shown in this zone.
              </span>
            </label>

            {error ? (
              <p
                role="alert"
                className="rounded-field border border-accent-wash-border bg-accent-wash px-3.5 py-2.5 text-[13px] text-accent-ink"
              >
                {error}
              </p>
            ) : null}

            <div className="mt-1 flex flex-wrap gap-2.5 border-t border-divider pt-4">
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button type="button" disabled={saving} onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-stretch gap-4">
        {loading ? (
          <>
            <Skeleton className="h-56 flex-[1.2_1_340px] rounded-card" />
            <Skeleton className="h-56 flex-[1_1_280px] rounded-card" />
          </>
        ) : (
          <>
            {/* Workspace facts */}
            <Card className="min-w-0 flex-[1.2_1_340px]">
              <CardHeader title="Workspace" />
              <dl className="flex flex-col">
                <Row label="Workspace" value={profile.workspace} />
                <Row
                  label="Active watchlist"
                  value={
                    watchlist
                      ? `${watchlist.name} · ${watchlist.companies.length} companies`
                      : "—"
                  }
                />
                <Row
                  label="Timezone"
                  value={
                    TIMEZONES.find((t) => t.id === profile.timezone)?.label ??
                    profile.timezone
                  }
                />
                <Row
                  label={auth || USE_MOCKS ? "Member since" : "Profile storage"}
                  value={auth || USE_MOCKS ? longDate(profile.joinedAt) : "This browser only"}
                  last
                />
              </dl>
            </Card>

            {/* Activity — derived, never invented */}
            <Card className="min-w-0 flex-[1_1_280px]">
              <CardHeader title="Your activity" />
              <dl className="flex flex-col gap-3">
                <Stat label="Signals reviewed" value={String(seenCount)} />
                <Stat label="Signals in feed" value={String(signals.length)} />
                <Stat
                  label="Last checked"
                  value={
                    lastCheckedAt
                      ? new Date(lastCheckedAt).toLocaleString("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: profile.timezone,
                        })
                      : "No research reviewed yet"
                  }
                  small
                />
              </dl>
            </Card>
          </>
        )}
      </div>

      <Card className="min-w-0">
        <CardHeader title="Session" />
        <p className="max-w-[60ch] text-sm leading-[1.55] text-ink-2">
          {auth ? "Your profile and conversations are saved to your account. Signing out ends this session; your research remains in your workspace." : "This is an explicit demo session. Display profile changes are saved in this browser."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5 border-t border-divider pt-4">
          <SignOutButton />
          {profileEdited ? (
            <Button onClick={resetDemoState}>Reset to default profile</Button>
          ) : null}
        </div>
      </Card>

      {auth && <EmailStatus />}
      {auth && <PasswordForm />}
      <Disclaimer />
    </>
  );
}

function SignOutButton() {
  const auth = useOptionalAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (auth) { await auth.logout(); return; }
      await signOutDemo();
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Could not sign out. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <Button variant="dark" onClick={() => { void signOut(); }} disabled={busy}>Sign out</Button>
      {error ? <p role="alert" className="text-xs text-accent-ink">{error}</p> : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  hint,
  autoFocus,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  hint?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-ink-2">{label}</span>
      <input
        type={type}
        value={value}
        autoFocus={autoFocus}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-field border border-border bg-subtle px-3.5 py-2.5 text-sm text-ink outline-none transition-console focus:border-accent focus:bg-card"
      />
      {hint ? <span className="text-[13px] text-muted">{hint}</span> : null}
    </label>
  );
}

function Row({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-baseline gap-3 py-3.5",
        !last && "border-b border-divider",
      )}
    >
      <dt className="w-[150px] shrink-0 text-[13px] text-muted">{label}</dt>
      <dd className="min-w-0 flex-[1_1_180px] text-[15px] font-bold leading-[1.35]">
        {value}
      </dd>
    </div>
  );
}

function Stat({
  label,
  value,
  small = false,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div>
      <dd
        className={cx(
          "font-extrabold tracking-[-0.03em]",
          small ? "text-[15px]" : "text-[26px]",
        )}
      >
        {value}
      </dd>
      <dt className="text-xs text-muted">{label}</dt>
    </div>
  );
}
