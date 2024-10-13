"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import MenuBoxProfile from "@/layout/MenuBoxProfile";
import MenuBoxCombat from "@/layout/MenuBoxCombat";
import Footer from "@/layout/Footer";
import Loader from "@/layout/Loader";
import NavTabs from "@/layout/NavTabs";
import AvatarImage from "@/layout/Avatar";
import SendTicketBtn from "@/layout/SendTicketButton";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Megaphone, Info, ShieldAlert, ShieldCheck, Eclipse } from "lucide-react";
import { Earth, House, MessageCircleWarning } from "lucide-react";
import { useGameMenu, getMainNavbarLinks } from "@/libs/menus";
import { useUserData } from "@/utils/UserContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTrigger } from "@/components/ui/sheet";
import { SiGithub, SiDiscord } from "@icons-pack/react-simple-icons";
import { api } from "@/utils/api";
import { showUserRank } from "@/libs/profile";
import { useAuth } from "@clerk/nextjs";
import { getCurrentSeason } from "@/utils/time";
import {
  IMG_WALLPAPER_WINTER,
  IMG_WALLPAPER_SPRING,
  IMG_WALLPAPER_SUMMER,
  IMG_WALLPAPER_FALL,
  IMG_WALLPAPER_HALLOWEEN,
  IMG_LOGO_FULL,
  IMG_LOGO_SHORT,
  IMG_ICON_DISCORD,
  IMG_ICON_FACEBOOK,
  IMG_ICON_GITHUB,
  IMG_ICON_GOOGLE,
  IMG_LAYOUT_NAVBAR,
  IMG_LAYOUT_NAVBAR_HALLOWEEN,
  IMG_LAYOUT_HANDSIGN,
  IMG_LAYOUT_HANDSIGN_HALLOWEEN,
} from "@/drizzle/constants";
import type { NavBarDropdownLink } from "@/libs/menus";
import type { UserWithRelations } from "@/server/api/routers/profile";

export interface LayoutProps {
  children: React.ReactNode;
}

