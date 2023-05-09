import React, { useState, useEffect } from "react";
import Pusher from "pusher-js";

import Header from "./Header";
import Link from "next/link";
import MenuBoxProfile from "./MenuBoxProfile";
import MenuBoxGame from "./MenuBoxGame";
import NavBar from "./NavBar";
import Footer from "./Footer";

import { ToastContainer } from "react-toastify";
import { UserContext } from "../utils/UserContext";
import type { UserBattle, UserEvent } from "../utils/UserContext";
import { useAuth } from "@clerk/nextjs";
import { api } from "../utils/api";

const Layout: React.FC<{ children: React.ReactNode }> = (props) => {
  // Current user battle
  const [battle, setBattle] = useState<undefined | UserBattle>(undefined);
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
  });

  // Listen on user channel for live updates on things
  useEffect(() => {
    if (userId) {
      const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_APP_KEY, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_APP_CLUSTER,
      });
      const channel = pusher.subscribe(userId);
      channel.bind("event", async (data: UserEvent) => {
        if (data.type === "battle") {
          await refetchUser();
        }
      });
      return () => {
        pusher.unsubscribe(userId);
      };
    }
  }, [userId, refetchUser]);

  return (
    <>
      <ToastContainer />
      <Header />
      <UserContext.Provider
        value={{
          data: data?.userData,
          battle: battle,
          setBattle: setBattle,
          status: userStatus,
          refetch: refetchUser,
        }}
      >
        <h1 className="my-2 hidden text-center font-fontasia text-5xl text-white md:block md:text-8xl">
          <Link href="/">TheNinja-RPG</Link>
        </h1>

        <div className="container max-w-7xl">
          <div className="grid grid-cols-3 md:grid-cols-5">
            <div className="col-span-1 hidden md:block">
              {data?.userData && isSignedIn && (
                <>
                  <MenuBoxProfile />
                </>
              )}
            </div>
            <div className="col-span-3">
              <NavBar />
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
    </>
  );
};

export default Layout;
