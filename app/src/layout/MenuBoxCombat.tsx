import React from "react";
import Link from "next/link";
import StatusBar from "@/layout/StatusBar";
import AvatarImage from "@/layout/Avatar";
import { useUserData } from "@/utils/UserContext";
import { useAtomValue } from "jotai";
import { userBattleAtom } from "@/utils/UserContext";
import { SideBannerTitle } from "@/components/layout/core4_default";

const MenuBoxCombat: React.FC = () => {
  // State
  const { data: userData, timeDiff } = useUserData();
  const battle = useAtomValue(userBattleAtom);

  // Battle user state
  const battleUser = battle?.usersState.find(
    (u) => u.userId !== userData?.userId && !u.isSummon,
  );

  // Guard
  if (!battleUser) return null;

  return (
    <>
      <SideBannerTitle>Enemy: {battleUser.username}</SideBannerTitle>
      <div className="flex-col items-center justify-center ">
        <Link href="/profile">
          <AvatarImage
            href={battleUser.avatar}
            userId={battleUser.userId}
            alt={battleUser.username}
            refetchUserData={true}
            size={100}
            hover_effect={true}
            priority
          />
        </Link>

        <div className="pt-5">
          <StatusBar
            title="HP"
            tooltip="Health"
            color="bg-red-500"
            showText={true}
            lastRegenAt={battleUser.regenAt}
            regen={0}
            status={"AWAKE"}
            current={battleUser?.curHealth}
            total={battleUser?.maxHealth}
            timeDiff={timeDiff}
          />
          <StatusBar
            title="CP"
            tooltip="Chakra"
            color="bg-blue-500"
            showText={true}
            lastRegenAt={battleUser.regenAt}
            regen={0}
            status={"AWAKE"}
            current={battleUser?.curChakra}
            total={battleUser?.maxChakra}
            timeDiff={timeDiff}
          />
          <StatusBar
            title="SP"
            tooltip="Stamina"
            color="bg-green-500"
            showText={true}
            lastRegenAt={battleUser.regenAt}
            regen={0}
            status={"AWAKE"}
            current={battleUser?.curStamina}
            total={battleUser?.maxStamina}
            timeDiff={timeDiff}
          />
        </div>
      </div>
      <hr className="my-2" />
    </>
  );
};

export default MenuBoxCombat;
