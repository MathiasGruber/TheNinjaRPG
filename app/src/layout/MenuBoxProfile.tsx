import React, { useEffect, useState } from "react";
import Link from "next/link";
import MenuBox from "./MenuBox";
import StatusBar from "./StatusBar";
import AvatarImage from "./Avatar";
import { useUserData } from "../utils/UserContext";
import { WrenchScrewdriverIcon } from "@heroicons/react/24/solid";
import { ShieldCheckIcon } from "@heroicons/react/24/solid";
import { BugAntIcon } from "@heroicons/react/24/solid";
import { sealCheck } from "../libs/combat/tags";
import { isEffectStillActive } from "../libs/combat/util";
import { getDaysHoursMinutesSeconds } from "../utils/time";
import { COMBAT_SECONDS } from "../libs/combat/constants";
import type { UserEffect } from "../libs/combat/types";

const MenuBoxProfile: React.FC = () => {
  const { data: userData, battle, refetch: refetchUserData } = useUserData();
  const [, setState] = useState<number>(0);

  /** Convenience method for showing effects based on stats */
  const showStatAffects = (
    effect: UserEffect,
    qualifier: string,
    key: number,
    className: string,
    arrow: string
  ) => {
    if ("statTypes" in effect) {
      return (
        <div key={key}>
          {effect.statTypes?.map((e) => {
            return (
              <li key={`${e}-${key}`} className={className}>
                {arrow} {e} {qualifier}
              </li>
            );
          })}
          {effect.generalTypes?.map((e) => {
            return (
              <li key={`${e}-${key}`} className={className}>
                {arrow} {e} {qualifier}
              </li>
            );
          })}
          {effect.elements?.map((e) => {
            return (
              <li key={`${e}-${key}`} className={className}>
                {arrow} {e} {qualifier}
              </li>
            );
          })}
        </div>
      );
    }
    return <div key={key}></div>;
  };

  if (!userData) {
    return <div></div>;
  }

  // Derived data
  const active = battle?.usersEffects.filter((e) => isEffectStillActive(e));
  const sealEffects = active?.filter(
    (e) => e.type === "seal" && !e.isNew && isEffectStillActive(e)
  );
  const immunitySecondsLeft = (userData.immunityUntil.getTime() - Date.now()) / 1000;

  return (
    <MenuBox
      title={"Hi " + userData.username}
      link={
        <Link href="/avatar">
          <WrenchScrewdriverIcon className="h-6 w-6 hover:fill-orange-500" />
        </Link>
      }
    >
      <div className="flex-col items-center justify-center">
        <Link href="/profile">
          <AvatarImage
            href={userData.avatar}
            userId={userData.userId}
            alt={userData.username}
            refetchUserData={refetchUserData}
            size={100}
            hover_effect={true}
            priority
          />
        </Link>

        <StatusBar
          title="HP"
          tooltip="Health"
          color="bg-red-500"
          showText={true}
          lastRegenAt={userData.regenAt}
          regen={userData.regeneration}
          status={userData.status}
          current={userData.curHealth}
          total={userData.maxHealth}
        />
        <StatusBar
          title="CP"
          tooltip="Chakra"
          color="bg-blue-500"
          showText={true}
          lastRegenAt={userData.regenAt}
          regen={userData.regeneration}
          status={userData.status}
          current={userData.curChakra}
          total={userData.maxChakra}
        />
        <StatusBar
          title="SP"
          tooltip="Stamina"
          color="bg-green-500"
          showText={true}
          lastRegenAt={userData.regenAt}
          regen={userData.regeneration}
          status={userData.status}
          current={userData.curStamina}
          total={userData.maxStamina}
        />

        <div className="mt-4">
          <hr />
          <p className="mt-2">
            <b>Status:</b>{" "}
            {userData.status === "BATTLE" ? (
              <Link className="font-bold  " href="/combat">
                BATTLE
              </Link>
            ) : (
              userData.status
            )}
          </p>
        </div>
        {userData.immunityUntil > new Date() && (
          <>
            <hr className="my-2" />
            <div className="flex flex-row">
              <ShieldCheckIcon className="h-6 w-6 mr-2" />
              <Cooldown
                createdAt={Date.now()}
                totalSeconds={immunitySecondsLeft}
                initialSecondsLeft={immunitySecondsLeft}
                setState={setState}
              />
            </div>
          </>
        )}
        {active && (
          <>
            <hr className="my-2" />
            <ul className="italic">
              {active
                .filter((u) => u.targetId === userData.userId)
                .map((effect, i) => {
                  let cooldown = <></>;
                  if (effect.rounds) {
                    const totalSeconds = effect.rounds * COMBAT_SECONDS;
                    cooldown = (
                      <Cooldown
                        createdAt={effect.createdAt}
                        totalSeconds={totalSeconds}
                        initialSecondsLeft={
                          effect.createdAt + totalSeconds * 1000 - Date.now()
                        }
                        setState={setState}
                      />
                    );
                  }
                  const isSealed = sealEffects && sealCheck(effect, sealEffects);
                  const positive = effect.power && effect.power > 0;
                  const arrow = positive ? "↑" : "↓";
                  const direction = positive ? "increased" : "decreased";
                  let className = isSealed ? "line-through" : "";
                  if (["poolcostadjust", "damage"].includes(effect.type)) {
                    className = positive ? "text-red-500" : "text-green-500";
                  } else {
                    className = positive ? "text-green-500" : "text-red-500";
                  }
                  if (effect.type === "statadjust") {
                    return showStatAffects(effect, direction, i, className, arrow);
                  } else if (effect.type === "damagegivenadjust") {
                    return showStatAffects(effect, "damage", i, className, arrow);
                  } else if (effect.type === "damagetakenadjust") {
                    return showStatAffects(effect, "protection", i, className, arrow);
                  } else if (effect.type === "healadjust") {
                    return showStatAffects(effect, "healing", i, className, arrow);
                  } else if (effect.type === "absorb") {
                    return showStatAffects(effect, "absorb", i, className, arrow);
                  } else if (effect.type === "reflect") {
                    return showStatAffects(effect, "reflect", i, className, arrow);
                  } else if (effect.type === "damage") {
                    return (
                      <li key={i} className={className}>
                        <div className="flex flex-row">
                          <BugAntIcon className="h-6 w-6 mr-2" /> Dmg {cooldown}
                        </div>
                      </li>
                    );
                  } else if (effect.type === "armoradjust") {
                    return (
                      <li key={i} className={className}>
                        {arrow} Armor {cooldown}
                      </li>
                    );
                  } else if (effect.type === "poolcostadjust") {
                    return (
                      <li key={i} className={className}>
                        {arrow} Action cost {cooldown}
                      </li>
                    );
                  } else if (effect.type === "fleeprevent") {
                    return (
                      <li key={i} className="text-blue-500">
                        - Cannot flee {cooldown}
                      </li>
                    );
                  } else if (effect.type === "robprevent") {
                    return (
                      <li key={i} className="text-blue-500">
                        - Rob Immunity {cooldown}
                      </li>
                    );
                  } else if (effect.type === "stunprevent") {
                    return (
                      <li key={i} className="text-blue-500">
                        - Stun Resistance {cooldown}
                      </li>
                    );
                  } else if (effect.type === "stun" && effect.rounds) {
                    return (
                      <li key={i} className="text-blue-500">
                        - Stunned {cooldown}
                      </li>
                    );
                  } else if (effect.type === "onehitkillprevent" && effect.rounds) {
                    return (
                      <li key={i} className="text-blue-500">
                        - OHKO immunity {cooldown}
                      </li>
                    );
                  } else if (effect.type === "sealprevent" && effect.rounds) {
                    return (
                      <li key={i} className="text-blue-500">
                        - Sealing immunity {cooldown}
                      </li>
                    );
                  } else if (effect.type === "seal" && effect.rounds) {
                    return (
                      <li key={i} className="text-blue-500">
                        - Bloodline Sealed {cooldown}
                      </li>
                    );
                  } else {
                    return <div key={i}>Unparsed: {effect.type}</div>;
                  }
                })}
            </ul>
          </>
        )}
      </div>
    </MenuBox>
  );
};

