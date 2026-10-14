"use client";
import { useState } from "react";
import { api } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import {
  WAR_POINT_CONVERSION_DAYS,
  WAR_POINT_PRESTIGE_RATE,
} from "@/drizzle/constants";
import Link from "@/layout/Link";

export const WarDashboardNotices = () => {
  const [message, setMessage] = useState("");
  const utils = api.useUtils();
  const claims = api.war.getWarPointClaims.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const camps = api.war.getWarCampNotices.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const convert = api.war.convertWarPoints.useMutation({
    onSuccess: (result) => {
      setMessage(result.message);
      void utils.war.getWarPointClaims.invalidate();
      void utils.profile.getUser.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });
  if (!claims.data?.length && !camps.data?.length && !message) return null;
  return (
    <div className="my-3 space-y-2 rounded border p-3">
      {camps.data?.map((camp) => (
        <p key={camp.id}>
          <Link href={`/travel?sector=${camp.sector}`}>
            War camp in sector {camp.sector}
          </Link>{" "}
          — closes {new Date(camp.endsAt).toLocaleString()}
        </p>
      ))}
      {claims.data?.map((claim) => (
        <div
          key={claim.warId}
          className="flex flex-wrap items-center justify-between gap-2"
        >
          <p>
            Convert {claim.points.toLocaleString()} war points to{" "}
            {(claim.points * WAR_POINT_PRESTIGE_RATE).toLocaleString()} prestige before{" "}
            {new Date(
              new Date(claim.endedAt!).getTime() + WAR_POINT_CONVERSION_DAYS * 86400000,
            ).toLocaleString()}
            .
          </p>
          <Button
            disabled={convert.isPending}
            onClick={() => convert.mutate({ warId: claim.warId })}
          >
            Convert all war points
          </Button>
        </div>
      ))}
      {message && <p role="status">{message}</p>}
    </div>
  );
};
