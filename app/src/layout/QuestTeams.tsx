"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QUEST_PARTY_MAX_MEMBERS } from "@/drizzle/constants";
import Link from "@/layout/Link";
import Loader from "@/layout/Loader";
import { TeamChatPanel } from "@/layout/TeamChatPanel";
import { useRequiredUserData } from "@/utils/UserContext";

/** Quest-specific creation/join controls when embedded; full roster and chat otherwise. */
export const QuestTeams = ({
  questId,
  teamEnabled = true,
}: {
  questId?: string;
  teamEnabled?: boolean;
}) => {
  const { data: user, updateUser } = useRequiredUserData();
  const utils = api.useUtils();
  const [isPublic, setIsPublic] = useState(false);
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const { data, error, isPending } = api.questParty.overview.useQuery(undefined, {
    enabled: !!user && teamEnabled,
    // Shared progress needs frequent updates; team and invitation discovery can poll less often.
    refetchInterval: (query) => (query.state.data?.current ? 5000 : 30000),
  });
  const refresh = async (result: { success: boolean; message: string }) => {
    setMessage(result.message);
    if (result.success)
      await Promise.all([
        utils.questParty.overview.invalidate(),
        utils.quests.specificQuests.invalidate(),
        updateUser(undefined),
      ]);
  };
  const onError = (error: { message: string }) => setMessage(error.message);
  const create = api.questParty.create.useMutation({ onSuccess: refresh, onError });
  const join = api.questParty.join.useMutation({ onSuccess: refresh, onError });
  const leave = api.questParty.leave.useMutation({ onSuccess: refresh, onError });
  const invite = api.questParty.invite.useMutation({ onSuccess: refresh, onError });
  const disband = api.questParty.disband.useMutation({ onSuccess: refresh, onError });
  const start = api.questParty.startEncounter.useMutation({
    onSuccess: refresh,
    onError,
  });
  const busy =
    disband.isPending ||
    create.isPending ||
    join.isPending ||
    leave.isPending ||
    invite.isPending ||
    start.isPending;
  const previousTeamVersion = useRef<string | null>(null);
  const teamVersion = data?.current
    ? `${data.current.id}:${data.current.version}`
    : null;
  // Overview updates carry shared progress; refresh the personal projection and receipts too.
  useEffect(() => {
    if (questId && data?.current?.questId !== questId) return;
    if (
      previousTeamVersion.current &&
      teamVersion &&
      previousTeamVersion.current !== teamVersion
    )
      void updateUser(undefined).catch(onError);
    previousTeamVersion.current = teamVersion;
  }, [teamVersion, questId, data?.current?.questId, updateUser]);
  if (!teamEnabled) return null;
  if (!user) return <Loader explanation="Loading quest teams..." />;
  const current = data?.current;
  if (questId && current)
    return current.questId === questId ? (
      <p className="p-3 text-sm">
        Shared with your quest team.{" "}
        <Link href="/questteams" className="underline">
          Open team and chat on the Quest Teams page
        </Link>
        .
      </p>
    ) : null;
  return (
    <section
      className="m-3 space-y-3 rounded-lg border bg-popover p-3"
      aria-label="Quest teams"
    >
      <h3 className="font-bold">Quest Teams</h3>
      <p className="text-muted-foreground text-sm">
        Up to {QUEST_PARTY_MAX_MEMBERS} players share every objective. Join mid-quest or
        help friends. Each eligible player claims the full reward; previously completed
        helpers receive no quest rewards. The leader chooses dialog branches. Gather on
        the same tile for battles.
      </p>
      {isPending && <p>Loading quest teams...</p>}
      {(message || error) && (
        <p role="status" className="text-sm">
          {message || error?.message}
        </p>
      )}
      {!current && questId && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
            />
            Public team
          </label>
          <Button
            disabled={busy || isPending}
            onClick={() => create.mutate({ questId, isPublic })}
          >
            {create.isPending ? "Forming..." : "Form Quest Team"}
          </Button>
          <span className="text-muted-foreground text-xs">
            Private teams require an invitation.
          </span>
        </div>
      )}
      {current && !questId && (
        <div className="space-y-3">
          <h4 className="font-semibold">
            {current.name} · {current.isPublic ? "Public" : "Private"} team
          </h4>
          <ul className="space-y-1 text-sm">
            {current.members.map((member) => (
              <li key={member.userId}>
                {member.username}
                {member.userId === current.leaderId ? " (Leader)" : ""} ·{" "}
                {member.status} · Sector {member.sector}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-sm">
            {current.members.length} / {QUEST_PARTY_MAX_MEMBERS} members. Leaving
            transfers leadership and keeps progress for the team.
          </p>
          {current.completed && (
            <p role="status" className="text-sm">
              Team quest complete. Each eligible member can claim their rewards in the
              Logbook.
            </p>
          )}
          {current.failed && (
            <p role="status" className="text-sm">
              The team failed this quest. Leave the team to start another attempt.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy || !!current.battleId}
              onClick={() => leave.mutate({ partyId: current.id })}
            >
              Leave Team
            </Button>
            {current.battleId && (
              <Link href="/combat" className="underline">
                Open team battle
              </Link>
            )}
            {current.leaderId === user.userId &&
              !current.completed &&
              !current.failed && (
                <Button
                  disabled={busy || !!current.battleId}
                  onClick={() => start.mutate({ partyId: current.id })}
                >
                  {start.isPending ? "Starting..." : "Start Team Encounter"}
                </Button>
              )}
          </div>
          {current.leaderId === user.userId && (
            <Button
              variant="outline"
              disabled={busy || !!current.battleId}
              onClick={() => disband.mutate({ partyId: current.id })}
            >
              Disband Team
            </Button>
          )}
          {current.leaderId === user.userId &&
            !current.completed &&
            !current.failed && (
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  invite.mutate({ partyId: current.id, username });
                }}
              >
                <Input
                  aria-label="Player username"
                  placeholder="Player username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
                <Button disabled={busy || !username.trim()}>Invite</Button>
              </form>
            )}
          <TeamChatPanel conversationId={current.id} title="Quest Team Chat" />
        </div>
      )}
      {!current &&
        data?.teams
          .filter((team) => !questId || team.questId === questId)
          .map((team) => (
            <div
              key={team.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm"
            >
              <span>
                {team.name} · {team.members.map((member) => member.username).join(", ")}{" "}
                · {team.members.length}/{QUEST_PARTY_MAX_MEMBERS}
                {team.invited ? " · Invited" : ""}
              </span>
              <Button
                size="sm"
                disabled={
                  busy ||
                  !!team.battleId ||
                  team.members.length >= QUEST_PARTY_MAX_MEMBERS
                }
                onClick={() => join.mutate({ partyId: team.id })}
              >
                {team.invited ? "Accept Invitation" : "Join Team"}
              </Button>
            </div>
          ))}
      {!questId && !current && data?.teams.length === 0 && (
        <p className="text-sm">
          No public teams or invitations. Form a team from a team-enabled quest.
        </p>
      )}
    </section>
  );
};
