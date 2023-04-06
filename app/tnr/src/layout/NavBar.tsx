import React from "react";
import Link from "next/link";
import IconGlobe from "../icons/IconGlobe";
import IconHome from "../icons/IconHome";
import AvatarImage from "./Avatar";
import StatusBar from "./StatusBar";
import NavBarDropdown from "./NavBarDropdown";

import { useSession } from "next-auth/react";
import { useUser } from "../utils/UserContext";
import { getMainNavbarLinks } from "../libs/menus";
import { getMainGameLinks } from "../libs/menus";

const NavBar: React.FC = () => {
  const { data: sessionData } = useSession();
  const { data: userData } = useUser();
  // Main links
  const navLinks = getMainNavbarLinks(sessionData);
  const gameLinks = getMainGameLinks(userData);
  // Top element of mobile navbar
  const topElement = userData && (
    <div className="flex flex-row">
      <div className="basis-1/3">
        <AvatarImage
          href={userData.avatar}
          userId={userData.userId}
          alt={userData.username}
          hover_effect={true}
          size={100}
        />
      </div>
      <div className="basis-2/3 px-2">
        <StatusBar
          title="HP"
          tooltip="Health"
          color="bg-red-500"
          current={userData.cur_health}
          total={userData.max_health}
        />
        <StatusBar
          title="CP"
          tooltip="Chakra"
          color="bg-blue-500"
          current={userData.cur_chakra}
          total={userData.max_chakra}
        />
        <StatusBar
          title="SP"
          tooltip="Stamina"
          color="bg-green-500"
          current={userData.cur_stamina}
          total={userData.max_stamina}
        />
      </div>
    </div>
  );
  // Return navbar
  return (
    <>
      <div className="rounded-md bg-gradient-to-t from-orange-800 to-orange-600 text-center">
        <div className="hidden w-full flex-row p-3 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              className="basis-1/5 font-bold"
              href={link.href}
              onClick={link.onClick}
              prefetch={false}
            >
              {link.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-row px-2 pt-2 md:hidden">
        <div>
          <NavBarDropdown
            icon={<IconHome />}
            position="left"
            links={navLinks}
            topElement={topElement}
            topElementLink="avatar"
          />
        </div>
        <div className="grow">
          <h1 className="my-2 text-center font-fontasia text-5xl text-white md:text-8xl">
            <Link href="/">TheNinja-RPG</Link>
          </h1>
        </div>
        <div>
          <NavBarDropdown icon={<IconGlobe />} links={gameLinks} position="right" />
        </div>
      </div>
    </>
  );
};

export default NavBar;
