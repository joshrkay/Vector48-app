export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand">
      <div className="w-full max-w-md rounded-2xl bg-surface p-8 shadow-xl">
        {children}
      </div>
    </div>
  );
}
