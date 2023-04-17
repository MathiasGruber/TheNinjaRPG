import { type ReactNode } from "react";
import {
  GlobeAmericasIcon,
  UserGroupIcon,
  InboxStackIcon,
  BookOpenIcon,
  CurrencyDollarIcon,
  BuildingStorefrontIcon,
  FireIcon,
  UserIcon,
} from "@heroicons/react/24/solid";
import { ShieldExclamationIcon } from "@heroicons/react/24/outline";

import { type UserDataWithRelations } from "../utils/UserContext";
import { calcIsInVillage } from "./travel/controls";

export interface NavBarDropdownLink {
  href: string;
  name: string;
  combatRedirect?: boolean;
  color?: "default" | "red" | "green" | "blue";
  icon?: ReactNode;
  onClick?: () => Promise<void>;
}

/**
 * Get main navbar links
 */
export const getMainNavbarLinks = (isSignedIn: boolean | undefined) => {
  const links: NavBarDropdownLink[] = [
    {
      href: "/manual",
      name: "Manual",
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
  if (!isSignedIn) {
    links.push({
      href: "/login",
      name: "Login",
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
      href: "/users",
      name: "Users",
      icon: <BookOpenIcon key="users" className="h-6 w-6" />,
    },
    {
      href: "/reports",
      name: "Reports",
      icon: <ShieldExclamationIcon key="reports" className="h-6 w-6" />,
    },
    {
      href: "/travel",
      name: "Travel",
      combatRedirect: true,
      icon: <GlobeAmericasIcon key="travel" className="h-6 w-6" />,
    },
    {
      href: "/jutsus",
      name: "Jutsus",
      combatRedirect: true,
      icon: <FireIcon key="jutsus" className="h-6 w-6" />,
    },
    {
      href: "/items",
      name: "Items",
      combatRedirect: true,
      icon: <UserIcon key="items" className="h-6 w-6" />,
    },
    {
      href: "/points",
      name: "Points",
      icon: <CurrencyDollarIcon key="travel" className="h-6 w-6" />,
    },
  ];
  // Is in village
  if (
    userData &&
    userData.sector === userData.village?.sector &&
    calcIsInVillage({
      x: userData.longitude,
      y: userData.latitude,
    })
  ) {
    links.push({
      href: "/village",
      name: "Village",
      icon: <BuildingStorefrontIcon key="village" className="h-6 w-6" />,
    });
  }

  return links;
};
