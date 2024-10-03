"use client";

import { useState } from "react";
import { Trash2, CircleFadingArrowUp } from "lucide-react";
import ItemWithEffects from "@/layout/ItemWithEffects";
import ContentBox from "@/layout/ContentBox";
import Modal from "@/layout/Modal";
import Loader from "@/layout/Loader";
import LoadoutSelector from "@/layout/LoadoutSelector";
import Confirm from "@/layout/Confirm";
import { SquareChevronRight, SquareChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionSelector } from "@/layout/CombatActions";
import { calcJutsuEquipLimit } from "@/libs/train";
import {
  checkJutsuElements,
  checkJutsuBloodline,
  checkJutsuVillage,
  checkJutsuRank,
  checkJutsuItems,
  hasRequiredRank,
  hasRequiredLevel,
} from "@/libs/train";
import { useRequiredUserData } from "@/utils/UserContext";
import { api } from "@/utils/api";
import { getUserElements } from "@/validators/user";
import { showMutationToast } from "@/libs/toast";
import { JUTSU_XP_TO_LEVEL } from "@/drizzle/constants";
import { COST_EXTRA_JUTSU_SLOT } from "@/drizzle/constants";
import { MAX_EXTRA_JUTSU_SLOTS } from "@/drizzle/constants";
import JutsuFiltering, { useFiltering, getFilter } from "@/layout/JutsuFiltering";
import type { Jutsu, UserJutsu } from "@/drizzle/schema";