// TODO: Add ground effects explanations

export default MenuBoxProfile;

const getTimeStr = (secondsLeft: number) => {
  const [, hours, minutes, seconds] = getDaysHoursMinutesSeconds(secondsLeft);
  if (secondsLeft > 0) {
    const hoursStr = hours.toString().padStart(2, "0");
    const minutesStr = minutes.toString().padStart(2, "0");
    const secondsStr = seconds.toString().padStart(2, "0");
    if (hours > 0) {
      return `${hoursStr}:${minutesStr}:${secondsStr}`;
    } else {
      return `${minutesStr}:${secondsStr}`;
    }
  } else {
    return `Done`;
  }
};

interface CooldownProps {
  initialSecondsLeft: number;
  totalSeconds: number;
  createdAt: number;
  setState: React.Dispatch<React.SetStateAction<number>>;
}

const Cooldown: React.FC<CooldownProps> = (props) => {
  const { createdAt, totalSeconds, initialSecondsLeft, setState } = props;
  const [counter, setCounter] = useState<string>(getTimeStr(initialSecondsLeft * 1000));

  useEffect(() => {
    if (totalSeconds) {
      const secondsLeft = createdAt + totalSeconds * 1000 - Date.now();
      if (secondsLeft > 0) {
        const interval = setInterval(() => {
          const secondsLeft = createdAt + totalSeconds * 1000 - Date.now();
          setCounter(getTimeStr(secondsLeft));
        }, 1000);
        return () => clearInterval(interval);
      } else {
        if (initialSecondsLeft > 0) {
          setState((prev) => prev + 1);
        }
        setCounter(`Done`);
      }
    }
  }, [totalSeconds, createdAt, initialSecondsLeft, setState]);

  return counter ? <>[{counter}]</> : <></>;
};
