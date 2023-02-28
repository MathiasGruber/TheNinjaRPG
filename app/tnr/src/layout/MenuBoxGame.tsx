import React from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import MenuBox from "./MenuBox";

import { getUserNotifications } from "../libs/menus";
import { getMainGameLinks } from "../libs/menus";
import { useUser } from "../utils/UserContext";

const MenuBoxGame: React.FC = () => {
  const { data: sessionData } = useSession();
  const { data: userData } = useUser();

  const systems = getMainGameLinks(userData);
  const notifications = getUserNotifications(userData, sessionData);

  if (!userData) {
    return <div></div>;
  }
  return (
    <MenuBox title="Main Menu">
      {notifications.length > 0 && (
        <ul className="grid grid-cols-1 gap-2">
          {notifications.map((notification, i) => (
            <Link key={i} href={notification.href}>
              <div
                className={`flex flex-row items-center rounded-lg border-2 border-slate-800 p-1 pl-3 hover:opacity-70 ${
                  notification.color
                    ? `bg-${notification.color}-500`
                    : "bg-slate-500"
                }`}
              >
                {notification.icon}
                {notification.name}
              </div>
            </Link>
          ))}
        </ul>
      )}
      <ul className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
        {systems.map((system, i) => (
          <Link key={i} href={system.href}>
            <li className="flex flex-row rounded-lg border-2 border-slate-800 bg-orange-100 p-2 font-bold hover:bg-orange-200">
              <div className="grow">{system.name}</div>
              <div>{system.icon && system.icon}</div>
            </li>
          </Link>
        ))}
      </ul>
    </MenuBox>
  );
};

export default MenuBoxGame;
