"use client";

import { useCallback, useEffect, useState } from "react";
import { getAlertStatus } from "./api";
import type { AlertStatus } from "./types";

export function useAlertStatus() {
  const [status, setStatus] = useState<AlertStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    getAlertStatus().then((result) => {
      if (active) setStatus(result);
    }).catch(() => {
      if (active) setError("We couldn’t check email delivery. Try again to view its current status.");
    });
    return () => { active = false; };
  }, [attempt]);

  const retry = useCallback(() => {
    setStatus(null);
    setError(null);
    setAttempt((value) => value + 1);
  }, []);

  return { status, error, loading: !status && !error, retry };
}
