import Nav from "@/components/Nav";
import { requireUser } from "@/lib/auth";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <>
      <Nav name={user.name} isAdmin={user.isAdmin} />
      {/* extra bottom padding on mobile clears the fixed tab bar */}
      <div className="mx-auto max-w-5xl px-4 py-6 pb-24 md:pb-6">{children}</div>
    </>
  );
}
