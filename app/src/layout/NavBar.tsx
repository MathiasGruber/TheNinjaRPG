// TODO: Deprecated once pages router is done
import React from "react";
import Link from "next/link";
import Image from "next/image";
import IconGlobe from "../icons/IconGlobe";
import IconHome from "../icons/IconHome";
import AvatarImage from "./Avatar";
import StatusBar from "./StatusBar";
import NavBarDropdown from "./NavBarDropdown";

import { energyPerSecond } from "@/libs/train";
import { UserButton } from "@clerk/nextjs";
import { useAuth } from "@clerk/nextjs";
import { useUserData } from "@/utils/UserContext";
import { getMainNavbarLinks } from "@/libs/menus";
import { useGameMenu } from "@/libs/menus";
import type { NavBarDropdownLink } from "@/libs/menus";

interface NavBarProps {
  notifications: NavBarDropdownLink[] | undefined;
}

const NavBar: React.FC<NavBarProps> = (props) => {
  // Information on user
  const { notifications } = props;
  const { isSignedIn } = useAuth();
  const { data: userData } = useUserData();

  // Main links
  const navLinks = getMainNavbarLinks();

  // Top element of mobile navbar
  const topElement = userData && (
    <div className="flex flex-row">
      <div className="my-3 basis-1/3">
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
          regen={userData.regeneration}
          lastRegenAt={userData.regenAt}
          status={userData.status}
          current={userData.curHealth}
          total={userData.maxHealth}
        />
        <StatusBar
          title="CP"
          tooltip="Chakra"
          color="bg-blue-500"
          regen={userData.regeneration}
          lastRegenAt={userData.regenAt}
          status={userData.status}
          current={userData.curChakra}
          total={userData.maxChakra}
        />
        <StatusBar
          title="SP"
          tooltip="Stamina"
          color="bg-green-500"
          regen={userData.regeneration}
          lastRegenAt={userData.regenAt}
          status={userData.status}
          current={userData.curStamina}
          total={userData.maxStamina}
        />
      </div>
    </div>
  );

  // Links to show on game menu
  const { systems } = useGameMenu(userData);
  const gameLinks = notifications ? [...notifications, ...systems] : systems;

  // Return navbar
  return (
    <>
      <div className="rounded-md bg-gradient-to-t from-orange-800 to-orange-600 text-center">
        <div className="hidden w-full md:grid p-3 grid-cols-12 ml-3">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              className="col-span-2 font-bold hover:text-orange-500 flex flex-row gap-1"
              href={link.href}
              onClick={async () => {
                if (link.onClick) {
                  await link.onClick();
                }
              }}
              prefetch={false}
            >
              {link.icon}
              {link.name}
            </Link>
          ))}
          {isSignedIn && (
            <UserButton
              appearance={{
                elements: {
                  rootBox: " justify-center items-center",
                  userButtonBox: " justify-center items-center",
                },
              }}
              signInUrl="/login"
              afterSignOutUrl="/"
              afterSwitchSessionUrl="/profile"
              afterMultiSessionSingleSignOutUrl="/login"
            />
          )}
        </div>
      </div>

      <div className="flex flex-row px-2 items-center pt-2 md:hidden">
        <NavBarDropdown
          icon={<IconHome />}
          position="left"
          links={navLinks}
          topElement={topElement}
          topElementLink="avatar"
        />
        <div className="grow">
          <div className="my-1">
            <Link href="/">
              <Image
                className="ml-auto mr-auto"
                src="/logo_short.webp"
                width={256}
                height={65}
                alt="logo"
                priority
              />
            </Link>
          </div>
        </div>
        <div className="flex flex-row items-start">
          <UserButton
            appearance={{
              elements: {
                rootBox: "flex flex-row pr-1",
                avatarBox: "w-12 h-12 border-2 border-slate-700",
              },
            }}
            signInUrl="/login"
            afterSignOutUrl="/"
            afterSwitchSessionUrl="/profile"
            afterMultiSessionSingleSignOutUrl="/login"
          />
          <NavBarDropdown icon={<IconGlobe />} links={gameLinks} position="right" />
        </div>
      </div>
    </>
  );
};

export default NavBar;
