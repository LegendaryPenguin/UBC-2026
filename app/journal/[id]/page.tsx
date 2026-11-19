import { redirect } from "next/navigation";

export default function JournalEntryRoute({ params }: { params: { id: string } }) {
  redirect(`/positions/${encodeURIComponent(params.id)}?tab=thesis`);
}
