import React, { useState, useEffect } from "react";
import { H } from "highlight.run";
import Pusher from "pusher-js";
// import * as PusherPushNotifications from "@pusher/push-notifications-web";
import ReactHtmlParser from "react-html-parser";

import Image from "next/image";
import Link from "next/link";
import MenuBoxProfile from "./MenuBoxProfile";
import MenuBoxGame from "./MenuBoxGame";
import NavBar from "./NavBar";
import Footer from "./Footer";
import { ToastAction } from "@/components/ui/toast";
import { UserContext } from "@/utils/UserContext";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/utils/api";
import { secondsFromDate } from "@/utils/time";
import { showMutationToast } from "@/libs/toast";
import type { UserEvent } from "@/utils/UserContext";
import type { ReturnedBattle } from "@/libs/combat/types";

const Layout: React.FC<{ children: React.ReactNode }> = (props) => {
  // tRPC utility
  const utils = api.useUtils();
  // Clerk token
  const [token, setToken] = useState<string | null>(null);
  // Pusher connection
  const [pusher, setPusher] = useState<Pusher | undefined>(undefined);
  // Current user battle
  const [battle, setBattle] = useState<undefined | ReturnedBattle>(undefined);
  // Difference between client time and server time
  const [timeDiff, setTimeDiff] = useState<number>(0);
  // Get logged in user
  const { userId, sessionId, isSignedIn, isLoaded, getToken } = useAuth();
  // Set the token from clerk
  useEffect(() => {
    if (isSignedIn && isLoaded) {
      const fetch = async () => {
        setToken(await getToken());
      };
      fetch().catch(console.error);
    }
  }, [sessionId, isSignedIn, isLoaded, getToken]);
  //const token = getToken();
  // Get user data
  const {
    data: data,
    status: userStatus,
    refetch: refetchUser,
  } = api.profile.getUser.useQuery(
    { token: token },
    {
      enabled: !!userId && isSignedIn && isLoaded && !!token,
      staleTime: Infinity,
      retry: false,
      refetchInterval: 300000,
    },
  );
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
    if (data?.serverTime) {
      const discrepancy = Date.now() - data.serverTime;
      if (data.userData) {
        // Adjust updatedAt to client-time, effectively making client-time
        // seem the same as server-time, although server-time is still used
        // for all calculations
        data.userData.updatedAt = secondsFromDate(
          -discrepancy / 1000,
          data.userData.updatedAt,
        );
      }
      // Save the time-discrepancy between client and server for reference
      // e.g. in the battle system
      setTimeDiff(discrepancy);
    }
  }, [data?.userData, data?.serverTime]);

  // Listen on user channel for live updates on things
  useEffect(() => {
    if (userId) {
      // Pusher beam for push notifications
      // if (process.env.NEXT_PUBLIC_PUSHER_BEAM_ID) {
      //   const beamsClient = new PusherPushNotifications.Client({
      //     instanceId: process.env.NEXT_PUBLIC_PUSHER_BEAM_ID,
      //   });
      //   beamsClient
      //     .start()
      //     .then(() => beamsClient.addDeviceInterest("debug-global"))
      //     .then(() => beamsClient.getDeviceInterests())
      //     .then((interests) => console.log("Current interests:", interests))
      //     .then(() => console.log("Successfully registered and subscribed!"))
      //     .catch(console.log);
      // }
      // Pusher Channel
      const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_APP_KEY, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_APP_CLUSTER,
      });
      setPusher(pusher);
      const channel = pusher.subscribe(userId);
      channel.bind("event", async (data: UserEvent) => {
        if (data.type === "battle") {
          console.log("Received battle event");
        } else if (data.type === "newInbox") {
          console.log("Received inbox");
        } else if (data.type === "userMessage") {
          showMutationToast({
            success: true,
            message: data.message ?? "You have a new message",
            title: "Notification!",
            action: (
              <ToastAction altText="To Arena">
                <Link href={data.route ?? "/battlearena"}>
                  {data.routeText ?? "To Profile"}
                </Link>
              </ToastAction>
            ),
          });
        }
        await utils.invalidate();
      });
      return () => {
        pusher.unsubscribe(userId);
        pusher.disconnect();
      };
    }
  }, [userId, utils, refetchUser]);

  // Show user notifications in toast
  useEffect(() => {
    data?.notifications
      .filter((n) => n.color === "toast")
      .map((n) => {
        showMutationToast({
          success: true,
          message: <div>{ReactHtmlParser(n.name)}</div>,
          title: "Notification!",
        });
      });
  }, [data?.notifications]);

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
