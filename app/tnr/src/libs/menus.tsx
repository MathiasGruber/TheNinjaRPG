import { type ReactNode } from "react";
import {
  GlobeAmericasIcon,
  UserGroupIcon,
  InboxStackIcon,
} from "@heroicons/react/24/solid";
import { ShieldExclamationIcon } from "@heroicons/react/24/outline";

import { signOut, signIn } from "next-auth/react";
import { type Session } from "next-auth";
import { type UserDataWithRelations } from "../utils/UserContext";

export interface NavBarDropdownLink {
  href: string;
  name: string;
  color?: "default" | "red" | "green" | "blue";
  icon?: ReactNode;
  onClick?: () => Promise<undefined>;
}

/**
 * Get main navbar links
 */
export const getMainNavbarLinks = (sessionData: Session | null) => {
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
  return links;
};

/**
 * Get main game links
 */
export const getMainGameLinks = (userData: UserDataWithRelations) => {
  const links: NavBarDropdownLink[] = [
    {
      href: "/tavern",
      name: "Tavern",
      icon: <UserGroupIcon key="tavern" className="h-6 w-6" />,
    },
    {
      href: "/inbox",
      name: "Inbox",
      icon: <InboxStackIcon key="inbox" className="h-6 w-6" />,
    },
    {
      href: "/reports",
      name: "Reports",
      icon: <ShieldExclamationIcon key="reports" className="h-6 w-6" />,
    },
    {
      href: "/travel",
      name: "Travel",
      icon: <GlobeAmericasIcon key="travel" className="h-6 w-6" />,
    },
  ];
  return links;
};
