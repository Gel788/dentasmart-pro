import { redirect } from 'next/navigation';

/** The old visit screen: every link now lands on the one visit screen at /visits/:id. */
export default async function OldVisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/visits/${id}`);
}
