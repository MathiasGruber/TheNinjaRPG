import React from "react";
import Link from "next/link";
import IconGlobe from "./IconGlobe";
import IconHome from "./IconHome";
import AvatarImage from "./Avatar";
import StatusBar from "./StatusBar";
import NavBarDropdown, { type NavBarDropdownLink } from "./NavBarDropdown";
import { useSession } from "next-auth/react";
import { signOut, signIn } from "next-auth/react";
import { useUser } from "../utils/UserContext";

const NavBar: React.FC = () => {
  const { data: sessionData } = useSession();
  const { data: userData } = useUser();
  // Main links in navbar
  const links: NavBarDropdownLink[] = [
    {
      href: "/",
      name: "Home",
    },
    {
      href: "/forum",
      name: "Forum",
    },
    {
      href: "/bugs",
      name: "Bugs",
    },
    {
      href: "/github",
      name: "Contribute",
    },
  ];
  // Add login or logout button
  if (sessionData) {
    links.push({
      href: "/",
      name: "Logout",
      onClick: () => signOut(),
    });
  } else {
    links.push({
      href: "/",
      name: "Login",
      onClick: () => signIn(),
    });
  }
  // Top element of mobile navbar
  const topElement = userData && (
    <div className="flex flex-row">
      <div className="basis-1/3">
        <AvatarImage
          href={userData.avatar}
          alt={userData.username}
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
          {links.map((link) => (
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
            links={links}
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
          <NavBarDropdown icon={<IconGlobe />} position="right" />
        </div>
      </div>
    </>
  );
};

export default NavBar;
