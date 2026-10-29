"use client";

import { useEffect, useRef } from "react";

// Scrollable, rounded container for a table. Starts pinned to the BOTTOM so the
// latest games are in view; scroll up for earlier ones. The table's own sticky
// header/columns stick relative to this box.
export default function StickyTableScroll({
  maxHeight,
  children,
}: {
  maxHeight: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  return (
    <div
      ref={ref}
      style={{ maxHeight }}
      className="overflow-auto rounded-xl border border-slate-200 bg-white"
    >
      {children}
    </div>
  );
}
