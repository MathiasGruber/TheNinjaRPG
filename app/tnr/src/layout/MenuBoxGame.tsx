import React from "react";
import Link from "next/link";
import MenuBox from "./MenuBox";

import { useUser } from "../utils/UserContext";
import {
  GlobeAmericasIcon,
  ShieldExclamationIcon,
  UserGroupIcon,
} from "@heroicons/react/24/solid";

const systems = [
  ["Tavern", <UserGroupIcon key="tavern" className="h-6 w-6" />],
  ["Reports", <ShieldExclamationIcon key="reports" className="h-6 w-6" />],
  ["Travel", <GlobeAmericasIcon key="travel" className="h-6 w-6" />],
] as const;

const MenuBoxGame: React.FC = () => {
  const { data: userData } = useUser();
  if (!userData) {
    return <div></div>;
  }
  return (
    <MenuBox title="Main Menu">
      <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {systems.map((system, i) => (
          <Link key={i} href={"/" + system[0].toLowerCase()}>
            <li className="flex flex-row rounded-lg border-2 border-slate-800 bg-orange-100 p-2 font-bold hover:bg-orange-200">
              <div className="grow">{system[0]}</div>
              <div>{system[1]}</div>
            </li>
          </Link>
        ))}
      </ul>
    </MenuBox>
  );
};

export default MenuBoxGame;
