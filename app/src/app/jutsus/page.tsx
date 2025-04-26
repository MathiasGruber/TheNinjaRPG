"use client";

import { useState, useEffect } from "react";
import { Trash2, CircleFadingArrowUp, ArrowRightLeft, Palette } from "lucide-react";
import ItemWithEffects from "@/layout/ItemWithEffects";
import ContentBox from "@/layout/ContentBox";
import Modal from "@/layout/Modal";
import Loader from "@/layout/Loader";
import LoadoutSelector from "@/layout/LoadoutSelector";
import Confirm from "@/layout/Confirm";
import { SquareChevronRight, SquareChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OctagonX } from "lucide-react";
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
import { api } from "@/app/_trpc/client";
import { getUserElements } from "@/validators/user";
import { showMutationToast } from "@/libs/toast";
import { JUTSU_XP_TO_LEVEL } from "@/drizzle/constants";
import { COST_EXTRA_JUTSU_SLOT } from "@/drizzle/constants";
import { MAX_EXTRA_JUTSU_SLOTS } from "@/drizzle/constants";
import { 
  JUTSU_TRANSFER_COST, 
  JUTSU_TRANSFER_MAX_LEVEL, 
  JUTSU_TRANSFER_MINIMUM_LEVEL 
} from "@/drizzle/constants";
import { getFreeTransfers } from "@/libs/jutsu";
import JutsuFiltering, { useFiltering, getFilter } from "@/layout/JutsuFiltering";
import { canTransferJutsu } from "@/utils/permissions";
import type { Jutsu, UserJutsu } from "@/drizzle/schema";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { COST_RESKIN_JUTSU, RESKIN_LIMIT } from "@/drizzle/constants";
import { canReskinJutsu } from "@/utils/permissions";