const LayoutCore4: React.FC<LayoutProps> = (props) => {
  // Get data
  const { data: userData, timeDiff, notifications } = useUserData();
  const { systems, location } = useGameMenu(userData);
  const [leftSideBarOpen, setLeftSideBarOpen] = useState(false);
  const [rightSideBarOpen, setRightSideBarOpen] = useState(false);

  // State
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Derived data for layout
  const navbarMenuItems = getMainNavbarLinks();

  // Split menu into two parts
  const navbarMenuItemsLeft = navbarMenuItems.slice(0, 3);
  const navbarMenuItemsRight = navbarMenuItems.slice(3);

  // Set theme
  useEffect(() => {
    const localTheme = localStorage.getItem("theme");
    if (
      localTheme === "dark" ||
      (!localTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)
    ) {
      document.documentElement.classList.add("dark");
      setTheme("dark");
    } else {
      document.documentElement.classList.remove("dark");
      setTheme("light");
    }
  }, [theme]);

  // Images
  const imageset = getImageSet();

  /**
   * SIDEBAR: Left Side
   */
  const leftSideBar = (
    <div onClick={() => setLeftSideBarOpen(false)}>
      <SignedIn>
        <SideBannerTitle>{userData?.username || "Loading user..."}</SideBannerTitle>
        <MenuBoxProfile />
      </SignedIn>
      <SignedOut>
        <SideBannerTitle>Participate</SideBannerTitle>
        <div className="grid grid-cols-2 md:grid-cols-1 lg:grid-cols-2 pt-4 gap-4">
          <Link
            href="https://github.com/MathiasGruber/TheNinjaRPG/issues"
            className="flex flex-col items-center font-bold hover:opacity-50"
          >
            <SiGithub size={60} className="dark:text-white text-black w-1/2" />
            <p>Contribute</p>
          </Link>
          <Link
            href="https://discord.gg/grPmTr4z9C"
            className="flex flex-col items-center font-bold hover:opacity-50"
          >
            <SiDiscord size={60} className="dark:text-white text-black w-1/2" />
            <p>Community</p>
          </Link>
        </div>
      </SignedOut>
    </div>
  );

  /**
   * SIDEBAR: Right Side
   */
  const rightSideBar = (
    <>
      <SignedIn>
        <RightSideBar
          notifications={notifications}
          systems={systems}
          userData={userData}
          location={location}
          timeDiff={timeDiff}
        />
      </SignedIn>
      <SignedOut>
        <SideBannerTitle>Welcome</SideBannerTitle>
        <p className="hidden md:block text-orange-100 italic px-1">Socials Login</p>
        <p className="block md:hidden text-foreground italic px-1">Socials Login</p>
        <div className="grid grid-cols-4">
          <Image
            className="grayscale my-4 w-full"
            src={IMG_ICON_DISCORD}
            alt="DiscordProvider"
            width={50}
            height={50}
          ></Image>
          <Image
            className="grayscale my-4 w-full"
            src={IMG_ICON_FACEBOOK}
            alt="FacebookProvider"
            width={50}
            height={50}
          ></Image>
          <Image
            className="grayscale my-4 w-full"
            src={IMG_ICON_GOOGLE}
            alt="GoogleProvider"
            width={50}
            height={50}
          ></Image>
          <Image
            className="grayscale my-4 w-full"
            src={IMG_ICON_GITHUB}
            alt="GithubProvider"
            width={50}
            height={50}
          ></Image>
        </div>
        <Link href="/login" className="relative">
          <Button variant="default" size="sm" className="w-full" decoration="gold">
            Sign in
          </Button>
        </Link>
      </SignedOut>
      <div className="pl-2 pt-6 flex align-center justify-center">
        <iframe
          src="https://ghbtns.com/github-btn.html?user=MathiasGruber&repo=TheNinjaRPG&type=star&count=true"
          width="90"
          height="20"
          title="GitHub"
        ></iframe>
      </div>
    </>
  );

  /**
   * Icons shown to logged in users in navbar
   */
  const signedInIcons = (
    <div className="flex flex-row">
      <SignedIn>
        <UserButton />
      </SignedIn>
      <Link href="/event" onClick={() => setLeftSideBarOpen(false)}>
        <Megaphone className="h-7 w-7 hover:text-black hover:bg-blue-300 text-slate-700 bg-blue-100 bg-opacity-80 rounded-full mx-1 ml-2 p-1" />
      </Link>
      <Eclipse
        className={`hover:cursor-pointer h-7 w-7 hover:text-black hover:bg-blue-300 text-slate-700 bg-blue-100 bg-opacity-80 rounded-full mx-1 p-1 ${theme === "light" ? "bg-yellow-100" : "bg-blue-100"}`}
        onClick={() => {
          setLeftSideBarOpen(false);
          const localTheme = localStorage.getItem("theme");
          if (!localTheme || localTheme === "light") {
            localStorage.setItem("theme", "dark");
            setTheme("dark");
          } else {
            localStorage.setItem("theme", "light");
            setTheme("light");
          }
        }}
      />
    </div>
  );

  return (
    <div className="w-full">
      <div className="fixed right-5 bottom-5 z-50 bg-slate-500 rounded-full">
        <SendTicketBtn>
          <MessageCircleWarning className="h-16 w-16 bg-yellow-500 hover:bg-yellow-300 transition-colors text-orange-100 rounded-full p-2 shadow-md shadow-black border-2" />
        </SendTicketBtn>
      </div>
      {/* WALLPAPER BACKGROUND */}
      <Image
        className="absolute left-[50%] translate-x-[-50%] select-none"
        src={imageset.wallpaper}
        width={1600}
        height={800}
        alt="logo"
        priority
        unoptimized
      />
      <div className="max-w-[1280px] ml-auto mr-auto w-auto h-auto">
        {/* LOGO */}
        <Link href="/">
          <Image
            className="hidden md:block z-[2] relative top-3 left-[50%] translate-x-[-50%] select-none"
            src={IMG_LOGO_FULL}
            width={384}
            height={138}
            alt="logo"
            priority
          />
          <Image
            className="block md:hidden absolute top-3 left-[50%] translate-x-[-50%] w-1/2 max-w-250"
            src={IMG_LOGO_SHORT}
            width={250}
            height={122}
            alt="logo"
            priority
          />
        </Link>
        {/* DESKTOP NAVBAR */}
        <div className="hidden md:block z-[1] relative top-[-10px] left-[50%] translate-x-[-50%] text-orange-100 font-bold text-lg lg:text-2xl">
          <Image
            className="select-none"
            src={imageset.navbar}
            width={1280}
            height={133}
            alt="navbar"
            priority
          />
          <div className="absolute top-6 grid grid-cols-3 w-1/2 px-24 lg:px-36">
            {navbarMenuItemsLeft.map((link) => (
              <Link
                key={link.name}
                className="hover:text-orange-500 flex flex-row gap-1 z-10 items-center justify-center hover:cursor-pointer"
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
          </div>
          <div className="absolute top-6 right-0 grid grid-cols-3 w-1/2 px-24 lg:px-36">
            {navbarMenuItemsRight.map((link) => (
              <Link
                key={link.name}
                className="hover:text-orange-500 flex flex-row gap-1 z-10 items-center justify-center"
                href={link.href}
                onClick={async () => {
                  if (link.onClick) await link.onClick();
                }}
                prefetch={false}
              >
                {link.icon}
                {link.name}
              </Link>
            ))}
            {signedInIcons}
          </div>
        </div>
        {/* DESKTOP HANDSIGN */}
        <Image
          className="hidden md:block z-10 relative top-[-120px] left-[50%] translate-x-[-50%] select-none"
          src={imageset.handsign}
          width={127}
          height={112}
          alt="handsign"
          priority
        />
        <div className="relative top-[100px] md:top-[-122px] flex flex-row z-10">
          {/* LEFT SIDEBANNER DESKTOP */}
          <div className="hidden md:block relative w-[200px] lg:w-[250px] shrink-0">
            <div className="relative">
              <Image
                className="left-0 absolute -z-10 select-none"
                src="/layout/sidetopbanner_content.webp"
                width={250}
                height={235}
                style={{ width: "100%", height: "100%" }}
                alt="leftbanner"
                priority
              ></Image>
              <div className="text-white z-10 pl-20 pr-4 pt-4">{leftSideBar}</div>
            </div>
            <Image
              className="left-0 relative select-none"
              src="/layout/sidetopbanner_bottom.webp"
              width={250}
              height={68}
              alt="leftbanner"
              priority
            ></Image>
            <StrongestUsersBanner />
          </div>
          {/* MAIN CONTENT */}
          <div className="w-full flex-1 min-w-0 flex flex-col">
            <div className="w-full flex flex-row">
              <div className="w-12 shrink-0 bg-[url('/layout/sidescroll.webp')] bg-fill bg-repeat-y hidden lg:block"></div>
              <div className="w-full bg-background bg-opacity-50 md:bg-opacity-100 grow flex flex-col overflow-x-scroll min-h-[200px]">
                <div className="p-3">{props.children}</div>
              </div>
              <div className="w-12 shrink-0 bg-[url('/layout/sidescroll.webp')] bg-fill bg-repeat-y hidden lg:block"></div>
            </div>
            <div className="h-20 max-h-28 flex flex-col relative">
              <div className="absolute top-0 left-[-20px] right-0 md:right-[-20px] -z-30">
                <div className="h-5 bg-gradient-to-b from-rose-950 to-rose-800"></div>
                <div className="h-8 bg-rose-800"></div>
                <div className="h-7 bg-gradient-to-b from-rose-800 to-rose-950"></div>
              </div>
              <Image
                className="left-[-120px] top-[-195px] absolute select-none -z-20 hidden md:block"
                src="/layout/scroll_bottom_decor.webp"
                width={143}
                height={272}
                alt="leftbottomdecor"
                priority
              ></Image>
              <Image
                className="right-[-120px] top-[-195px] absolute select-none scale-x-[-1] -z-20 hidden md:block"
                src="/layout/scroll_bottom_decor.webp"
                width={143}
                height={272}
                alt="rightbottomdecor"
                priority
              ></Image>
              <div className="absolute top-4 left-0 right-0">
                <Footer />
              </div>
            </div>
          </div>
          {/* RIGHT SIDEBANNER DESKTOP */}
          <div className="hidden md:block relative w-[200px] lg:w-[250px] shrink-0">
            <div className="relative">
              <Image
                className="right-0 absolute -z-10 scale-x-[-1] select-none"
                src="/layout/sidetopbanner_content.webp"
                width={250}
                height={235}
                style={{ width: "100%", height: "100%" }}
                alt="rightbanner"
                priority
              ></Image>
              <div className="text-white p-2 pl-4 pr-20">{rightSideBar}</div>
            </div>
            <Image
              className="left-0 relative select-none scale-x-[-1]"
              src="/layout/sidetopbanner_bottom.webp"
              width={250}
              height={68}
              alt="leftbanner"
              priority
            ></Image>
          </div>
        </div>
        {/* LEFT SIDEBAR MOBILE */}
        <Sheet open={leftSideBarOpen} onOpenChange={setLeftSideBarOpen}>
          <SheetTrigger className="absolute top-4 left-4">
            <House className="block md:hidden h-16 w-16 bg-yellow-500 hover:bg-yellow-300 transition-colors text-orange-100 rounded-full p-2 shadow-md shadow-black border-2" />
          </SheetTrigger>
          <SheetContent side="left">
            <SheetHeader className="text-left">
              <SideBannerTitle>Main Menu</SideBannerTitle>
              <div className="mt-1 grid gap-3 grid-cols-2">
                {navbarMenuItems.map((system, i) => {
                  return (
                    <Link
                      key={i}
                      href={system.href}
                      onClick={() => setLeftSideBarOpen(false)}
                      className={system.className ? system.className : ""}
                    >
                      <Button
                        decoration="gold"
                        className={`w-full hover:bg-orange-200`}
                      >
                        <div className="grow">{system.name}</div>
                        <div>{system.icon && system.icon}</div>
                      </Button>
                    </Link>
                  );
                })}
                <div className="flex flex-row items-center justify-center">
                  {signedInIcons}
                </div>
              </div>
              <div className="relative pt-4">{leftSideBar}</div>
            </SheetHeader>
          </SheetContent>
        </Sheet>

        {/* RIGHT SIDEBAR MOBILE */}
        <Sheet open={rightSideBarOpen} onOpenChange={setRightSideBarOpen}>
          <SheetTrigger className="absolute top-4 right-4">
            <Earth className="block md:hidden h-16 w-16 bg-yellow-500 hover:bg-yellow-300 transition-colors text-orange-100 rounded-full p-2 shadow-md shadow-black border-2" />
          </SheetTrigger>
          <SheetContent onClick={() => setRightSideBarOpen(false)}>
            <SheetHeader>{rightSideBar}</SheetHeader>
          </SheetContent>
        </Sheet>
        {/* <div className="p-3 pt-24 min-h-[1200px] bg-background bg-opacity-50">
          {props.children}
        </div> */}
      </div>
    </div>
  );
};

export default LayoutCore4;

/**
 * Show strongest users
 */
const StrongestUsersBanner: React.FC = () => {
  // State
  const { isSignedIn } = useAuth();
  const tabNames = ["Online", "Strongest", "Staff"] as const;
  type TabName = (typeof tabNames)[number];
  const [activeTab, setActiveTab] = useState<TabName>("Online");
  // Query
  const { data: userData, isPending } = api.profile.getPublicUsers.useQuery(
    {
      limit: 10,
      orderBy: activeTab,
      isAi: false,
    },
    { enabled: isSignedIn === false, staleTime: 1000 * 60 * 5 },
  );
  const users = userData?.data;

  return (
    <SignedOut>
      <div className="relative top-[-30px]">
        <Image
          className="left-0 relative -z-10 select-none w-[200px] lg:w-[260px] max-w-[200px] lg:max-w-[260px]"
          src="/layout/usersbanner_top.webp"
          width={260}
          height={138}
          alt="usersbanner_top"
          priority
        ></Image>
        <div className="text-orange-100 relative left-0 w-[200px] lg:w-[260px] max-w-[200px] lg:max-w-[260px] bg-[url('/layout/usersbanner_middle.webp')] bg-contain bg-repeat-y">
          <div className="relative top-[-40px]">
            <NavTabs
              current={activeTab}
              options={tabNames}
              setValue={setActiveTab}
              fontSize="text-xs"
              className="text-orange-100 hover:text-orange-300"
            />
            {users?.map((user, i) => (
              <div
                key={i}
                className={`py-1 grid grid-cols-12 items-center justify-center relative top-2 left-8 lg:left-10 w-[154px] max-w-[154px] lg:w-[200px] lg:max-w-[200px] ${
                  i % 2 == 0 ? "bg-pink-900" : ""
                } bg-opacity-50 text-xs lg:text-base`}
              >
                <p className="pl-2">{i + 1}</p>
                <div className="col-span-2">
                  <AvatarImage
                    href={user.avatar}
                    userId={user.userId}
                    alt={user.username}
                    size={100}
                    priority
                  />
                </div>
                <p className="col-span-5">{user.username}</p>
                <p className="col-span-4">{showUserRank(user)}</p>
              </div>
            ))}
            {isPending && <Loader explanation="Loading top players" />}
          </div>
        </div>
        <Image
          className="left-0 top-[-10px] relative -z-10 select-none w-[200px] lg:w-[260px] max-w-[200px] lg:max-w-[260px]"
          src="/layout/usersbanner_bottom.webp"
          width={260}
          height={138}
          alt="usersbanner_bottom"
          priority
        ></Image>
      </div>
    </SignedOut>
  );
};

/**
 * Renders a side banner title component.
 *
 * @param children - The content to be displayed as the title.
 * @returns The rendered side banner title component.
 */
export const SideBannerTitle: React.FC<{
  children: React.ReactNode;
  break?: boolean;
}> = (props) => {
  return (
    <>
      {props.break && <br />}
      <p className="hidden md:block text-xl font-bold text-orange-100 px-1 pt-2 leading-0">
        {props.children}
      </p>
      <p className="block md:hidden text-xl font-bold text-foreground px-1 pt-2 leading-0">
        {props.children}
      </p>
    </>
  );
};

/**
 * Renders the right sidebar component.
 *
 * @param props - The component props.
 * @param props.systems - An array of NavBarDropdownLink objects representing the systems.
 * @param props.userData - The user data.
 * @param props.notifications - An optional array of NavBarDropdownLink objects representing the notifications.
 * @param props.location - An optional NavBarDropdownLink object representing the location.
 * @returns The rendered right sidebar component.
 */
const RightSideBar: React.FC<{
  systems: NavBarDropdownLink[];
  userData: UserWithRelations;
  timeDiff: number;
  notifications?: NavBarDropdownLink[];
  location?: NavBarDropdownLink;
}> = (props) => {
  // Destructure props
  const { notifications, systems, userData, location } = props;

  // Derived data
  const inBattle = userData?.status === "BATTLE";

  // Shown notifications
  const shownNotifications = notifications?.filter((n) => n.color !== "toast");

  // Render
  return (
    <>
      {/* COMBAT */}
      <MenuBoxCombat />
      {/* NOTIFICATIONS */}
      {userData && shownNotifications && shownNotifications.length > 0 && (
        <>
          <SideBannerTitle>Notifications</SideBannerTitle>
          <ul className="grid grid-cols-1 gap-[1px]">
            {shownNotifications.map((notification, i) => (
              <Link key={i} href={notification.href}>
                <div
                  className={`flex flex-row text-xs lg:text-base items-center rounded-lg border-2 border-slate-800 py-[1px] pl-3 hover:opacity-70 ${
                    notification.color ? `bg-${notification.color}-600` : "bg-slate-500"
                  }`}
                >
                  {notification.color === "red" && (
                    <ShieldAlert className="mr-1 h-5 w-5" />
                  )}
                  {notification.color === "blue" && <Info className="mr-1 h-5 w-5" />}
                  {notification.color === "green" && (
                    <ShieldCheck className="mr-1 h-5 w-5" />
                  )}
                  {notification.name}
                </div>
              </Link>
            ))}
          </ul>
        </>
      )}
      <SideBannerTitle break={userData && notifications && notifications.length > 0}>
        Main Menu
      </SideBannerTitle>
      <div className="mt-1 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {systems.map((system, i) => {
          const disabled = system.requireAwake && userData?.status !== "AWAKE";
          return (
            <Link
              key={i}
              href={system.href}
              className={system.className ? system.className : ""}
            >
              <Button
                decoration="gold"
                className={`w-full ${system.className || ""} ${disabled ? "opacity-30" : "hover:bg-orange-200"}`}
              >
                <div className="grow">{system.name}</div>
                <div>{system.icon && system.icon}</div>
              </Button>
            </Link>
          );
        })}
      </div>
      {location && (
        <>
          <SideBannerTitle break>Location Menu</SideBannerTitle>
          <div className={inBattle && location.requireAwake ? "opacity-30" : ""}>
            <Link
              href={inBattle && location.requireAwake ? "/combat" : "/village"}
              className="text-center flex flex-row justify-center"
            >
              {location.icon}
            </Link>
          </div>
        </>
      )}
    </>
  );
};

// Get wallpaper based on the season
const getImageSet = () => {
  const base = {
    navbar: IMG_LAYOUT_NAVBAR,
    handsign: IMG_LAYOUT_HANDSIGN,
    wallpaper: IMG_WALLPAPER_SUMMER,
  };
  switch (getCurrentSeason()) {
    case "winter":
      base.wallpaper = IMG_WALLPAPER_WINTER;
    case "spring":
      base.wallpaper = IMG_WALLPAPER_SPRING;
    case "summer":
      base.wallpaper = IMG_WALLPAPER_SUMMER;
    case "fall":
      base.wallpaper = IMG_WALLPAPER_FALL;
    case "halloween":
      base.wallpaper = IMG_WALLPAPER_HALLOWEEN;
      base.navbar = IMG_LAYOUT_NAVBAR_HALLOWEEN;
      base.handsign = IMG_LAYOUT_HANDSIGN_HALLOWEEN;
  }
  return base;
};
