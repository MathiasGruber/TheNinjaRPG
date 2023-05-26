import React, { useEffect, useState } from "react";
import Link from "next/link";
import { UserStatus } from "@prisma/client";

import MenuBox from "./MenuBox";
import StatusBar from "./StatusBar";
import AvatarImage from "./Avatar";
import { useUserData } from "../utils/UserContext";
import { WrenchScrewdriverIcon } from "@heroicons/react/24/solid";
import { sealCheck } from "../libs/combat/tags";
import { isEffectStillActive } from "../libs/combat/util";
import { getDaysHoursMinutesSeconds } from "../utils/time";
import { COMBAT_SECONDS } from "../libs/combat/constants";
import type { UserEffect } from "../libs/combat/types";

const MenuBoxProfile: React.FC = () => {
  const { data: userData, battle } = useUserData();
  const [state, setState] = useState<number>(0);

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
        <Link href="/avatar">
          <AvatarImage
            href={userData.avatar}
            userId={userData.userId}
            alt={userData.username}
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
          current={userData.cur_health}
          total={userData.max_health}
        />
        <StatusBar
          title="CP"
          tooltip="Chakra"
          color="bg-blue-500"
          showText={true}
          lastRegenAt={userData.regenAt}
          regen={userData.regeneration}
          status={userData.status}
          current={userData.cur_chakra}
          total={userData.max_chakra}
        />
        <StatusBar
          title="SP"
          tooltip="Stamina"
          color="bg-green-500"
          showText={true}
          lastRegenAt={userData.regenAt}
          regen={userData.regeneration}
          status={userData.status}
          current={userData.cur_stamina}
          total={userData.max_stamina}
        />

        <div className="mt-4">
          <hr />
          <p className="mt-2">
            <b>Status:</b>{" "}
            {userData.status === UserStatus.BATTLE ? (
              <Link className="font-bold  " href="/combat">
                BATTLE
              </Link>
            ) : (
              userData.status
            )}
          </p>
        </div>
        {active && (
          <>
            <hr className="my-2" />
            <ul className="italic">
              {active
                .filter((u) => u.targetId === userData.userId)
                .map((effect, i) => {
                  let cooldown = <></>;
                  if (effect.rounds) {
                    cooldown = (
                      <Cooldown
                        effect={effect}
                        setState={setState}
                        start={
                          effect.createdAt +
                          effect.rounds * COMBAT_SECONDS * 1000 -
                          Date.now()
                        }
                      />
                    );
                  }
                  const isSealed = sealEffects && sealCheck(effect, sealEffects);
                  const positive = effect.power && effect.power > 0;
                  const arrow = positive ? "↑" : "↓";
                  const direction = positive ? "increased" : "decreased";
                  let className = isSealed ? "line-through" : "";
                  if (["poolcostadjust"].includes(effect.type)) {
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

interface CooldownProps {
  effect: UserEffect;
  start: number;
  setState: React.Dispatch<React.SetStateAction<number>>;
}

const Cooldown: React.FC<CooldownProps> = (props) => {
  const { createdAt, rounds } = props.effect;
  const [counter, setCounter] = useState<string>("");

  useEffect(() => {
    if (rounds) {
      const secondsLeft = createdAt + rounds * COMBAT_SECONDS * 1000 - Date.now();
      if (secondsLeft > 0) {
        const interval = setInterval(() => {
          const [days, hours, minutes, seconds] =
            getDaysHoursMinutesSeconds(secondsLeft);
          const minutesStr = minutes.toString().padStart(2, "0");
          const secondsStr = seconds.toString().padStart(2, "0");
          setCounter(`${minutesStr}:${secondsStr}`);
        }, 1000);
        return () => clearInterval(interval);
      } else {
        if (props.start > 0) {
          props.setState((prev) => prev + 1);
        }
        setCounter(`Done`);
      }
    }
  });

  if (!rounds) return <></>;
  return counter ? <>[{counter}]</> : <></>;
};
