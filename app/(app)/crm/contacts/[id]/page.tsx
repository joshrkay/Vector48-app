export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold">Contact Detail</h1>
      <p className="mt-2 text-sm text-text-secondary">Coming soon ({id})</p>
    </div>
  );
}
