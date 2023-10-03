import { type ReactNode } from "react";
import Image from "next/image";
import {
  GlobeAmericasIcon,
  UserGroupIcon,
  InboxStackIcon,
  BookOpenIcon,
  CurrencyDollarIcon,
  BuildingStorefrontIcon,
  FireIcon,
  UserIcon,
  // BeakerIcon,
  // WrenchIcon,
  // RectangleGroupIcon,
} from "@heroicons/react/24/solid";
import { ShieldExclamationIcon } from "@heroicons/react/24/outline";
import { calcIsInVillage } from "./travel/controls";
import type { UserWithRelations } from "../server/api/routers/profile";

export interface NavBarDropdownLink {
  href: string;
  name: string;
  requireAwake?: boolean;
  className?: string;
  color?: "default" | "red" | "green" | "blue" | "toast";
  icon?: ReactNode;
  onClick?: () => Promise<void>;
}

/**
 * Get main navbar links
 */
export const getMainNavbarLinks = (isSignedIn: boolean | undefined) => {
  const links: NavBarDropdownLink[] = [
    {
      href: "/news",
      name: "News",
    },
    {
      href: "/manual",
      name: "Game Info",
    },
    {
      href: "/forum",
      name: "Forum",
    },
    {
      href: "/help",
      name: "Bugs & Help",
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
export const getMainGameLinks = (userData: UserWithRelations) => {
  const systems: NavBarDropdownLink[] = [
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
      requireAwake: true,
      icon: <GlobeAmericasIcon key="travel" className="h-6 w-6" />,
    },
    {
      href: "/jutsus",
      name: "Jutsus",
      requireAwake: true,
      icon: <FireIcon key="jutsus" className="h-6 w-6" />,
    },
    {
      href: "/items",
      name: "Items",
      requireAwake: true,
      icon: <UserIcon key="items" className="h-6 w-6" />,
    },
    {
      href: "/points",
      name: "Points",
      icon: <CurrencyDollarIcon key="travel" className="h-6 w-6" />,
    },
  ];
  // Add back in if needed, until then incorporate things closer in the game
  // if (userData && ["CONTENT", "ADMIN"].includes(userData.role)) {
  //   systems.push({
  //     href: "/cpanel",
  //     name: `Content`,
  //     icon: <BeakerIcon key="cpanel" className="h-6 w-6" />,
  //   });
  // }
  // if (userData && ["MODERATOR", "ADMIN"].includes(userData.role)) {
  //   systems.push({
  //     href: "/mpanel",
  //     name: `Moderate`,
  //     icon: <WrenchIcon key="mpanel" className="h-6 w-6" />,
  //   });
  // }
  // if (userData && ["ADMIN"].includes(userData.role)) {
  //   systems.push({
  //     href: "/apanel",
  //     name: `Admin`,
  //     icon: <RectangleGroupIcon key="mpanel" className="h-6 w-6" />,
  //   });
  // }

  // Is in village
  let location: NavBarDropdownLink | undefined = undefined;
  if (
    userData &&
    userData.sector === userData.village?.sector &&
    calcIsInVillage({
      x: userData.longitude,
      y: userData.latitude,
    })
  ) {
    // Village link for small screens
    systems.push({
      href: "/village",
      name: "Village",
      requireAwake: true,
      className: "block md:hidden",
      icon: <BuildingStorefrontIcon key="village" className="h-6 w-6" />,
    });
    // Location display for later screens
    location = {
      href: "/village",
      name: "Village",
      requireAwake: true,
      className: "lg:hidden",
      icon: (
        <div>
          <Image
            src={`/map/${userData.village.name}.webp`}
            alt={userData.village.name}
            width={200}
            height={200}
            priority={true}
          />
          <span className="font-bold">{userData.village.name} Village</span>
        </div>
      ),
    };
  }

  return { systems, location };
};
