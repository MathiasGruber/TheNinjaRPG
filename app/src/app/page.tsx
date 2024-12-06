"use client";

import React, { useEffect } from "react";
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
import { IMG_LAYOUT_WELCOME_IMG } from "@/drizzle/constants";
import { IMG_FRONTPAGE_SCREENSHOT_COMBAT } from "@/drizzle/constants";
import { IMG_FRONTPAGE_SCREENSHOT_JUTSUS } from "@/drizzle/constants";
import { IMG_FRONTPAGE_SCREENSHOT_GLOBAL } from "@/drizzle/constants";
import { IMG_FRONTPAGE_SCREENSHOT_SECTOR } from "@/drizzle/constants";
import { IMG_FRONTPAGE_SCREENSHOT_VILLAGE } from "@/drizzle/constants";

export default function Index() {
  // Fetch data
  const { isSignedIn } = useUser();
  const { data: userData, status: userStatus, userId } = useUserData();

  // Navigation
  const router = useRouter();
  const searchParams = useSearchParams();

  // Save referrer in local storage if present
  useEffect(() => {
    const ref = searchParams?.get("ref");
    if (ref) localStorage.setItem("ref", ref);
  }, [searchParams]);

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
  return (
    <>
      <div className="flex flex-col items-center">
        <h1 className="text-center text-4xl font-bold">Welcome to TNR</h1>
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
          At the Path of the Shinobi lies many routes. What route will you take? Learn
          the way of the Shinobi as you start as an aspiring Academy Student. Fight your
          way to the top to become the Kage: the single shadow that protects your
          village from any danger, or become your village&rsquo;s worst nightmare as a
          wandering Outlaw of pure darkness.
        </p>
        <p className="p-2">
          <span className="font-bold">What?</span> This is a modernized version of an
          long-running online browser-based game based on a new technology stack and
          sprinkled with a bit of AI technology.
        </p>
        <div className="w-full flex justify-center items-center py-6 gap-8">
          <Link href="/signup">
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
          <Link href="/login">
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
              <strong>Master Your Jutsu</strong>
              <br /> Train and customize your ninja with unique abilities and signature
              moves.
            </li>
            <li>
              <strong>Immersive Villages</strong>
              <br /> Choose your village allegiance and build your reputation in the
              ninja world.
            </li>{" "}
            <li>
              <strong>Engage in Strategic Battles</strong>
              <br /> Challenge opponents in thrilling PvP and team-based combat on a
              hex-based 2D grid.
            </li>{" "}
            <li>
              <strong>Evolving Storylines</strong>
              <br /> Complete missions, defeat rogue ninjas, and uncover the secrets of
              the shinobi world.
            </li>{" "}
            <li>
              <strong>Community Driven</strong>
              <br /> Join clans, form alliances, and participate in player-led events.
            </li>
          </ul>
          <div className="w-full p-3">
            <Carousel
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
                        <Image
                          src={IMG_FRONTPAGE_SCREENSHOT_COMBAT}
                          width={1024}
                          height={702}
                          className="w-full"
                          alt="Screenshot from Jutsus"
                        />
                        <p>
                          Experience the thrill of ninja combat in dynamic, round-based
                          2D strategic battle system. Every encounter is a test of wit
                          and skill, requiring players to carefully plan their moves,
                          manage resources, and outthink their opponents.
                        </p>
                        <p>
                          Choose from a wide arsenal of techniques, including powerful
                          jutsu, precise attacks, and defensive maneuvers, to adapt to
                          any situation. Each round challenges you to anticipate your
                          opponent's strategy while leveraging your unique abilities and
                          character build. Timing, positioning, and strategy are key as
                          you engage in battles that demand both tactical
                          decision-making and foresight.
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </CarouselItem>
                <CarouselItem className="basis-full">
                  <div className="p-1">
                    <Card>
                      <CardContent className="flex flex-col gap-4 items-center justify-center p-6">
                        <Image
                          src={IMG_FRONTPAGE_SCREENSHOT_JUTSUS}
                          width={1024}
                          height={702}
                          className="w-full"
                          alt="Screenshot from Jutsus"
                        />
                        <p>
                          Jutsu are the cornerstone of strategic combat, blending skill,
                          creativity, and tactical planning to overcome your opponents.
                          Players can harness the power of chakra to unleash a variety
                          of techniques, including Ninjutsu, Genjutsu, and Taijutsu,
                          each offering unique combat advantages.
                        </p>
                        <p>
                          By mastering intricate hand seals and managing your chakra
                          reserves, you can develop devastating combos, counter enemy
                          moves, and dominate the battlefield. Explore thousands of
                          potential jutsu combinations and refine your strategy to suit
                          your playstyle—whether you prefer brute strength, deception,
                          or finesse.
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </CarouselItem>
                <CarouselItem className="basis-full">
                  <div className="p-1">
                    <Card>
                      <CardContent className="flex flex-col gap-4 items-center justify-center p-6">
                        <Image
                          src={IMG_FRONTPAGE_SCREENSHOT_VILLAGE}
                          width={1024}
                          height={702}
                          className="w-full"
                          alt="Screenshot from Jutsus"
                        />
                        <p>
                          The ninja village is your home, your sanctuary, and the center
                          of your growth as a shinobi. This bustling hub is where
                          strategy meets daily life, offering countless opportunities to
                          sharpen your skills, manage your resources, and engage with
                          fellow ninjas.
                        </p>
                        <p>
                          From training grounds that push your abilities to the limit,
                          to the ramen shop where you replenish your stamina, every
                          corner of the village plays a vital role in your journey. The
                          village bank ensures your hard-earned wealth is protected,
                          while the item shop equips you with tools and scrolls to gain
                          an edge in combat. In the clan hall, you&apos;ll collaborate
                          with allies to build your reputation and influence, while the
                          town hall connects you to vital missions and village-wide
                          initiatives. Even your home offers a place of rest and
                          recovery, preparing you for the challenges ahead.
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </CarouselItem>

                <CarouselItem className="basis-full">
                  <div className="p-1">
                    <Card>
                      <CardContent className="flex flex-col gap-4 items-center justify-center p-6 w-full">
                        <div>
                          <Image
                            src={IMG_FRONTPAGE_SCREENSHOT_SECTOR}
                            width={1024}
                            height={702}
                            className="w-full"
                            alt="Screenshot from Sector"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </CarouselItem>
                <CarouselItem className="basis-full">
                  <div className="p-1">
                    <Card>
                      <CardContent className="flex flex-col gap-4 items-center justify-center p-6">
                        <Image
                          src={IMG_FRONTPAGE_SCREENSHOT_GLOBAL}
                          width={1024}
                          height={702}
                          className="w-full"
                          alt="Screenshot from Jutsus"
                        />
                      </CardContent>
                    </Card>
                  </div>
                </CarouselItem>
              </CarouselContent>
              <CarouselPrevious className="top-1/2  translate-y-[-50%]" />
              <CarouselNext className="top-1/2  translate-y-[-50%]" />
            </Carousel>
          </div>
        </div>
      </div>
    </>
  );
};
