"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-pulls the server-rendered page on an interval so live data (e.g. the
// leaderboard) updates without a manual refresh. Free — just periodic requests.
export default function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
