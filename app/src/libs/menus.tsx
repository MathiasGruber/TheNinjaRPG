import { type ReactNode } from "react";
import Image from "next/image";
import { Atom, Bug, User, Globe2, BookOpenText, Users } from "lucide-react";
import { Paintbrush, MessagesSquare, Newspaper, Scale, Receipt } from "lucide-react";
import { Inbox, Flag } from "lucide-react";
import { calcIsInVillage } from "./travel/controls";
import { api } from "@/app/_trpc/client";
import { findVillageUserRelationship } from "@/utils/alliance";
import type { UserWithRelations } from "@/server/api/routers/profile";

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
export const getMainNavbarLinks = () => {
  const links: NavBarDropdownLink[] = [
    {
      href: "/news",
      name: "News",
      icon: <Newspaper className="h-6 w-6" />,
    },
    {
      href: "/manual",
      name: "Info",
      icon: <Scale className="h-6 w-6" />,
    },
    {
      href: "/forum",
      name: "Forum",
      icon: <MessagesSquare className="h-6 w-6" />,
    },
    {
      href: "/help",
      name: "Bugs",
      icon: <Bug className="h-6 w-6" />,
    },
    {
      href: "/conceptart",
      name: "Art",
      icon: <Paintbrush className="h-6 w-6" />,
    },
  ];
  return links;
};

export const useGameMenu = (userData: UserWithRelations) => {
  const systems: NavBarDropdownLink[] = [
    {
      href: "/tavern",
      name: "Tavern",
      icon: <Users key="tavern" className="h-6 w-6" />,
    },
    {
      href: "/inbox",
      name: "Inbox",
      icon: <Inbox key="inbox" className="h-6 w-6" />,
    },
    {
      href: "/users",
      name: "Users",
      icon: <BookOpenText key="users" className="h-6 w-6" />,
    },
    {
      href: "/reports",
      name: "Reports",
      icon: <Flag key="reports" className="h-6 w-6" />,
    },
    {
      href: "/travel",
      name: "Travel",
      requireAwake: true,
      icon: <Globe2 key="travel" className="h-6 w-6" />,
    },
    {
      href: "/jutsus",
      name: "Jutsus",
      requireAwake: false,
      icon: <Atom key="jutsus" className="h-6 w-6" />,
    },
    {
      href: "/items",
      name: "Items",
      requireAwake: false,
      icon: <User key="items" className="h-6 w-6" />,
    },
    {
      href: "/points",
      name: "Points",
      icon: <Receipt key="travel" className="h-6 w-6" />,
    },
  ];

  // Get information from the sector the user is currently in. No stale time
  const { data: sector } = api.travel.getVillageInSector.useQuery(
    { sector: userData?.sector ?? -1, isOutlaw: userData?.isOutlaw ?? false },
    { enabled: !!userData },
  );

  // Based on user status, update href of systems
  if (userData) {
    // For entries that require awake, check if user is awake
    const inBattle = userData.status === "BATTLE";
    const inHospital = userData.status === "HOSPITALIZED";
    const inBed = userData.status === "ASLEEP";
    const notAwake = inBattle || inHospital || inBed;
    systems.forEach((system) => {
      if (system.requireAwake && notAwake) {
        if (inBattle) system.href = "/combat";
        if (inHospital) system.href = "/hospital";
        if (inBed) system.href = "/home";
      }
    });
  }

  // Pre-defined location as undefined
  let location: NavBarDropdownLink | undefined = undefined;
  if (userData && sector) {
    // Check if user is in own village, or in
    const userVillage = userData.villageId ?? "syndicate";
    const ownSector = userData.sector === userData.village?.sector;
    const inVillage = calcIsInVillage({ x: userData.longitude, y: userData.latitude });
    const relationship = findVillageUserRelationship(sector, userVillage);
    const isAllied = relationship?.status === "ALLY";
    const isSafezone = sector.type === "SAFEZONE";

    // Is in village
    if ((inVillage && (ownSector || isAllied)) || userData.isOutlaw || isSafezone) {
      location = {
        href: "/village",
        name: "Village",
        requireAwake: true,
        icon: (
          <div>
            <Image
              src={sector.villageGraphic}
              alt={sector.name}
              width={200}
              height={200}
              priority={true}
            />
            <span className="font-bold">
              {sector.mapName || sector.name}{" "}
              {sector.type === "VILLAGE" ? "Village" : ""}
            </span>
          </div>
        ),
      };
    }
  }

  return { systems, location };
};