export default function MyJutsu() {
  // tRPC utility
  const utils = api.useUtils();

  // Two-level filtering
  const state = useFiltering();

  // Settings
  const now = new Date();
  const { data: userData, updateUser } = useRequiredUserData();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isReskinOpen, setIsReskinOpen] = useState<boolean>(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [userjutsu, setUserJutsu] = useState<(Jutsu & UserJutsu) | undefined>(
    undefined,
  );
  const [transferTarget, setTransferTarget] = useState<(Jutsu & UserJutsu) | undefined>(
    undefined,
  );
  const transferCost = canTransferJutsu(userData?.role || "USER") ? 0 : JUTSU_TRANSFER_COST;
  const [transferValue, setTransferValue] = useState<number>(1);
  const [modalType, setModalType] = useState<string | null>(null);
  const [reskinName, setReskinName] = useState("");
  const [reskinDescription, setReskinDescription] = useState("");
  const [reskinBattleDescription, setReskinBattleDescription] = useState("");
  const [reskinData, setReskinData] = useState<{
    name: string;
    description: string;
    battleDescription: string;
  } | null>(null);

  // User Jutsus & items
  const { data: userJutsus, isFetching: l1 } = api.jutsu.getUserJutsus.useQuery(
    getFilter(state),
    { enabled: !!userData },
  );
  const { data: userItems, isFetching: l2 } = api.item.getUserItems.useQuery(
    undefined,
    { enabled: !!userData },
  );
  const { data: recentTransfers } = api.jutsu.getRecentTransfers.useQuery(undefined, {
    enabled: !!userData,
  });

  const userJutsuCounts = userJutsus?.map((userJutsu) => {
    return {
      id: userJutsu.id,
      quantity:
        userJutsu.finishTraining && userJutsu.finishTraining > now
          ? userJutsu.level - 1
          : userJutsu.level,
    };
  });

  // Transfer costs
  const [usedTransfers, setUsedTransfers] = useState(0);
  const [freeTransfers, setFreeTransfers] = useState(0);

  // Auto-update when recentTransfers change
  useEffect(() => {
    if (recentTransfers) {
      setUsedTransfers(recentTransfers.length);
    }
    if (userData) {
      setFreeTransfers(getFreeTransfers(userData.federalStatus || "NONE"));
    }
  }, [recentTransfers, userData]);

  const onSettled = () => {
    document.body.style.cursor = "default";
    setIsOpen(false);
    setUserJutsu(undefined);
    setTransferTarget(undefined);
  };

  // Mutations
  const { mutate: equip, isPending: isToggling } = api.jutsu.toggleEquip.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.jutsu.getUserJutsus.invalidate();
      }
      // Optimistically update loadout
      if (data?.data && userData) {
        const currentLoadout = userData?.loadout?.jutsuIds || [];
        const jutsuId = data.data.jutsuId;
        const newLoadout = data?.data.equipped
          ? [...currentLoadout, jutsuId]
          : currentLoadout.filter((id) => id !== jutsuId);
        await updateUser({ loadout: { jutsuIds: newLoadout } });
      }
    },
    onSettled,
  });

  const { mutate: unequipAll, isPending: isUnequipping } =
    api.jutsu.unequipAll.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.jutsu.getUserJutsus.invalidate();
        }
      },
      onSettled,
    });

  const { mutate: forget, isPending: isForgetting } = api.jutsu.forget.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.jutsu.getUserJutsus.invalidate();
      }
    },
    onSettled,
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

  const { mutate: transferLevel, isPending: isTransferring } =
    api.jutsu.transferLevel.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success && userData) {
          await utils.jutsu.getUserJutsus.invalidate(); // Refresh Jutsu list
          await utils.jutsu.getRecentTransfers.invalidate(); // 🔹 Refresh free transfers
          await utils.profile.getUser.invalidate(); // Refresh user profile to update free transfer count
          if (usedTransfers >= freeTransfers && transferCost > 0) {
            await updateUser({
              reputationPoints: userData.reputationPoints - transferCost,
            });
          }
        }
      },
      onSettled,
    });

  const { mutate: reskin, isPending: isReskinning } = api.jutsu.reskin.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.jutsu.getUserJutsus.invalidate();
        setIsReskinOpen(false);
        setUserJutsu(undefined);
      }
    },
  });

  const isPending =
    isToggling || isForgetting || isUpgrading || isUnequipping || isTransferring || isReskinning;
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

  // Calculate reskin cost based on permissions
  const reskinCost = canReskinJutsu(userData?.role) ? 0 : COST_RESKIN_JUTSU;

  return (
    <ContentBox
      title="Jutsu Management"
      subtitle={subtitle}
      bottomRightContent={
        <Button onClick={() => unequipAll()}>
          <OctagonX className="h-6 w-6 mr-2" />
          Unequip All
        </Button>
      }
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
        showLabels={true}
        showBgColor={false}
        onClick={(id) => {
          setUserJutsu(allJutsu?.find((jutsu) => jutsu.id === id));
          setIsOpen(true);
        }}
        emptyText="You have not learned any jutsu. Go to the training grounds in your village to learn some."
      />
      {isOpen && userData && userjutsu && (
        <Modal
          title="Edit Jutsu"
          proceed_label={
            !isToggling
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
                {userjutsu.level >= JUTSU_TRANSFER_MINIMUM_LEVEL && userjutsu.level <= JUTSU_TRANSFER_MAX_LEVEL && (
                  <Confirm
                    title="Transfer Level"
                    button={
                      <Button id="transfer" variant="secondary">
                        <ArrowRightLeft className="h-6 w-6 mr-2" />
                        Transfer Level
                      </Button>
                    }
                    proceed_label={
                      transferTarget ? "Confirm Transfer" : "Select Target"
                    }
                    onClose={() => {
                      setTransferTarget(undefined);
                      setTransferValue(1);
                    }}
                    onAccept={(e) => {
                      e.preventDefault();
                      if (transferTarget) {
                        transferLevel({
                          fromJutsuId: userjutsu.jutsuId,
                          toJutsuId: transferTarget.jutsuId,
                          transferLevels: transferValue,
                        });
                      }
                    }}
                  >
                    {transferTarget ? (
                      <>
                        <p>
                          Transfer{" "}
                          <input
                            type="number"
                            min={1}
                            max={Math.min(
                              userjutsu.level - 1,
                              JUTSU_TRANSFER_MAX_LEVEL - transferTarget.level
                            )}
                            value={transferValue}
                            onChange={(e) =>
                              setTransferValue(parseInt(e.target.value) || 1)
                            }
                            style={{
                              width: "50px",
                              margin: "0 5px",
                              backgroundColor: "white",
                              color: "black",
                              border: "1px solid #ccc",
                              padding: "2px 4px",
                            }}
                          />{" "}
                          level(s) from {userjutsu.name} to {transferTarget.name}?
                        </p>
                        <p>
                          This will subtract {transferValue} level{transferValue > 1 ? "s" : ""} from {userjutsu.name} (new level: {userjutsu.level - transferValue}) and add {transferValue} level{transferValue > 1 ? "s" : ""} to {transferTarget.name} (new level: {transferTarget.level + transferValue}).
                        </p>
                        <p>
                          Cost:{" "}
                          {usedTransfers < freeTransfers
                            ? `Free (${Math.max(0, freeTransfers - usedTransfers)} remaining)`
                            : `${transferCost} reputation points`}
                        </p>
                      </>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <p>Select a jutsu to transfer the level to.</p>
                        <ActionSelector
                          items={allJutsu?.filter(
                            (jutsu) =>
                              jutsu.jutsuType === userjutsu.jutsuType &&
                              jutsu.jutsuRank === userjutsu.jutsuRank &&
                              jutsu.id !== userjutsu.id
                          )}
                          counts={userJutsuCounts}
                          labelSingles={true}
                          showBgColor={false}
                          showLabels={true}
                          onClick={(id) => {
                            setTransferTarget(allJutsu?.find((jutsu) => jutsu.id === id));
                          }}
                        />
                      </div>
                    )}
                  </Confirm>
                )}
                <Button
                  id="reskin"
                  variant="outline"
                  onClick={() => {
                    setIsReskinOpen(true);
                    setModalType("reskin");
                  }}
                  disabled={isPending || userjutsu.jutsuType === "SPECIAL" || userjutsu.jutsuType === "BLOODLINE" || userjutsu.jutsuType === "RESKIN"}
                >
                  <Palette className="h-6 w-6 mr-2" />
                  Reskin
                </Button>
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
      {modalType === "reskin" && userjutsu && isReskinOpen && (
        <Modal
          title="Create Jutsu Reskin"
          proceed_label="Create Reskin"
          setIsOpen={setIsReskinOpen}
          isValid={!!reskinName && !!reskinDescription && !!reskinBattleDescription}
          onAccept={() => {
            if (!isReskinning && userjutsu) {
              const data = {
                name: reskinName,
                description: reskinDescription,
                battleDescription: reskinBattleDescription,
              };
              setReskinData(data);
              setIsReskinOpen(false);
              setIsConfirmOpen(true);
            }
          }}
        >
          <div className="space-y-4">
            <div className="reskin-rules" style={{ maxWidth: "800px", margin: "0 auto", padding: "1rem", fontFamily: "sans-serif", lineHeight: "1.6" }}>
              <p style={{ fontWeight: "bold", marginBottom: "1rem" }}>Jutsu Reskin Rules</p>
              <p>
              <strong>Creating a reskin costs {reskinCost} reputation points.</strong>
                <br /><br />
                <strong>Reskin Usage:</strong><br />
                You have used {userData.reskinCount}/{userData.reskinTokenCount + RESKIN_LIMIT} available reskins.
                <br /><br />
                Reskins are a way to personalize your jutsu&apos;s name, description, and in-combat flavor text. These are cosmetic only and must follow the rules below.
                <br /><br />
                <strong>What You Can Change:</strong><br />
                You are allowed to modify only the following:<br />
                - Jutsu Name<br />
                - Jutsu Description (what shows outside of combat)<br />
                - Battle Description (what appears in combat, e.g., &quot;%user uses %jutsu on %target&quot;)
                <br /><br />
                <strong>Tone & Content Restrictions:</strong><br />
                - No hostile, mocking, or negative wording toward other players, clans, villages, bloodlines, or jutsu.<br />
                - No profanity, slurs, or real-world political/religious references.<br />
                - No inappropriate humor or immersion-breaking language.<br />
                - No subtle digs or sarcasm aimed at others. If it could be taken negatively, it&apos;s not allowed.
                <br /><br />
                <strong>Example:</strong><br />
                Original Name: Fireball Jutsu<br />
                Reskin Name: Blazing Verdict<br />
                Original Description: A sphere of fire launched at the target.<br />
                Reskin Description: A judgment cast in searing flame, leaving no room for appeal.<br />
                Original Battle Description: %user hurls a fireball at %target.<br />
                Reskin Battle Description: %user delivers the Blazing Verdict to %target, flames roaring with finality.
                <br /><br />
                <strong>Note:</strong> Violation of these rules may result in the modification or removal of the reskinned jutsu.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = {
                  name: reskinName,
                  description: reskinDescription,
                  battleDescription: reskinBattleDescription,
                };
                setReskinData(data);
                setIsReskinOpen(false);
                setIsConfirmOpen(true);
              }}
              className="space-y-4"
            >
              <div>
                <Input 
                  placeholder="New jutsu name" 
                  value={reskinName}
                  onChange={(e) => setReskinName(e.target.value)}
                />
              </div>

              <div>
                <Textarea 
                  placeholder="New jutsu description" 
                  value={reskinDescription}
                  onChange={(e) => setReskinDescription(e.target.value)}
                />
              </div>

              <div>
                <Textarea 
                  placeholder="New battle description" 
                  value={reskinBattleDescription}
                  onChange={(e) => setReskinBattleDescription(e.target.value)}
                />
              </div>
            </form>
          </div>
        </Modal>
      )}
      {isConfirmOpen && reskinData && userjutsu && (
        <Modal
          setIsOpen={setIsConfirmOpen}
          title="Confirm Jutsu Reskin"
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              By clicking &quot;Confirm&quot;, you acknowledge that you are creating a reskin that costs {reskinCost} reputation points and that your reskin 
              follows all the outlined rules.
              <br /><br />
              <strong>Note:</strong> Violations may result in the modification or removal of your reskin.
            </p>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsConfirmOpen(false);
                  setIsReskinOpen(true);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (reskinData && userjutsu) {
                    reskin({
                      originalJutsuId: userjutsu.id,
                      ...reskinData,
                    });
                    setIsConfirmOpen(false);
                  }
                }}
              >
                Confirm
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </ContentBox>
  );
}
