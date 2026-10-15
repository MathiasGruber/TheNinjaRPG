import { EventTournaments } from "@/layout/EventTournaments";
export default async function TournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EventTournaments tournamentId={id} />;
}
