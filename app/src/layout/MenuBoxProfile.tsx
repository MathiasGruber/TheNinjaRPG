import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import MenuBox from "./MenuBox";
import StatusBar from "./StatusBar";
import AvatarImage from "./Avatar";
import { energyPerSecond } from "@/libs/train";
import { useUserData } from "@/utils/UserContext";
import { Settings, ShieldCheck, Moon, Sun, Heart } from "lucide-react";
import { sealCheck } from "@/libs/combat/tags";
import { isEffectActive } from "@/libs/combat/util";
import { getDaysHoursMinutesSeconds, getGameTime } from "@/utils/time";
import { useGameMenu } from "@/libs/menus";
import type { UserStatuses } from "../../drizzle/constants";
import type { UserEffect } from "@/libs/combat/types";

const socials = [
  {
    url: "https://discord.gg/QPgKtJVvwq",
    image: "/images/discord.png",
    alt: "Discord",
  },
  {
    url: "https://www.facebook.com/profile.php?id=61554961626034",
    image: "/images/facebook.png",
    alt: "Facebook",
  },
  {
    url: "https://www.youtube.com/@fullstackscientist",
    image: "/images/youtube.png",
    alt: "Youtube",
  },
  {
    url: "https://twitter.com/RealTheNinjaRPG",
    image: "/images/twitter.png",
    alt: "Twitter",
  },
  {
    url: "https://www.instagram.com/theninjarpg/",
    image: "/images/instagram.png",
    alt: "Instagram",
  },
  {
    url: "https://www.tiktok.com/@theninjarpg",
    image: "/images/tiktok.png",
    alt: "Tiktok",
  },
  {
    url: "https://www.reddit.com/r/theninjarpg/",
    image: "/images/reddit.png",
    alt: "Reddit",
  },
];

