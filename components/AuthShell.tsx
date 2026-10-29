export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-600 via-emerald-700 to-sky-800 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="text-4xl">🌍⚽</div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight">
            World Cup 2026 Pool
          </h1>
          <p className="text-sm text-emerald-100">Office prediction league</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <h2 className="mb-1 text-lg font-bold text-slate-900">{title}</h2>
          <p className="mb-5 text-sm text-slate-500">{subtitle}</p>
          {children}
        </div>
      </div>
    </main>
  );
}
