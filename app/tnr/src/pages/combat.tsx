import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { type NextPage } from "next";
import Image from "next/image";

import ContentBox from "../layout/ContentBox";
import Loader from "../layout/Loader";
import Combat from "../layout/Combat";
import { api } from "../utils/api";

import { useRequiredUserData } from "../utils/UserContext";

const CombatPage: NextPage = () => {
  // State
  const [updatedAt, setUpdatedAt] = useState<number>(0);

  // Data from the DB
  const { data: userData, setBattle } = useRequiredUserData();
  const { data: battle, isFetching } = api.combat.getBattle.useQuery(
    { battleId: userData?.battleId ?? "1337" },
    {
      enabled: !!userData,
      staleTime: Infinity,
    }
  );

  // Redirect to profile if not in battle
  const router = useRouter();
  useEffect(() => {
    if (userData && !userData.battleId) {
      void router.push("/profile");
    }
    if (battle) {
      setBattle(battle);
    }
  }, [userData, router, battle, setBattle]);

  return (
    <div>
      <ContentBox
        title="Combat"
        subtitle="Sparring"
        padding={false}
        topRightContent={battle && <ActionTimer perc={100} />}
      >
        {battle && <Combat battle={battle} />}
        {!userData?.battleId && <Loader explanation="Loading User Data" />}
        {isFetching && <Loader explanation="Loading Battle Data" />}
      </ContentBox>
      <div className="grid grid-cols-6 border-b-2 border-l-2 border-r-2 bg-slate-50 text-xs sm:grid-cols-8">
        <ActionOption
          className="bg-orange-200"
          src="/combat/basicActions/stamina.png"
          alt="sp"
          txt="Stamina Attack"
        />
        <ActionOption
          className="bg-orange-200"
          src="/combat/basicActions/chakra.png"
          alt="cp"
          txt="Chakra Attack"
        />
        <ActionOption
          className="bg-orange-200"
          src="/combat/basicActions/move.png"
          alt="move"
          txt="Move"
        />
        <ActionOption
          className="bg-orange-200"
          src="/combat/basicActions/flee.png"
          alt="flee"
          txt="Flee"
        />

        <ActionOption
          className="bg-blue-100"
          src="/jutsus/clone_technique.png"
          alt="temp1"
          txt="Clone Technique"
        />
        <ActionOption
          className="bg-blue-100"
          src="/jutsus/soul_shackles.png"
          alt="temp2"
          txt="Soul Shackles"
        />
        <ActionOption
          className="bg-blue-100"
          src="/jutsus/sonic_slash.png"
          alt="temp3"
          txt="Sonic Slash"
        />
        <ActionOption
          className="bg-blue-100"
          src="/jutsus/searing_intimidation.png"
          alt="temp4"
          txt="Searing Intimidation"
        />

        <ActionOption
          className="bg-red-200"
          src="/items/shuriken.png"
          alt="temp3"
          txt="Shuriken"
        />
        <ActionOption
          className="bg-slate-300"
          src="/items/water.png"
          alt="temp3"
          txt="Normal Water"
        />
        <ActionOption
          className="bg-slate-300"
          src="/items/chakra_water.png"
          alt="temp3"
          txt="Chakra Water"
        />
      </div>
    </div>
  );
};

export default CombatPage;

interface ActionOptionProps {
  src: string;
  alt: string;
  txt: string;
  className?: string;
}

const ActionOption: React.FC<ActionOptionProps> = (props) => {
  return (
    <div
      className={`p-1  text-center leading-5 ${
        props.className ?? ""
      } flex flex-col items-center`}
    >
      <Image
        className="rounded-xl border-2"
        src={props.src}
        width={64}
        height={64}
        alt={props.alt}
      ></Image>
      {props.txt}
    </div>
  );
};

interface ActionTimerProps {
  perc: number;
}

const ActionTimer: React.FC<ActionTimerProps> = (props) => {
  let label = "";
  if (props.perc === 100) {
    label = "Action Enabled";
  } else if (props.perc > 95) {
    label = "Pre-action enabled";
  } else if (props.perc > 50) {
    label = "Movement Enabled";
  } else if (props.perc > 45) {
    label = "Pre-move Enabled";
  }
  return (
    <div className="pl-5">
      <div className="relative flex flex-row">
        <Image
          className="relative"
          src="/combat/actionTimer/background.webp"
          alt="Action Timer"
          width={768}
          height={62}
        />
        <Image
          className="absolute"
          style={{
            clipPath: `polygon(0 0%, ${props.perc}% 0%, ${props.perc}% 100%, 0% 100%)`,
          }}
          src="/combat/actionTimer/blue.webp"
          alt="Action Timer"
          width={768}
          height={62}
        />
        <Image
          className="absolute "
          src="/combat/actionTimer/overlay.webp"
          alt="Action Timer"
          width={768}
          height={62}
        />
        {label && (
          <p className="absolute bottom-0 left-0 right-0 top-0 flex items-center justify-center text-xs font-bold text-white">
            {label}
          </p>
        )}
      </div>
    </div>
  );
};
