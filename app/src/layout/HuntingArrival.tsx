"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import {
  safeSessionStorageGetItem,
  safeSessionStorageSetItem,
} from "@/hooks/localstorage";
import { HuntingBoard } from "@/layout/HuntingBoard";
import Modal from "@/layout/Modal";
import { useRequiredUserData } from "@/utils/UserContext";

/** Open the personal encounter once per arrival; keep a way to reopen it after dismissal. */
export function HuntingArrival({ blocked = false }: { blocked?: boolean }) {
  const { data: user } = useRequiredUserData();
  const openButton = useRef<HTMLButtonElement>(null);
  const storageKey = `huntingArrival:${user?.userId}`;
  const [dismissed, setDismissed] = useState<string | null>(() =>
    safeSessionStorageGetItem(storageKey),
  );
  const dismiss = (sessionId: string | null) => {
    safeSessionStorageSetItem(storageKey, sessionId ?? "");
    setDismissed(sessionId);
  };
  const encounter = api.hunting.getSession.useQuery(undefined, {
    enabled: user?.occupation === "HUNTER",
    refetchInterval: 5000,
    refetchOnMount: "always",
  });
  const session = encounter.data?.session;
  const isAtEncounter = user?.status === "AWAKE" && user.sector === session?.sector;
  useEffect(() => {
    setDismissed(safeSessionStorageGetItem(storageKey));
  }, [storageKey]);
  useEffect(() => {
    // Combat, sleep and loading do not constitute a new arrival. Only departure resets dismissal.
    if (
      user &&
      (user.status === "TRAVEL" || (session && user.sector !== session.sector))
    ) {
      safeSessionStorageSetItem(storageKey, "");
      setDismissed(null);
    }
  }, [session?.id, session?.sector, user?.sector, user?.status, storageKey]);
  if (user?.occupation !== "HUNTER") return null;
  if (encounter.error)
    return (
      <p role="status">
        Unable to load your hunting contract.{" "}
        <Button variant="outline" onClick={() => void encounter.refetch()}>
          Retry
        </Button>
      </p>
    );
  if (!session || !isAtEncounter || session.battleId) return null;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border p-3">
        <p>
          Hunting contract:{" "}
          <strong>{encounter.data?.contract?.name ?? "Unavailable contract"}</strong>
        </p>
        <Button ref={openButton} onClick={() => dismiss(null)}>
          Open hunting contract
        </Button>
      </div>
      <Modal
        title="Hunting encounter"
        returnFocusRef={openButton}
        className="sm:max-w-2xl"
        isOpen={!blocked && dismissed !== session.id}
        setIsOpen={(open) => {
          if (!open) dismiss(session.id);
        }}
      >
        <HuntingBoard sessionOnly />
      </Modal>
    </>
  );
}
