import React from "react";
import Link from "next/link";
import { UserStatus } from "@prisma/client";

import MenuBox from "./MenuBox";
import StatusBar from "./StatusBar";
import AvatarImage from "./Avatar";
import { useUserData } from "../utils/UserContext";
import { WrenchScrewdriverIcon } from "@heroicons/react/24/solid";

const MenuBoxProfile: React.FC = () => {
  const { data: userData, battle } = useUserData();

  if (!userData) {
    return <div></div>;
  }
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
        {battle && (
          <>
            <hr className="my-2" />
            <ul className="italic">
              {battle.usersEffects
                .filter((u) => u.targetId === userData.userId)
                .map((effect, i) => {
                  const positive = effect.power && effect.power > 0;
                  const arrow = positive ? "↑" : "↓";
                  const direction = positive ? "increased" : "decreased";
                  const color = positive ? "text-green-500" : "text-red-500";
                  if (effect.type === "armoradjust") {
                    return (
                      <li key={i} className={color}>
                        {arrow} Armor {direction}
                      </li>
                    );
                  } else if (effect.type === "statadjust" && "statTypes" in effect) {
                    return (
                      <div key={i}>
                        {effect.statTypes?.map((e) => {
                          return (
                            <li key={`${e}-${i}`} className={color}>
                              {arrow} {e} {direction}
                            </li>
                          );
                        })}
                        {effect.generalTypes?.map((e) => {
                          return (
                            <li key={`${e}-${i}`} className={color}>
                              {arrow} {e} {direction}
                            </li>
                          );
                        })}
                        {effect.elements?.map((e) => {
                          return (
                            <li key={`${e}-${i}`} className={color}>
                              {arrow} {e} affinity
                            </li>
                          );
                        })}
                      </div>
                    );
                  } else if (
                    effect.type === "damagegivenadjust" &&
                    "statTypes" in effect
                  ) {
                    return (
                      <div key={i}>
                        {effect.statTypes?.map((e) => {
                          return (
                            <li key={`${e}-${i}`} className={color}>
                              {arrow} {e} damage
                            </li>
                          );
                        })}
                        {effect.generalTypes?.map((e) => {
                          return (
                            <li key={`${e}-${i}`} className={color}>
                              {arrow} {e} damage
                            </li>
                          );
                        })}
                        {effect.elements?.map((e) => {
                          return (
                            <li key={`${e}-${i}`} className={color}>
                              {arrow} {e} damage
                            </li>
                          );
                        })}
                      </div>
                    );
                  } else if (
                    effect.type === "damagetakenadjust" &&
                    "statTypes" in effect
                  ) {
                    return (
                      <div key={i}>
                        {effect.statTypes?.map((e) => {
                          return (
                            <li key={`${e}-${i}`} className={color}>
                              {arrow} {e} protection
                            </li>
                          );
                        })}
                        {effect.generalTypes?.map((e) => {
                          return (
                            <li key={`${e}-${i}`} className={color}>
                              {arrow} {e} protection
                            </li>
                          );
                        })}
                        {effect.elements?.map((e) => {
                          return (
                            <li key={`${e}-${i}`} className={color}>
                              {arrow} {e} protection
                            </li>
                          );
                        })}
                      </div>
                    );
                  } else if (effect.type === "healadjust" && "statTypes" in effect) {
                    return (
                      <div key={i}>
                        {effect.statTypes?.map((e) => {
                          return (
                            <li key={`${e}-${i}`} className={color}>
                              {arrow} {e} healing
                            </li>
                          );
                        })}
                        {effect.generalTypes?.map((e) => {
                          return (
                            <li key={`${e}-${i}`} className={color}>
                              {arrow} {e} healing
                            </li>
                          );
                        })}
                        {effect.elements?.map((e) => {
                          return (
                            <li key={`${e}-${i}`} className={color}>
                              {arrow} {e} healing
                            </li>
                          );
                        })}
                      </div>
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
