"use client";

import { useState } from "react";
import { api } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  VILLAGE_MAINTAINED_STRUCTURE_ROUTES,
  VILLAGE_MISSION_RANK_POINTS,
  VILLAGE_STRUCTURE_MONTHLY_COST,
} from "@/drizzle/constants";
import Confirm from "@/layout/Confirm";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { showMutationToast } from "@/libs/toast";
import { parseHtml } from "@/utils/parse";
import { objectiveImageMap } from "@/validators/objectives";

export const VillageMission = ({
  villageId,
  navTabs,
}: {
  villageId: string;
  navTabs: React.ReactNode;
}) => {
  const utils = api.useUtils();
  const [message, setMessage] = useState("");
  const { data, isPending, isError, refetch } = api.villageMission.get.useQuery(
    { id: villageId },
    { enabled: !!villageId, refetchInterval: 15000 },
  );
  const onSuccess = async (result: { success: boolean; message: string }) => {
    setMessage(result.message ?? "");
    showMutationToast(result);
    if (result.success)
      await Promise.all([
        refetch(),
        utils.village.get.invalidate(),
        utils.profile.getUser.invalidate(),
      ]);
  };
  const onError = (error: { message: string }) => setMessage(error.message);
  const select = api.villageMission.select.useMutation({ onSuccess, onError });
  const claim = api.villageMission.claim.useMutation({ onSuccess, onError });
  const mission = data?.mission;
  const isBusy = select.isPending || claim.isPending;

  return (
    <ContentBox
      title="Town Hall"
      subtitle="Village Mission"
      defaultBackHref="/village"
      topRightContent={navTabs}
    >
      <p className="mb-3">
        Work together with your village to complete every objective. The Kage selects a
        random mission, can reroll it once, and claims tokens for the village when it is
        complete.
      </p>
      {isPending ? (
        <Loader explanation="Loading Village Mission" />
      ) : isError ? (
        <div>
          <p>Could not load the Village Mission.</p>
          <Button onClick={() => void refetch()}>Try again</Button>
        </div>
      ) : !data ? (
        <p>Village Missions are available to members of a village.</p>
      ) : !mission ? (
        <div className="space-y-3">
          <p>No Village Mission is active.</p>
          {data.isKage ? (
            <Button disabled={isBusy} onClick={() => select.mutate({ villageId })}>
              {isBusy ? "Selecting..." : "Select random mission"}
            </Button>
          ) : (
            <p className="text-muted-foreground">
              Your Kage can select the village&apos;s next mission.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <h3 className="font-bold text-lg">{mission.name}</h3>
            <div>{parseHtml(mission.description ?? "")}</div>
            <p className="font-semibold">
              Reward: {mission.rewardTokens.toLocaleString()} village tokens
            </p>
          </div>
          {mission.objectives.map((objective) => (
            <div key={objective.id} className="space-y-1 rounded border p-3">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold">
                  {objectiveImageMap[objective.task].title}
                </span>
                <span>
                  {objective.current.toLocaleString()} /{" "}
                  {objective.value.toLocaleString()}
                </span>
              </div>
              {objective.description && (
                <div className="text-sm">{parseHtml(objective.description)}</div>
              )}
              <Progress
                value={(100 * objective.current) / objective.value}
                aria-label={objectiveImageMap[objective.task].title}
              />
              {objective.task === "combined_mission_effort" && (
                <p className="text-muted-foreground text-sm">
                  Completed missions:{" "}
                  {Object.entries(VILLAGE_MISSION_RANK_POINTS)
                    .map(
                      ([rank, points]) =>
                        `${rank}-rank ${points} point${points === 1 ? "" : "s"}`,
                    )
                    .join(" · ")}
                </p>
              )}
              {objective.task === "siege_operation" && (
                <p className="text-muted-foreground text-sm">
                  Damage dealt to enemy shrines by villagers during war.
                </p>
              )}
            </div>
          ))}
          {data.isKage && (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={isBusy || !mission.completed}
                onClick={() => claim.mutate({ villageId, missionId: mission.id })}
              >
                {claim.isPending ? "Claiming..." : "Claim village tokens"}
              </Button>
              {!mission.rerolled && !isBusy && (
                <Confirm
                  title="Reroll Village Mission"
                  proceed_label="Reroll"
                  onAccept={() => select.mutate({ villageId, missionId: mission.id })}
                  button={<Button variant="outline">Reroll once</Button>}
                >
                  <p>
                    This replaces the current mission with a different random mission
                    and resets shared progress. Each mission can only be rerolled once.
                  </p>
                </Confirm>
              )}
              {mission.rerolled && (
                <p className="text-muted-foreground text-sm">
                  Reroll used for this mission.
                </p>
              )}
            </div>
          )}
          {mission.completed && (
            <p className="font-semibold text-green-600">
              Every objective is complete.{" "}
              {data.isKage
                ? "Claim the village's reward."
                : "Your Kage can claim the village's reward."}
            </p>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm">
          {message}
        </p>
      )}
    </ContentBox>
  );
};

export const VillageStructureMaintenance = ({ villageId }: { villageId: string }) => {
  const utils = api.useUtils();
  const [message, setMessage] = useState("");
  const { data, isPending, isError, refetch } = api.village.get.useQuery(
    { id: villageId },
    { enabled: !!villageId },
  );
  const pay = api.kage.payStructureMaintenance.useMutation({
    onSuccess: async (result) => {
      setMessage(result.message ?? "");
      showMutationToast(result);
      if (result.success)
        await Promise.all([
          utils.village.get.invalidate(),
          utils.profile.getUser.invalidate(),
        ]);
    },
    onError: (error) => setMessage(error.message),
  });
  const village = data?.villageData;
  const count =
    village?.structures.filter(
      (structure) =>
        structure.level > 0 &&
        (VILLAGE_MAINTAINED_STRUCTURE_ROUTES as readonly string[]).includes(
          structure.route,
        ),
    ).length ?? 0;
  const monthlyCost = count * VILLAGE_STRUCTURE_MONTHLY_COST;
  return (
    <ContentBox title="Structure Maintenance" initialBreak>
      {isPending ? (
        <Loader explanation="Loading maintenance" />
      ) : isError ? (
        <Button onClick={() => void refetch()}>Retry maintenance details</Button>
      ) : (
        village && (
          <div className="space-y-2">
            <p>
              {count} structures × {VILLAGE_STRUCTURE_MONTHLY_COST.toLocaleString()} ={" "}
              <strong>{monthlyCost.toLocaleString()} village tokens per month</strong>.
            </p>
            <p className="text-muted-foreground text-sm">
              Billed at the start of each UTC calendar month and paid automatically when
              the village has enough tokens. Unpaid maintenance accumulates and must be
              paid before upgrading structures.
            </p>
            <p>
              Village tokens: {village.tokens.toLocaleString()} · Outstanding
              maintenance: {village.structureMaintenanceDue.toLocaleString()}
            </p>
            {village.structureMaintenanceDue > 0 && (
              <Button
                disabled={
                  pay.isPending || village.tokens < village.structureMaintenanceDue
                }
                onClick={() => pay.mutate({ villageId })}
              >
                {pay.isPending ? "Paying..." : "Pay maintenance"}
              </Button>
            )}
            {message && (
              <p role="status" className="text-sm">
                {message}
              </p>
            )}
          </div>
        )
      )}
    </ContentBox>
  );
};
