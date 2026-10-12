"use client";

import { useState } from "react";
import { api } from "@/app/_trpc/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import Confirm from "@/layout/Confirm";
import Link from "@/layout/Link";
import {
  getIsolatedPyramid,
  hasQuestContentChanged,
  ISOLATED_PYRAMID_MESSAGE,
  isPyramidRestrictedPath,
} from "@/libs/questRun";
import { showMutationToast } from "@/libs/toast";
import { usePublicPathname } from "@/utils/routing";
import { useUserData } from "@/utils/UserContext";

/**
 * Keep the run's return/abandon controls available even when content is hidden or edited.
 * Isolated runs prevent restricted page children from mounting their queries; the server
 * independently enforces the same restriction for stale tabs and direct procedure calls.
 */
export const PyramidRunBoundary = ({ children }: { children: React.ReactNode }) => {
  const { data: user } = useUserData();
  const pathname = usePublicPathname();
  const [message, setMessage] = useState("");
  const utils = api.useUtils();
  const { mutate: abandon, isPending } = api.quests.abandon.useMutation({
    onSuccess: async (result) => {
      showMutationToast(result);
      setMessage(result.success ? "" : result.message);
      if (result.success)
        await Promise.all([
          utils.profile.getUser.invalidate(),
          utils.quests.specificQuests.invalidate(),
        ]);
    },
  });
  const isolated =
    getIsolatedPyramid(user) ??
    user?.userQuests.find(
      (entry) =>
        entry.questType === "battlepyramid" &&
        !entry.endAt &&
        !entry.completed &&
        (entry.quest.hidden || hasQuestContentChanged(entry)),
    );
  if (!isolated) return children;
  const changed = hasQuestContentChanged(isolated);
  const isBlocked = isolated.isolated && isPyramidRestrictedPath(pathname ?? "");
  return (
    <>
      <Alert className="mb-3">
        <AlertTitle>
          {isolated.isolated ? "Isolated Battle Pyramid" : "Battle Pyramid"}:{" "}
          {isolated.quest.name}
        </AlertTitle>
        <AlertDescription>
          {isolated.isolated && <p>{ISOLATED_PYRAMID_MESSAGE}</p>}
          <p>
            Health, chakra and stamina carry between floors. Entry items are consumed at
            the first battle and are not refunded on abandonment.
          </p>
          {isolated.quest.hidden && (
            <p>This Pyramid is hidden. Your run is paused; you can still abandon it.</p>
          )}
          {changed && (
            <p>
              This Pyramid was edited. Abandon this run and start again to use the
              updated content.
            </p>
          )}
          {user?.status === "BATTLE" && (
            <p>Finish or flee the current battle before abandoning this run.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/battlearena">Return to Pyramid</Link>
            </Button>
            <Confirm
              title="Abandon Battle Pyramid?"
              button={
                <Button variant="destructive" size="sm">
                  Abandon Pyramid
                </Button>
              }
              disabled={user?.status === "BATTLE"}
              isLoading={isPending}
              onAccept={() => abandon({ id: isolated.questId })}
            >
              Your progress will be lost. Consumed entry items will not be returned.
            </Confirm>
          </div>
          {message && (
            <p role="alert" className="mt-2 text-destructive">
              {message}
            </p>
          )}
        </AlertDescription>
      </Alert>
      {!isBlocked && children}
    </>
  );
};
