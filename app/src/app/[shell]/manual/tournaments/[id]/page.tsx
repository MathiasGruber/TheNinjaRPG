import { EventTournaments } from "@/layout/EventTournaments";
/** Resolve the event route and render its authenticated staff management view. */
export default async function StaffTournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EventTournaments tournamentId={id} staff />;
}
