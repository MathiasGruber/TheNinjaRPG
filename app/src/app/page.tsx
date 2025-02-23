"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { UserPlus, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@clerk/nextjs";
import { useUserData } from "@/utils/UserContext";
import { useRouter, useSearchParams } from "next/navigation";
import Loader from "@/layout/Loader";
import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { IMG_LAYOUT_WELCOME_IMG } from "@/drizzle/constants";
import { IMG_FRONTPAGE_SCREENSHOT_COMBAT } from "@/drizzle/constants";
import { IMG_FRONTPAGE_SCREENSHOT_JUTSUS } from "@/drizzle/constants";
import { IMG_FRONTPAGE_SCREENSHOT_GLOBAL } from "@/drizzle/constants";
import { IMG_FRONTPAGE_SCREENSHOT_SECTOR } from "@/drizzle/constants";
import { IMG_FRONTPAGE_SCREENSHOT_VILLAGE } from "@/drizzle/constants";
import type { CarouselApi } from "@/components/ui/carousel";

export default function Index() {
  // Fetch data
  const { isSignedIn } = useUser();
  const { data: userData, status: userStatus, userId } = useUserData();

  // Navigation
  const router = useRouter();

  // Redirect based on user status
  useEffect(() => {
    if (userStatus !== "pending" && !userData) {
      if (userStatus === "error") {
        void router.push("/500");
      } else {
        void router.push("/register");
      }
    }
    if (userData && userId) {
      void router.push("/profile");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData, userId, userStatus]);

  // Guard
  if (!isSignedIn && !userData) {
    return <Welcome />;
  } else {
    return <Loader explanation="Forwarding to profile" />;
  }
}

const Welcome: React.FC = () => {
  // Carousel state
  const [cApi, setCApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  // Carousel control
  useEffect(() => {
    if (!cApi) return;
    setCurrent(cApi.selectedScrollSnap() + 1);
    cApi.on("select", () => {
      setCurrent(cApi.selectedScrollSnap() + 1);
    });
  }, [cApi]);

  // Render
  return (
    <>
      <div className="flex flex-col items-center">
        <h1 className="text-center text-4xl font-bold">
          The Ninja RPG - A Free Online Browser Game
        </h1>
        <div className="pt-2 w-full px-3">
          <hr className="h-px border-primary border-2" />
        </div>
        <Image
          className=""
          src={IMG_LAYOUT_WELCOME_IMG}
          alt="TNR Logo"
          width={1000}
          height={181}
          priority
        />
        <p className="p-2">
          TheNinja-RPG is a browser-based online RPG set in the world of Seichi. Embark
          on an epic journey in this free ninja game where your path as a shinobi is
          yours to choose. Start as an Academy Student mastering powerful jutsu, and
          rise through the ranks in an immersive ninja game experience. Customize your
          character with more than 800+ jutsus and 50+ bloodlines. Will you become a
          legendary Kage, protecting your village with ultimate ninja abilities, or
          choose the path of an Outlaw, mastering forbidden jutsu and dark arts? Your
          ninja adventure begins here in this unique multiplayer RPG world.
        </p>
        <p className="p-2">
          <span className="font-bold">What is TNR?</span> TNR is a free online ninja RPG
          game that brings the world of jutsu and ninja combat to your browser. This
          multiplayer ninja game offers an authentic shinobi experience where you can
          master powerful jutsu, engage in strategic battles, and become a legendary
          ninja warrior - all completely free to play.
        </p>
        <div className="w-full flex justify-center items-center py-6 gap-8">
          <Link href="/signup" aria-label="Signup">
            <Button
              id="signup_btn"
              decoration="gold"
              className="font-bold w-full text-xl"
              size="lg"
            >
              <UserPlus className="h-6 w-6 mr-2" />
              Register
            </Button>
          </Link>
          <p className="text-3xl font-bold italic">OR</p>
          <Link href="/login" aria-label="Login">
            <Button
              id="signin_btn"
              decoration="gold"
              className="font-bold w-full text-xl"
              size="lg"
            >
              <LogIn className="h-6 w-6 mr-2" />
              Log In
            </Button>
          </Link>
        </div>
        <div className="pl-2">
          <h2 className="text-2xl font-bold pt-4">Key Features</h2>
          <p className="pb-4">
            The game features a variety of features that make it unique and engaging:
          </p>
          <ul className="list-disc list-outside pl-6 flex flex-col gap-3">
            <li>
              <h3 className="font-bold">Master Your Jutsu</h3>
              Unlock powerful jutsu, train your ninja, and create signature moves that
              set you apart in the ninja world.
            </li>
            <li>
              <h3 className="font-bold">Explore Immersive Villages</h3>
              Align with a village, enhance your reputation, and immerse yourself in a
              vibrant ninja community.
            </li>
            <li>
              <h3 className="font-bold">Engage in Strategic Ninja Battles</h3>
              Compete in intense PvP and team-based combat on a dynamic 2D hex-based
              battlefield.
            </li>
            <li>
              <h3 className="font-bold">Uncover Evolving Storylines</h3>
              Take on challenging missions, defeat rogue ninjas, and discover the hidden
              truths of the shinobi universe.
            </li>
            <li>
              <h3 className="font-bold">Join a Thriving Ninja Community</h3>
              Create clans, forge alliances, and participate in epic player-driven
              events that shape the game.
            </li>
          </ul>
          <div className="w-full p-3">
            <Carousel
              setApi={setCApi}
              className="max-w-full"
              opts={{
                align: "start",
                loop: true,
              }}
              plugins={[Autoplay({ delay: 4000, stopOnMouseEnter: true })]}
            >
              <CarouselContent>
                <CarouselItem className="basis-full">
                  <div className="p-1">
                    <Card>
                      <CardContent className="flex flex-col gap-4 items-center justify-center p-6">
                        <Suspense
                          fallback={<Skeleton className="w-full aspect-[1024/716]" />}
                        >
                          <Image
                            src={IMG_FRONTPAGE_SCREENSHOT_JUTSUS}
                            width={1024}
                            height={716}
                            className="w-full"
                            alt="Screenshot from Jutsus"
                          />
                        </Suspense>
                      </CardContent>
                    </Card>
                  </div>
                </CarouselItem>
                <CarouselItem className="basis-full">
                  <div className="p-1">
                    <Card>
                      <CardContent className="flex flex-col gap-4 items-center justify-center p-6">
                        <Suspense
                          fallback={<Skeleton className="w-full aspect-[1024/702]" />}
                        >
                          <Image
                            src={IMG_FRONTPAGE_SCREENSHOT_COMBAT}
                            width={1024}
                            height={702}
                            className="w-full"
                            alt="Screenshot from Combat"
                          />
                        </Suspense>
                      </CardContent>
                    </Card>
                  </div>
                </CarouselItem>

                <CarouselItem className="basis-full">
                  <div className="p-1">
                    <Card>
                      <CardContent className="flex flex-col gap-4 items-center justify-center p-6">
                        <Suspense
                          fallback={<Skeleton className="w-full aspect-[1024/679]" />}
                        >
                          <Image
                            src={IMG_FRONTPAGE_SCREENSHOT_VILLAGE}
                            width={1024}
                            height={679}
                            className="w-full"
                            alt="Screenshot from Village"
                          />
                        </Suspense>
                      </CardContent>
                    </Card>
                  </div>
                </CarouselItem>
                <CarouselItem className="basis-full">
                  <div className="p-1">
                    <Card>
                      <CardContent className="flex flex-col gap-4 items-center justify-center p-6 w-full">
                        <Suspense
                          fallback={<Skeleton className="w-full aspect-[1024/732]" />}
                        >
                          <Image
                            src={IMG_FRONTPAGE_SCREENSHOT_SECTOR}
                            width={1024}
                            height={732}
                            className="w-full"
                            alt="Screenshot from Sector"
                          />
                        </Suspense>
                      </CardContent>
                    </Card>
                  </div>
                </CarouselItem>
                <CarouselItem className="basis-full">
                  <div className="p-1">
                    <Card>
                      <CardContent className="flex flex-col gap-4 items-center justify-center p-6">
                        <Suspense
                          fallback={<Skeleton className="w-full aspect-[1024/743]" />}
                        >
                          <Image
                            src={IMG_FRONTPAGE_SCREENSHOT_GLOBAL}
                            width={1024}
                            height={743}
                            className="w-full"
                            alt="Screenshot from Jutsus"
                          />
                        </Suspense>
                      </CardContent>
                    </Card>
                  </div>
                </CarouselItem>
              </CarouselContent>
              <CarouselPrevious className="top-1/2  translate-y-[-50%]" />
              <CarouselNext className="top-1/2  translate-y-[-50%]" />
            </Carousel>
            <div className="flex flex-col gap-2">
              {current === 1 && (
                <>
                  <h2 className="text-2xl font-bold pt-4">Jutsus</h2>
                  <p>
                    Jutsu are the cornerstone of strategic combat, blending skill,
                    creativity, and tactical planning to overcome your opponents.
                    Players can harness the power of chakra to unleash a variety of
                    techniques, including Ninjutsu, Genjutsu, and Taijutsu, each
                    offering unique combat advantages.
                  </p>
                  <p>
                    By mastering intricate hand seals and managing your chakra reserves,
                    you can develop devastating combos, counter enemy moves, and
                    dominate the battlefield. Explore thousands of potential jutsu
                    combinations and refine your strategy to suit your playstyle—whether
                    you prefer brute strength, deception, or finesse.
                  </p>
                </>
              )}
              {current === 2 && (
                <>
                  <h2 className="text-2xl font-bold pt-4">Combat</h2>
                  <p>
                    Experience the thrill of ninja combat in dynamic, round-based 2D
                    strategic battle system. Every encounter is a test of wit and skill,
                    requiring players to carefully plan their moves, manage resources,
                    and outthink their opponents.
                  </p>
                  <p>
                    Choose from a wide arsenal of techniques, including powerful jutsu,
                    precise attacks, and defensive maneuvers, to adapt to any situation.
                    Each round challenges you to anticipate your opponent&apos;s
                    strategy while leveraging your unique abilities and character build.
                    Timing, positioning, and strategy are key as you engage in battles
                    that demand both tactical decision-making and foresight.
                  </p>
                </>
              )}
              {current === 3 && (
                <>
                  <h2 className="text-2xl font-bold pt-4">Village</h2>
                  <p>
                    The ninja village is your home, your sanctuary, and the center of
                    your growth as a shinobi. This bustling hub is where strategy meets
                    daily life, offering countless opportunities to sharpen your skills,
                    manage your resources, and engage with fellow ninjas.
                  </p>
                  <p>
                    From training grounds that push your abilities to the limit, to the
                    ramen shop where you replenish your stamina, every corner of the
                    village plays a vital role in your journey. The village bank ensures
                    your hard-earned wealth is protected, while the item shop equips you
                    with tools and scrolls to gain an edge in combat. In the clan hall,
                    you&apos;ll collaborate with allies to build your reputation and
                    influence, while the town hall connects you to vital missions and
                    village-wide initiatives. Even your home offers a place of rest and
                    recovery, preparing you for the challenges ahead.
                  </p>
                </>
              )}
              {current === 4 && (
                <>
                  <h2 className="text-2xl font-bold pt-4">Sectors</h2>
                  <p>
                    The 2D travel system brings the ninja world to life, allowing you to
                    explore local sectors, navigate terrain, and engage with players and
                    enemies in real-time. Every move you make across the map opens new
                    opportunities for discovery, combat, and strategy.
                  </p>
                  <p>
                    Travel isn&apos;t just about getting from one place to
                    another—it&apos;s a core part of the game&apos;s experience. Whether
                    you&apos;re scouting enemy territories, setting up ambushes, or
                    evading rival ninjas, the 2D system gives you the freedom to plan
                    your movements and adapt on the fly. Players can launch surprise
                    attacks, defend key locations, or simply traverse the map to reach
                    mission objectives and hidden rewards.
                  </p>
                </>
              )}
              {current === 5 && (
                <>
                  <h2 className="text-2xl font-bold pt-4">Travel</h2>
                  <p>
                    The 3D global travel system expands your journey beyond your
                    village, opening the gates to a vast world filled with diverse
                    regions and hidden secrets. Travel between villages, explore distant
                    lands, and immerse yourself in the rich lore of the ninja universe.
                  </p>
                  <p>
                    Global travel isn&apos;t just about exploration—it&apos;s an
                    opportunity to engage with new challenges and alliances. Visit other
                    villages to trade, forge alliances, or test your strength against
                    foreign rivals. Each region offers unique environments, from dense
                    forests and sprawling deserts to snow-capped mountains, each
                    presenting its own set of opportunities and dangers.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <Suspense>
        <SetReferal />
      </Suspense>
    </>
  );
};

function SetReferal() {
  const searchParams = useSearchParams();
  useEffect(() => {
    const ref = searchParams?.get("ref");
    if (ref) localStorage.setItem("ref", ref);
  }, [searchParams]);
  return null;
}
