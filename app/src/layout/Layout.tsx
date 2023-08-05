import React, { useState, useEffect } from "react";
import { H } from "highlight.run";
import Pusher from "pusher-js";

import Image from "next/image";
import Link from "next/link";
import MenuBoxProfile from "./MenuBoxProfile";
import MenuBoxGame from "./MenuBoxGame";
import NavBar from "./NavBar";
import Footer from "./Footer";

import { UserContext } from "../utils/UserContext";
import { useAuth } from "@clerk/nextjs";
import { api } from "../utils/api";
import { secondsFromDate } from "../utils/time";
import type { UserEvent } from "../utils/UserContext";
import type { ReturnedBattle } from "../libs/combat/types";

const Layout: React.FC<{ children: React.ReactNode }> = (props) => {
  // Pusher connection
  const [pusher, setPusher] = useState<Pusher | undefined>(undefined);
  // Current user battle
  const [battle, setBattle] = useState<undefined | ReturnedBattle>(undefined);
  // Difference between client time and server time
  const [timeDiff, setTimeDiff] = useState<number>(0);
  // Get logged in user
  const { userId, isSignedIn } = useAuth();
  // Get user data
  const {
    data: data,
    status: userStatus,
    refetch: refetchUser,
  } = api.profile.getUser.useQuery(undefined, {
    enabled: !!userId,
    staleTime: Infinity,
    refetchInterval: 300000,
    onSuccess: (data) => {
      // This is used to translate time on client to server side,
      // i.e. synced_client = client_time - timeDiff
      if (data?.serverTime) {
        const discrepancy = Date.now() - data.serverTime;
        if (data.userData) {
          // Adjust updatedAt to client-time, effectively making client-time
          // seem the same as server-time, although server-time is still used
          // for all calculations
          data.userData.updatedAt = secondsFromDate(
            -discrepancy / 1000,
            data.userData.updatedAt
          );
        }
        // Save the time-discrepancy between client and server for reference
        // e.g. in the battle system
        setTimeDiff(discrepancy);
      }
    },
  });
  // if (timeDiff > 0) {
  //   console.log("Client - Server time diff [ms]: ", timeDiff);
  // }

  useEffect(() => {
    if (data?.userData) {
      H.identify(data.userData.username, {
        id: data.userData.userId,
        username: data.userData.username,
        avatar: data.userData.avatar ?? false,
      });
    }
  }, [data?.userData]);

  // Listen on user channel for live updates on things
  useEffect(() => {
    if (userId) {
      const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_APP_KEY, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_APP_CLUSTER,
      });
      setPusher(pusher);
      const channel = pusher.subscribe(userId);
      channel.bind("event", async (data: UserEvent) => {
        if (data.type === "battle") {
          await refetchUser();
        } else if (data.type === "newInbox") {
          await refetchUser();
        }
      });
      return () => {
        pusher.unsubscribe(userId);
        pusher.disconnect();
      };
    }
  }, [userId, refetchUser]);

  return (
    <UserContext.Provider
      value={{
        data: data?.userData,
        battle: battle,
        pusher: pusher,
        status: userStatus,
        timeDiff: timeDiff,
        setBattle: setBattle,
        refetch: refetchUser,
      }}
    >
      <div className="my-1 hidden md:block">
        <Link href="/">
          <Image
            className="ml-auto mr-auto w-auto h-auto"
            src="/logo.webp"
            width={341}
            height={122}
            alt="logo"
            priority
          />
        </Link>
      </div>
      <div className="container max-w-7xl">
        <div className="grid grid-cols-3 md:grid-cols-5">
          <div className="col-span-1 hidden md:block">
            {data?.userData && isSignedIn && <MenuBoxProfile />}
          </div>
          <div className="col-span-3">
            <NavBar notifications={data?.notifications} />
            <div className="mx-1 mt-2 rounded-md bg-orange-100 p-1 md:mx-0">
              <div className="rounded-md bg-yellow-50 p-5">{props.children}</div>
            </div>
          </div>
          <div className="col-span-1 hidden md:block">
            {data?.userData && isSignedIn && (
              <MenuBoxGame notifications={data?.notifications} />
            )}
          </div>
          <Footer />
        </div>
      </div>
    </UserContext.Provider>
  );
};

export default Layout;
