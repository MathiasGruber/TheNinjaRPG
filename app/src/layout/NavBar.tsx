import React from "react";
import Link from "next/link";
import IconGlobe from "../icons/IconGlobe";
import IconHome from "../icons/IconHome";
import AvatarImage from "./Avatar";
import StatusBar from "./StatusBar";
import NavBarDropdown from "./NavBarDropdown";

import { ENERGY_SPENT_PER_SECOND } from "../libs/train";
import { UserButton } from "@clerk/nextjs";
import { useAuth } from "@clerk/nextjs";
import { useUserData } from "../utils/UserContext";
import { getMainNavbarLinks } from "../libs/menus";
import { getMainGameLinks } from "../libs/menus";
import type { NavBarDropdownLink } from "../libs/menus";

interface NavBarProps {
  notifications: NavBarDropdownLink[] | undefined;
}

const NavBar: React.FC<NavBarProps> = (props) => {
  // Information on user
  const { notifications } = props;
  const { isSignedIn } = useAuth();
  const { data: userData } = useUserData();

  // Main links
  const navLinks = getMainNavbarLinks(isSignedIn);
  const { systems } = getMainGameLinks(userData);

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
        <StatusBar
          title="EP"
          tooltip="Energy"
          color="bg-yellow-500"
          lastRegenAt={
            userData.currentlyTraining ? userData.trainingStartedAt : userData.regenAt
          }
          regen={
            userData.currentlyTraining
              ? -ENERGY_SPENT_PER_SECOND
              : userData.regeneration
          }
          status={userData.status}
          current={userData.curEnergy}
          total={userData.maxEnergy}
        />
      </div>
    </div>
  );

  // Links to show on game menu
  const gameLinks = notifications ? notifications.concat(systems) : navLinks;

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
              onClick={async () => {
                if (link.onClick) {
                  await link.onClick();
                }
              }}
              prefetch={false}
            >
              {link.name}
            </Link>
          ))}
          {isSignedIn && (
            <UserButton
              appearance={{
                elements: {
                  rootBox: "basis-1/5 justify-center items-center",
                  userButtonBox: "basis-1/5 justify-center items-center",
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
