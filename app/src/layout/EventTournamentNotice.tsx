"use client";

import { api } from "@/app/_trpc/client";
import Link from "@/layout/Link";
import { useUserData } from "@/utils/UserContext";

/** Persistent ready-check prompt also reaches participants away from the tournament page. */
export const EventTournamentNotice = () => {
  const { data: user } = useUserData();
  const { data } = api.tournament.getEventNotices.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 15000,
  });
  if (!data?.length) return null;
  return (
    <aside
      aria-label="Tournament notifications"
      className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-lg space-y-2 rounded-lg border border-orange-500 bg-background p-3 shadow-xl md:bottom-4"
    >
      {data.map((notice) => (
        <Link
          className="block text-sm"
          key={notice.tournamentId}
          href={`/tournaments/${notice.tournamentId}`}
        >
          <b>
            {notice.message}: {notice.name}
          </b>
          <span className="block text-orange-500 underline">
            Respond by {new Date(notice.deadline).toLocaleString()}
          </span>
        </Link>
      ))}
    </aside>
  );
};