const MenuBoxProfile: React.FC = () => {
  const { data: userData, battle, refetch: refetchUserData, timeDiff } = useUserData();
  const [, setState] = useState<number>(0);
  const [gameTime, setGameTime] = useState<string>(getGameTime());

  // Update the gameTime with the UTC HH:MM:SS timestring every second
  useEffect(() => {
    const interval = setInterval(() => {
      setGameTime(getGameTime());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Get location of user
  const { location } = useGameMenu(userData);

  // Only show if we have user
  if (!userData) return null;

  /** Convenience methods for showing effects */
  const showStat = (
    effect: UserEffect,
    qualifier: string,
    key: number,
    className: string,
    arrow: string,
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

  const show = (
    i: number,
    txt: string,
    color: string,
    qualifier: string | React.ReactNode,
  ) => {
    return (
      <li key={i} className={`${color}`}>
        <div className="flex flex-row">
          {qualifier} {txt}
        </div>
      </li>
    );
  };

  // Derived data
  const active = battle?.usersEffects.filter(isEffectActive);
  const sealEffects = battle && active?.filter((e) => e.type === "seal" && !e.isNew);
  const immunitySecondsLeft = (userData.immunityUntil.getTime() - Date.now()) / 1000;

  // Status link
  const statusLink = (status: (typeof UserStatuses)[number]) => {
    switch (status) {
      case "BATTLE":
        return (
          <Link href="/combat" className="flex flex-row hover:text-orange-500">
            BATTLE <ShieldCheck className="ml-1 h-6 w-6 hover:fill-orange-500" />
          </Link>
        );
      case "ASLEEP":
        return (
          <Link href="/home" className="flex flex-row hover:text-orange-500">
            ASLEEP <Moon className="ml-1 h-6 w-6 hover:fill-orange-500" />
          </Link>
        );
      case "AWAKE":
        if (location) {
          return (
            <Link href="/home" className="flex flex-row hover:text-orange-500">
              AWAKE <Sun className="ml-1 h-6 w-6 hover:fill-orange-500" />
            </Link>
          );
        } else {
          return <span>{userData.status}</span>;
        }
      default:
        return <span>{userData.status}</span>;
    }
  };

  return (
    <>
      <MenuBox
        title={"Hi " + userData.username}
        link={
          <Link href="/avatar">
            <Settings className="h-6 w-6 hover:fill-orange-500" />
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
            timeDiff={timeDiff}
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
            timeDiff={timeDiff}
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
            timeDiff={timeDiff}
          />
          <StatusBar
            title="EP"
            tooltip="Energy"
            color="bg-yellow-500"
            showText={true}
            lastRegenAt={
              userData.currentlyTraining ? userData.trainingStartedAt : userData.regenAt
            }
            regen={
              userData.currentlyTraining
                ? -energyPerSecond(userData.trainingSpeed)
                : userData.regeneration
            }
            status={userData.status}
            current={userData.curEnergy}
            total={userData.maxEnergy}
            timeDiff={timeDiff}
          />

          <div className="mt-4">
            <hr />
            <p className="mt-2 flex flex-row">
              <b>Status: </b>{" "}
              <span className="ml-1">{statusLink(userData.status)}</span>
            </p>
            <p className="">
              <b>Time: </b> {gameTime}
            </p>
          </div>
          {userData.immunityUntil > new Date() && (
            <>
              <hr className="my-2" />
              <div className="flex flex-row">
                <ShieldCheck className="h-6 w-6 mr-2" />
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
                  .filter((e) => e.targetId === userData.userId)
                  .filter((e) => e.rounds === undefined || e.rounds > 0)
                  .map((effect, i) => {
                    let cooldown = "";
                    if (effect.rounds && battle) {
                      cooldown = `[${effect.rounds} rounds]`;
                    }
                    const isSealed = sealEffects && sealCheck(effect, sealEffects);
                    const positive = effect.power && effect.power > 0;
                    const arrow = positive ? "↑" : "↓";
                    let className = isSealed ? "line-through" : "";
                    if (["poolcostadjust", "damage"].includes(effect.type)) {
                      className = positive ? "text-red-500" : "text-green-500";
                    } else {
                      className = positive ? "text-green-500" : "text-red-500";
                    }
                    if (effect.type === "increasestat") {
                      return showStat(effect, "increased", i, "text-green-500", "↑");
                    } else if (effect.type === "decreasestat") {
                      return showStat(effect, "decreased", i, "text-red-500", "↓");
                    } else if (effect.type === "increasedamagegiven") {
                      return showStat(effect, "damage", i, "text-green-500", "↑");
                    } else if (effect.type === "decreasedamagegiven") {
                      return showStat(effect, "damage", i, "text-red-500", "↓");
                    } else if (effect.type === "increasedamagetaken") {
                      return showStat(effect, "protection", i, "text-red-500", "↓");
                    } else if (effect.type === "decreasedamagetaken") {
                      return showStat(effect, "protection", i, "text-green-500", "↑");
                    } else if (effect.type === "increaseheal") {
                      return showStat(effect, "healing", i, "text-green-500", "↑");
                    } else if (effect.type === "decreaseheal") {
                      return showStat(effect, "healing", i, "text-red-500", "↓");
                    } else if (effect.type === "absorb") {
                      return showStat(effect, "absorb", i, className, arrow);
                    } else if (effect.type === "reflect") {
                      return showStat(effect, "reflect", i, className, arrow);
                    } else if (effect.type === "damage") {
                      const icon = <Heart className="h-6 w-6 mr-2" />;
                      return show(i, `Dmg ${cooldown}`, className, icon);
                    } else if (effect.type === "heal") {
                      const icon = <Heart className="h-6 w-6 mr-2" />;
                      return show(i, `Heal ${cooldown}`, className, icon);
                    } else if (effect.type === "increasepoolcost") {
                      return show(i, `Action cost ${cooldown}`, "text-red-500", "↑");
                    } else if (effect.type === "decreasepoolcost") {
                      return show(i, `Action cost ${cooldown}`, "text-green-500", "↓");
                    } else if (effect.type === "fleeprevent") {
                      return show(i, `Cannot flee ${cooldown}`, "text-blue-500", "-");
                    } else if (effect.type === "robprevent") {
                      return show(i, `Rob Immunity ${cooldown}`, "text-blue-500", "-");
                    } else if (effect.type === "stunprevent") {
                      return show(
                        i,
                        `Stun Resistance ${cooldown}`,
                        "text-blue-500",
                        "-",
                      );
                    } else if (effect.type === "stun" && effect.rounds) {
                      return show(i, `Stunned ${cooldown}`, "text-blue-500", "-");
                    } else if (effect.type === "onehitkillprevent" && effect.rounds) {
                      return show(i, `OHKO immunity ${cooldown}`, "text-blue-500", "-");
                    } else if (effect.type === "sealprevent" && effect.rounds) {
                      return show(i, `Seal immunity ${cooldown}`, "text-blue-500", "-");
                    } else if (effect.type === "seal" && effect.rounds) {
                      return show(i, `BL Sealed ${cooldown}`, "text-blue-500", "-");
                    } else if (effect.type === "clear") {
                      return show(i, `Clearing positive effects`, "text-blue-500", "-");
                    } else if (effect.type === "cleanse") {
                      return show(i, `Clearing negative effects`, "text-blue-500", "-");
                    } else {
                      return <div key={i}>Unparsed: {effect.type}</div>;
                    }
                  })}
              </ul>
            </>
          )}
        </div>
      </MenuBox>
      <div className="px-2 flex align-center justify-center">
        {socials.map((social, i) => {
          return (
            <a target="_blank" href={social.url} key={i} className="hover:opacity-80">
              <Image src={social.image} width={64} height={64} alt={social.alt}></Image>
            </a>
          );
        })}
      </div>
    </>
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
