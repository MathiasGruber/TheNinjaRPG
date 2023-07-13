import { useState } from "react";
import ItemWithEffects from "../layout/ItemWithEffects";
import ContentBox from "../layout/ContentBox";
import Modal from "../layout/Modal";
import Loader from "../layout/Loader";
import { ActionSelector } from "../layout/CombatActions";
import { calcJutsuEquipLimit } from "../libs/train";
import { useRequiredUserData } from "../utils/UserContext";
import { api } from "../utils/api";
import { show_toast } from "../libs/toast";
import type { NextPage } from "next";
import type { Jutsu, UserJutsu } from "../../drizzle/schema";

const MyJutsu: NextPage = () => {
  // Settings
  const now = new Date();
  const { data: userData } = useRequiredUserData();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [userjutsu, setUserJutsu] = useState<(Jutsu & UserJutsu) | undefined>(
    undefined
  );

  // User Jutsus
  const {
    data: userJutsus,
    refetch,
    isFetching,
  } = api.jutsu.getUserJutsus.useQuery(undefined, {
    staleTime: Infinity,
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

  // Mutations
  const { mutate: equip, isLoading: isEquipping } = api.jutsu.toggleEquip.useMutation({
    onSuccess: async () => {
      await refetch();
    },
    onError: (error) => {
      show_toast("Error during equip", error.message, "error");
    },
    onSettled: () => {
      setIsOpen(false);
      setUserJutsu(undefined);
    },
  });

  // Collapse UserItem and Item
  const allJutsu = userJutsus?.map((userjutsu) => {
    return {
      ...userjutsu.jutsu,
      ...userjutsu,
      highlight: userjutsu.equipped ? true : false,
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

  if (!userData) return <Loader explanation="Loading userdata" />;

  return (
    <ContentBox title="Jutsu Management" subtitle={subtitle}>
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
              console.log("Test");
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
          <p className="pb-3">You have {userData.money} ryo in your pocket</p>
          {!isEquipping && (
            <>
              <ItemWithEffects item={userjutsu} key={userjutsu.id} />
            </>
          )}
          {isEquipping && <Loader explanation={`Toggling ${userjutsu.name}`} />}
        </Modal>
      )}
      {isFetching && <Loader explanation="Loading Jutsu" />}
    </ContentBox>
  );
};

export default MyJutsu;
