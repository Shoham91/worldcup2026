import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  const links = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/groups", label: "Group Standings" },
    { href: "/admin/group-matches", label: "Group Scores" },
    { href: "/admin/ko/R32", label: "Knockout" },
    { href: "/admin/picks", label: "Edit Picks" },
    { href: "/admin/specials", label: "Specials" },
    { href: "/dashboard", label: "← Player view" },
  ];
  return (
    <>
      <header className="border-b border-amber-200 bg-amber-50">
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <span className="font-extrabold text-amber-800">⚙️ Admin</span>
          <div className="flex flex-wrap items-center gap-1 text-sm">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-1.5 font-medium text-amber-800 hover:bg-amber-100"
              >
                {l.label}
              </Link>
            ))}
            <form action={logout}>
              <button className="rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100">
                Log out
              </button>
            </form>
          </div>
        </nav>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </>
  );
}
