"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { api } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import {
  DUNGEON_FLOORS_PER_TIER,
  DUNGEON_INACTIVE_ROUNDS,
  DUNGEON_PARTY_SIZE,
  DUNGEON_RUN_SECONDS,
} from "@/drizzle/constants";
import ContentBox from "@/layout/ContentBox";
import Countdown from "@/layout/Countdown";
import Link from "@/layout/Link";
import Loader from "@/layout/Loader";
import { PartyRoster } from "@/layout/PartyRoster";
import UserSearchSelect from "@/layout/UserSearchSelect";
import { showMutationToast } from "@/libs/toast";
import { pushToCombat } from "@/utils/routing";
import { useRequiredUserData } from "@/utils/UserContext";
import { getSearchValidator } from "@/validators/register";

/** Show invitations, party readiness and completion claims through the authenticated dungeon router. */
export default function DungeonPage() {
  const { data: user } = useRequiredUserData();
  const router = useRouter();
  const utils = api.useUtils();
  const [message, setMessage] = useState("");
  const form = useForm({
    resolver: zodResolver(getSearchValidator({ max: 1 })),
    defaultValues: { username: "", users: [] },
  });
  const selected = useWatch({ control: form.control, name: "users" });
  const available = api.coop.dungeon.getAvailable.useQuery(
    { sector: user?.sector ?? 1 },
    {
      enabled: !!user,
      refetchInterval: 10_000,
      refetchIntervalInBackground: false,
    },
  );
  const state = api.coop.dungeon.getState.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 3000,
  });
  /** Show expected rejections beside the action and refresh party/account state after a mutation. */
  const refresh = async (response: { success: boolean; message: string }) => {
    setMessage(response.message);
    showMutationToast(response);
    await Promise.all([state.refetch(), utils.profile.getUser.invalidate()]);
  };
  const create = api.coop.dungeon.create.useMutation({
    onSuccess: refresh,
    onError: (e) => setMessage(e.message),
  });
  const act = api.coop.dungeon.act.useMutation({
    onSuccess: refresh,
    onError: (e) => setMessage(e.message),
  });
  const claim = api.coop.dungeon.claim.useMutation({
    onSuccess: refresh,
    onError: (e) => setMessage(e.message),
  });
  const runs = state.data?.runs ?? [];
  const current = runs.find(
    (r) =>
      r.state.memberIds.includes(user?.userId ?? "") &&
      !["ENDED", "COMPLETED"].includes(r.status),
  );
  const battleId = current?.status === "FIGHTING" ? current.battleId : null;
  useEffect(() => {
    if (battleId) pushToCombat(router, battleId);
  }, [battleId, router]);
  const pending = create.isPending || act.isPending || claim.isPending;
  const action = (
    id: string,
    action: Parameters<typeof act.mutate>[0]["action"],
    userId?: string,
  ) => act.mutate({ id, action, userId });
  if (state.error)
    return (
      <ContentBox title="Dungeon Pyramids" defaultBackHref="/travel">
        <p role="alert">{state.error.message}</p>
        <Button onClick={() => void state.refetch()}>Retry</Button>
      </ContentBox>
    );
  if (!user || state.isPending) return <Loader explanation="Loading dungeon parties" />;
  return (
    <ContentBox
      title="Dungeon Pyramids"
      subtitle="Three-player co-op"
      defaultBackHref="/travel"
    >
      <p className="mb-4">
        Gather {DUNGEON_PARTY_SIZE} players and clear every floor within{" "}
        {DUNGEON_RUN_SECONDS / 60} minutes. The timer starts at first entry and keeps
        running while paused. Each floor restores the whole party. Fleeing is disabled;{" "}
        {DUNGEON_INACTIVE_ROUNDS} inactive rounds end the run.
      </p>
      {message && (
        <p role="status" className="mb-4 rounded border p-3">
          {message}
        </p>
      )}
      {runs
        .filter((r) => r.status === "LOBBY" && r.state.invitedIds.includes(user.userId))
        .map((run) => (
          <div key={run.id} className="mb-4 rounded border p-4">
            <p>
              You were invited to <b>{run.content.name}</b> by{" "}
              {state.data?.users.find((u) => u.userId === run.leaderId)?.username}.
            </p>
            <div className="mt-2 flex gap-2">
              <Button disabled={pending} onClick={() => action(run.id, "accept")}>
                Accept invitation
              </Button>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => action(run.id, "decline")}
              >
                Decline
              </Button>
            </div>
          </div>
        ))}
      {current && (
        <div className="space-y-4 rounded border p-4">
          <div>
            <h2 className="font-bold text-xl">{current.content.name}</h2>
            <p>{current.content.description}</p>
            <p>
              Tier {Math.floor(current.state.floor / DUNGEON_FLOORS_PER_TIER) + 1} ·
              Floor {(current.state.floor % DUNGEON_FLOORS_PER_TIER) + 1} ·{" "}
              {current.status.toLowerCase()}
            </p>
            <p>
              {current.expiresAt ? (
                <>
                  Time remaining:{" "}
                  <Countdown
                    targetDate={current.expiresAt}
                    timeDiff={
                      Date.now() - (state.data?.serverTime.getTime() ?? Date.now())
                    }
                    onFinish={() => void state.refetch()}
                  />
                </>
              ) : (
                "The one-hour timer starts when the party enters the first floor."
              )}
            </p>
            <p>{current.state.message}</p>
          </div>
          <PartyRoster
            members={current.state.memberIds.map((id) => ({
              userId: id,
              username: state.data?.users.find((u) => u.userId === id)?.username ?? id,
              details: current.state.readyIds.includes(id) ? "Ready" : "Not ready",
            }))}
            leaderId={current.leaderId}
            viewerId={user.userId}
            disabled={pending}
            onRemove={
              current.status === "LOBBY"
                ? (id) => action(current.id, "remove", id)
                : undefined
            }
          />
          {current.state.invitedIds.map((id) => (
            <div key={id} className="flex items-center justify-between">
              <span>
                {state.data?.users.find((u) => u.userId === id)?.username} · Invited
              </span>
              {current.leaderId === user.userId && current.status === "LOBBY" && (
                <Button
                  disabled={pending}
                  variant="secondary"
                  onClick={() => action(current.id, "remove", id)}
                >
                  Cancel invitation
                </Button>
              )}
            </div>
          ))}
          {current.status === "LOBBY" &&
            current.leaderId === user.userId &&
            current.state.memberIds.length + current.state.invitedIds.length <
              DUNGEON_PARTY_SIZE && (
              <div>
                <UserSearchSelect
                  useFormMethods={form}
                  showYourself={false}
                  showAi={false}
                  maxUsers={1}
                />
                <Button
                  className="mt-2"
                  disabled={pending || !selected[0]}
                  onClick={() => {
                    const target = selected[0];
                    if (target) action(current.id, "invite", target.userId);
                  }}
                >
                  Invite selected player
                </Button>
              </div>
            )}
          <div className="flex flex-wrap gap-2">
            {["LOBBY", "BETWEEN"].includes(current.status) && (
              <Button
                disabled={pending}
                onClick={() =>
                  action(
                    current.id,
                    current.state.readyIds.includes(user.userId) ? "unready" : "ready",
                  )
                }
              >
                {current.state.readyIds.includes(user.userId) ? "Not ready" : "Ready"}
              </Button>
            )}
            {current.leaderId === user.userId &&
              ["LOBBY", "BETWEEN"].includes(current.status) && (
                <Button
                  disabled={
                    pending ||
                    current.state.memberIds.length !== DUNGEON_PARTY_SIZE ||
                    current.state.memberIds.some(
                      (id) => !current.state.readyIds.includes(id),
                    )
                  }
                  onClick={() => action(current.id, "start")}
                >
                  Enter next floor
                </Button>
              )}
            {current.leaderId === user.userId && current.status === "BETWEEN" && (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => action(current.id, "pause")}
              >
                Pause dungeon
              </Button>
            )}
            {current.leaderId === user.userId && current.status === "PAUSED" && (
              <Button disabled={pending} onClick={() => action(current.id, "resume")}>
                Resume and ready up
              </Button>
            )}
            {current.status !== "FIGHTING" && (
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => action(current.id, "leave")}
              >
                {current.status === "LOBBY" ? "Leave lobby" : "Abandon dungeon"}
              </Button>
            )}
          </div>
        </div>
      )}
      {runs
        .filter(
          (r) => r.status === "COMPLETED" && r.state.memberIds.includes(user.userId),
        )
        .map((run) => {
          const receipt = state.data?.members.find((m) => m.runId === run.id)?.reward;
          return (
            <div key={run.id} className="my-4 rounded border p-4">
              <h2 className="font-bold text-xl">{run.content.name} · Completed</h2>
              <p>All {run.state.clearedFloors.length} floors cleared!</p>
              <p>
                {run.content.rewards.money} Ryo · {run.content.rewards.experience} Exp ·{" "}
                {run.content.rewards.tokens} village tokens ·{" "}
                {run.content.rewards.prestige} prestige
              </p>
              {receipt ? (
                <p role="status">
                  Rewards delivered. {receipt.items.length} item drops ·{" "}
                  {receipt.jutsus.length} jutsu drops.
                </p>
              ) : (
                <Button disabled={pending} onClick={() => claim.mutate({ id: run.id })}>
                  Claim completion rewards
                </Button>
              )}
            </div>
          );
        })}
      {runs
        .filter((r) => r.status === "ENDED")
        .slice(0, 1)
        .map((run) => (
          <p key={run.id} className="my-4">
            {run.content.name}: {run.state.message}
          </p>
        ))}
      {/* Entrance lookups must not block party controls or completion claims. */}
      {!current && (
        <div className="mt-4 space-y-3">
          <h2 className="font-bold text-lg">Dungeons in your sector</h2>
          {available.error ? (
            <p role="alert">
              {available.error.message}{" "}
              <Button onClick={() => void available.refetch()}>Retry</Button>
            </p>
          ) : available.isPending ? (
            <Loader explanation="Loading dungeon entrances" />
          ) : available.data?.length === 0 ? (
            <p>
              No dungeon entrances are available here.{" "}
              <Link href="/travel">Explore another sector.</Link>
            </p>
          ) : (
            available.data?.map((d) => (
              <div className="rounded border p-4" key={d.id}>
                <h3 className="font-bold">{d.content.name}</h3>
                <p>{d.content.description}</p>
                <p>
                  {d.content.tiers.length} tiers · {d.content.tiers.flat().length}{" "}
                  floors · Background: {d.content.background}
                </p>
                <p>
                  {d.content.rewards.money} Ryo · {d.content.rewards.experience} Exp ·{" "}
                  {d.content.rewards.tokens} tokens · {d.content.rewards.prestige}{" "}
                  prestige
                </p>
                <Button
                  className="mt-2"
                  disabled={pending}
                  onClick={() => create.mutate({ id: d.id })}
                >
                  Create lobby
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </ContentBox>
  );
}
