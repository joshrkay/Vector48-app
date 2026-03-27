export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--brand)]">
      <span className="font-heading font-bold text-2xl text-white text-center mb-8">
        Vector 48
      </span>
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl mx-4">
        {children}
      </div>
    </div>
  );
}