export default function MyJutsu() {
  // tRPC utility
  const utils = api.useUtils();

  // Two-level filtering
  const state = useFiltering();

  // Settings
  const now = new Date();
  const { data: userData } = useRequiredUserData();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [userjutsu, setUserJutsu] = useState<(Jutsu & UserJutsu) | undefined>(
    undefined,
  );

  // User Jutsus & items
  const { data: userJutsus, isFetching: l1 } = api.jutsu.getUserJutsus.useQuery(
    getFilter(state),
    { staleTime: Infinity },
  );
  const { data: userItems, isFetching: l2 } = api.item.getUserItems.useQuery(
    undefined,
    { staleTime: Infinity },
  );

  const userJutsuCounts = userJutsus?.map((userJutsu) => {
    return {
      id: userJutsu.id,
      quantity:
        userJutsu.finishTraining && userJutsu.finishTraining > now
          ? userJutsu.level - 1
          : userJutsu.level,
    };
  });

  // Mutations
  const { mutate: equip, isPending: isEquipping } = api.jutsu.toggleEquip.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.jutsu.getUserJutsus.invalidate();
      }
    },
    onSettled: () => {
      document.body.style.cursor = "default";
      setIsOpen(false);
      setUserJutsu(undefined);
    },
  });

  const { mutate: forget, isPending: isForgetting } = api.jutsu.forget.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.jutsu.getUserJutsus.invalidate();
      }
    },
    onSettled: () => {
      document.body.style.cursor = "default";
      setIsOpen(false);
      setUserJutsu(undefined);
    },
  });

  const { mutate: updateOrder } = api.jutsu.updateUserJutsuOrder.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.profile.getUser.invalidate();
      }
    },
  });

  const { mutate: buyJutsuSlot, isPending: isUpgrading } =
    api.blackmarket.buyJutsuSlot.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.profile.getUser.invalidate();
        }
      },
    });

  const isPending = isEquipping || isForgetting || isUpgrading;
  const isFetching = l1 || l2;

  // Collapse UserItem and Item
  const userElements = new Set(getUserElements(userData));
  const allJutsu = userJutsus?.map((userjutsu) => {
    let warning = "";
    if (userData) {
      if (!checkJutsuItems(userjutsu.jutsu, userItems)) {
        warning = `No ${userjutsu.jutsu.jutsuWeapon.toLowerCase()} weapon equipped.`;
      }
      if (!checkJutsuElements(userjutsu.jutsu, userElements)) {
        warning = "You do not have the required elements to use this jutsu.";
      }
      if (!hasRequiredRank(userData.rank, userjutsu.jutsu.requiredRank)) {
        warning = "You do not have the required rank to use this jutsu.";
      }
      if (!hasRequiredLevel(userData.level, userjutsu.jutsu.requiredLevel)) {
        warning = "You do not have the required level to use this jutsu.";
      }
      if (!checkJutsuRank(userjutsu.jutsu.jutsuRank, userData.rank)) {
        warning = "You do not have the required rank to use this jutsu.";
      }
      if (!checkJutsuVillage(userjutsu.jutsu, userData)) {
        warning = "You do not have the required village to use this jutsu.";
      }
      if (!checkJutsuBloodline(userjutsu.jutsu, userData)) {
        warning = "You do not have the required bloodline to use this jutsu.";
      }
    }
    return {
      ...userjutsu.jutsu,
      ...userjutsu,
      highlight: userjutsu.equipped ? true : false,
      warning: warning,
    };
  });

  // Sort if we have a loadout
  if (userData?.loadout?.jutsuIds && allJutsu) {
    allJutsu.sort((a, b) => {
      const aIndex = userData?.loadout?.jutsuIds.indexOf(a.jutsuId) ?? -1;
      const bIndex = userData?.loadout?.jutsuIds.indexOf(b.jutsuId) ?? -1;
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }

  // Derived calculations
  const curEquip = userJutsus?.filter((j) => j.equipped).length;
  const maxEquip = userData && calcJutsuEquipLimit(userData);
  const canEquip = curEquip !== undefined && maxEquip && curEquip < maxEquip;
  const subtitle =
    curEquip && maxEquip
      ? `Equipped ${curEquip}/${maxEquip}`
      : "Jutsus you want to use in combat";

  // Ryo from forgetting
  const forgetRyo = 0;

  // Loaders
  if (!userData) return <Loader explanation="Loading userdata" />;

  // Can afford removing
  const canUpgrade = userData.reputationPoints >= COST_EXTRA_JUTSU_SLOT;

  return (
    <ContentBox
      title="Jutsu Management"
      subtitle={subtitle}
      topRightContent={
        !isOpen && (
          <div className="flex flex-row items-center gap-2">
            <LoadoutSelector />
            <JutsuFiltering state={state} />
            {userData.extraJutsuSlots < MAX_EXTRA_JUTSU_SLOTS && (
              <Confirm
                title="Extra Jutsu Slot"
                proceed_label={
                  canUpgrade
                    ? `Purchase for ${COST_EXTRA_JUTSU_SLOT} reps`
                    : `Need ${userData.reputationPoints - COST_EXTRA_JUTSU_SLOT} more reps`
                }
                isValid={!isPending}
                button={
                  <Button animation="pulse">
                    <CircleFadingArrowUp className="h-6 w-6" />
                  </Button>
                }
                onAccept={(e) => {
                  e.preventDefault();
                  if (canUpgrade) buyJutsuSlot();
                }}
              >
                <p>
                  You are about to purchase an extra jutsu slot for{" "}
                  {COST_EXTRA_JUTSU_SLOT} reputation points. You currently have{" "}
                  {userData.reputationPoints} points. Are you sure?
                </p>
              </Confirm>
            )}
          </div>
        )
      }
    >
      {isFetching && <Loader explanation="Loading Jutsu" />}
      <ActionSelector
        items={allJutsu}
        counts={userJutsuCounts}
        labelSingles={true}
        onClick={(id) => {
          setUserJutsu(allJutsu?.find((jutsu) => jutsu.id === id));
          setIsOpen(true);
        }}
        showBgColor={false}
        showLabels={true}
        emptyText="You have not learned any jutsu. Go to the training grounds in your village to learn some."
      />
      {isOpen && userData && userjutsu && (
        <Modal
          title="Edit Jutsu"
          proceed_label={
            !isEquipping
              ? userjutsu.equipped
                ? "Unequip"
                : canEquip
                  ? "Equip"
                  : "Unequip other first"
              : undefined
          }
          setIsOpen={setIsOpen}
          isValid={false}
          onAccept={() => {
            if (canEquip || userjutsu.equipped) {
              equip({ userJutsuId: userjutsu.id });
            } else {
              setIsOpen(false);
            }
          }}
          confirmClassName={
            canEquip
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-red-600 text-white hover:bg-red-700"
          }
        >
          <p>- You have {userData.money} ryo in your pocket</p>
          <p className="pb-3">
            - Need {JUTSU_XP_TO_LEVEL - userjutsu.experience} XP more to level
          </p>
          {!isPending && (
            <>
              <ItemWithEffects
                item={userjutsu}
                key={userjutsu.id}
                showStatistic="jutsu"
              />
              <div className="flex flex-row gap-3 items-center">
                {userData.loadout?.jutsuIds.includes(userjutsu.jutsuId) && (
                  <>
                    <SquareChevronLeft
                      className="h-8 w-8 hover:text-orange-300 hover:cursor-pointer"
                      onClick={() =>
                        updateOrder({
                          jutsuId: userjutsu.jutsuId,
                          loadoutId: userData?.jutsuLoadout ?? "",
                          moveForward: false,
                        })
                      }
                    />
                    <p>Order</p>
                    <SquareChevronRight
                      className="h-8 w-8 hover:text-orange-300 hover:cursor-pointer"
                      onClick={() =>
                        updateOrder({
                          jutsuId: userjutsu.jutsuId,
                          loadoutId: userData?.jutsuLoadout ?? "",
                          moveForward: true,
                        })
                      }
                    />
                  </>
                )}

                <div className="grow"></div>
                <Confirm
                  title="Forget Jutsu"
                  button={
                    <Button id="return" variant="destructive">
                      <Trash2 className="h-6 w-6 mr-2" />
                      Forget [${forgetRyo} ryo]
                    </Button>
                  }
                  onAccept={(e) => {
                    e.preventDefault();
                    forget({ id: userjutsu.id });
                  }}
                >
                  <p>Confirm to forget this jutsu and get back {forgetRyo} ryo.</p>
                </Confirm>
              </div>
            </>
          )}
          {isPending && <Loader explanation={`Processing ${userjutsu.name}`} />}
        </Modal>
      )}
      {isPending && <Loader explanation="Loading Jutsu" />}
    </ContentBox>
  );
}
