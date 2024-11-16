"use client";

import React, { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { UserPlus, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@clerk/nextjs";
import { useUserData } from "@/utils/UserContext";
import { useRouter, useSearchParams } from "next/navigation";
import FancyForumThreads from "@/layout/FancyForumThreads";
import Loader from "@/layout/Loader";
import { IMG_LAYOUT_WELCOME_IMG } from "@/drizzle/constants";
import type { InfiniteThreads } from "@/routers/forum";

export default function IndexPage({
  initialNews,
}: {
  initialNews: Awaited<InfiniteThreads>;
}) {
  // Fetch data
  const { isLoaded, isSignedIn } = useUser();
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
  if (isLoaded && !isSignedIn)
    return (
      <>
        <Welcome />
        <FancyForumThreads board_name="News" initialData={initialNews} />
      </>
    );

  // If we're here, we're still fetching user data
  return <Loader explanation="Fetching user data..." />;
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
          At the Path of the Shinobi lies many routes.What route will you take? Learn
          the way of the Shinobi as you start as an aspiring Academy Student. Fight your
          way to the top to become the Kage: the single shadow that protects your
          village from any danger, or become your village&rsquo;s worst nightmare as a
          wandering Outlaw of pure darkness.
        </p>
        <p className="p-2">
          <span className="font-bold">What?</span> This is a modernized version of an
          long-running online text-based game based on a new technology stack and
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
      </div>
    </>
  );
};
