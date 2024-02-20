import React from "react";
import Link from "next/link";
import MenuBox from "./MenuBox";
import { Megaphone, Info, ShieldAlert, ShieldCheck } from "lucide-react";
import { getMainGameLinks } from "@/libs/menus";
import { useUserData } from "@/utils/UserContext";
import type { NavBarDropdownLink } from "@/libs/menus";

interface MenuBoxGameProps {
  notifications: NavBarDropdownLink[] | undefined;
}

const MenuBoxGame: React.FC<MenuBoxGameProps> = (props) => {
  const { data: userData } = useUserData();
  const { systems, location } = getMainGameLinks(userData);
  if (!userData) {
    return <div></div>;
  }

  const inBattle = userData.status === "BATTLE";

  return (
    <>
      <MenuBox
        title="Main Menu"
        link={
          <Link href="/notify">
            <Megaphone className="h-6 w-6 hover:fill-black" />
          </Link>
        }
      >
        {props.notifications && props.notifications.length > 0 && (
          <ul className="grid grid-cols-1 gap-2">
            {props.notifications
              .filter((n) => n.color !== "toast")
              .map((notification, i) => (
                <Link key={i} href={notification.href}>
                  <div
                    className={`flex flex-row items-center rounded-lg border-2 border-slate-800 p-1 pl-3 hover:opacity-70 ${
                      notification.color
                        ? `bg-${notification.color}-500`
                        : "bg-slate-500"
                    }`}
                  >
                    {notification.color === "red" && (
                      <ShieldAlert className="mr-2 h-6 w-6" />
                    )}
                    {notification.color === "blue" && <Info className="mr-2 h-6 w-6" />}
                    {notification.color === "green" && (
                      <ShieldCheck className="mr-2 h-6 w-6" />
                    )}
                    {notification.name}
                  </div>
                </Link>
              ))}
          </ul>
        )}
        <ul className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
          {systems.map((system, i) => {
            const disabled = system.requireAwake && userData?.status !== "AWAKE";
            return (
              <Link
                key={i}
                href={system.href}
                className={system.className ? system.className : ""}
              >
                <li
                  className={`flex flex-row items-center text-base lg:text-sm rounded-lg border-2 border-slate-800 bg-orange-100 p-2 font-bold ${
                    disabled ? "opacity-30" : "hover:bg-orange-200"
                  } ${system.className ? system.className : ""}`}
                >
                  <div className="grow">{system.name}</div>
                  <div>{system.icon && system.icon}</div>
                </li>
              </Link>
            );
          })}
        </ul>
        {location && (
          <div className={inBattle && location.requireAwake ? "opacity-30" : ""}>
            <Link
              href={inBattle && location.requireAwake ? "/combat" : "/village"}
              className="hidden pt-3 text-center md:block"
            >
              {location.icon}
            </Link>
          </div>
        )}
      </MenuBox>
      <div className="pl-2 flex align-center justify-center">
        <iframe
          src="https://ghbtns.com/github-btn.html?user=MathiasGruber&repo=TheNinjaRPG&type=star&count=true"
          width="90"
          height="20"
          title="GitHub"
        ></iframe>
      </div>
    </>
  );
};

export default MenuBoxGame;
