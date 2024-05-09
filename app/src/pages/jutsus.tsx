import { useState } from "react";
import { Trash2 } from "lucide-react";
import ItemWithEffects from "@/layout/ItemWithEffects";
import ContentBox from "@/layout/ContentBox";
import Modal from "@/layout/Modal";
import Loader from "@/layout/Loader";
import LoadoutSelector from "@/layout/LoadoutSelector";
import { Button } from "@/components/ui/button";
import { ActionSelector } from "@/layout/CombatActions";
import { calcJutsuEquipLimit, calcForgetReturn } from "@/libs/train";
import { useRequiredUserData } from "@/utils/UserContext";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import { JUTSU_XP_TO_LEVEL } from "@/drizzle/constants";
import type { NextPage } from "next";
import type { Jutsu, UserJutsu } from "@/drizzle/schema";

const MyJutsu: NextPage = () => {
  // tRPC utility
  const utils = api.useUtils();

  // Settings
  const now = new Date();
  const { data: userData } = useRequiredUserData();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [userjutsu, setUserJutsu] = useState<(Jutsu & UserJutsu) | undefined>(
    undefined,
  );

  // User Jutsus & items
  const { data: userJutsus, isFetching: l1 } = api.jutsu.getUserJutsus.useQuery(
    undefined,
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

  const isPending = isEquipping || isForgetting;
  const isFetching = l1 || l2;

  // Collapse UserItem and Item
  const allJutsu = userJutsus?.map((userjutsu) => {
    let warning = "";
    if (userjutsu.jutsu.jutsuWeapon !== "NONE") {
      const equippedItem = userItems?.find(
        (useritem) =>
          useritem.item.weaponType === userjutsu.jutsu.jutsuWeapon &&
          useritem.equipped !== "NONE",
      );
      if (!equippedItem) {
        warning = `No ${userjutsu.jutsu.jutsuWeapon.toLowerCase()} weapon equipped.`;
      }
    }
    return {
      ...userjutsu.jutsu,
      ...userjutsu,
      highlight: userjutsu.equipped ? true : false,
      warning: warning,
    };
  });

  // Derived calculations
  const curEquip = userJutsus?.filter((j) => j.equipped).length;
  const maxEquip = userData && calcJutsuEquipLimit(userData);
  const canEquip = curEquip !== undefined && maxEquip && curEquip < maxEquip;
  const subtitle =
    curEquip && maxEquip
      ? `Equipped ${curEquip}/${maxEquip}`
      : "Jutsus you want to use in combat";

  // Ryo from forgetting
  const forgetRyo = userjutsu
    ? calcForgetReturn(userjutsu, userjutsu.level).toFixed(0)
    : 0;

  if (!userData) {
    return <Loader explanation="Loading userdata" />;
  } else if (isFetching) {
    return <Loader explanation="Loading jutsus" />;
  }

  return (
    <ContentBox
      title="Jutsu Management"
      subtitle={subtitle}
      topRightContent={<LoadoutSelector />}
    >
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
          title="Confirm Purchase"
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
              <div className="flex flex-row">
                <div className="grow"></div>
                <Button
                  id="return"
                  variant="destructive"
                  onClick={() => {
                    forget({ id: userjutsu.id });
                  }}
                >
                  <Trash2 className="h-6 w-6 mr-2" />
                  Forget [${forgetRyo} ryo]
                </Button>
              </div>
            </>
          )}
          {isPending && <Loader explanation={`Processing ${userjutsu.name}`} />}
        </Modal>
      )}
      {isPending && <Loader explanation="Loading Jutsu" />}
    </ContentBox>
  );
};

export default MyJutsu;
