"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions/auth";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠", short: "Home" },
  { href: "/today", label: "Today", icon: "⚡", short: "Today" },
  { href: "/leaderboard", label: "Leaderboard", icon: "🏆", short: "Board" },
  { href: "/predictions", label: "Predictions", icon: "👀", short: "Picks" },
  { href: "/bracket", label: "Tournament", icon: "🌍", short: "Cup" },
  { href: "/rules", label: "Rules", icon: "📖", short: "Rules" },
];

export default function Nav({
  name,
  isAdmin,
}: {
  name: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/dashboard" className="font-extrabold tracking-tight">
            🌍⚽ <span className="hidden sm:inline">WC2026 Pool</span>
          </Link>
          {/* Desktop links — on mobile the bottom tab bar takes over */}
          <div className="hidden items-center gap-1 text-sm md:flex">
            {LINKS.map((l) => {
              const active = isActive(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "rounded-md bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700"
                      : "rounded-md px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }
                >
                  {l.label}
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                href="/admin"
                className="rounded-md px-3 py-1.5 font-medium text-amber-700 hover:bg-amber-50"
              >
                Admin
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Link
                href="/admin"
                className="rounded-md px-2 py-1.5 text-sm font-medium text-amber-700 md:hidden"
              >
                ⚙️
              </Link>
            )}
            <span className="hidden text-sm text-slate-500 sm:inline">{name}</span>
            <form action={logout}>
              <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
                Log out
              </button>
            </form>
          </div>
        </nav>
      </header>

      {/* Mobile bottom tab bar — app-style navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="grid grid-cols-6">
          {LINKS.map((l) => {
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2 ${
                  active ? "text-emerald-700" : "text-slate-600 hover:text-emerald-700"
                }`}
              >
                {active && (
                  <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-emerald-600" />
                )}
                <span className="text-xl leading-none">{l.icon}</span>
                <span className={`text-[11px] ${active ? "font-semibold" : "font-medium"}`}>
                  {l.short}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
