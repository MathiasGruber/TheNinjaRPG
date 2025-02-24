"use client";

import { useEffect, useState } from "react";
import { api } from "@/app/_trpc/client";
import Pusher from "pusher-js";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { showMutationToast } from "@/libs/toast";
import { ToastAction } from "@/components/ui/toast";
import { env } from "@/env/client.mjs";

// Events sent to the user from websockets
export type UserEvent = {
  type: string;
  message?: string;
  route?: string;
  routeText?: string;
  battleId?: string;
};

export const usePusherHandler = (userId?: string | null) => {
  // Navigation
  const router = useRouter();
  const pathname = usePathname();

  // tRPC utility
  const utils = api.useUtils();

  // Pusher connection
  const [pusher, setPusher] = useState<Pusher | undefined>(undefined);

  // Listen on user channel for live updates on things
  useEffect(() => {
    if (userId) {
      // Pusher Channel
      const pusher = new Pusher(
        process.env.NEXT_PUBLIC_PUSHER_APP_KEY,
        env.NEXT_PUBLIC_NODE_ENV === "development"
          ? {
              wsHost: "127.0.0.1",
              wsPort: 6001,
              wssPort: 6001,
              forceTLS: false,
              disableStats: true,
              enabledTransports: ["ws", "wss"],
              cluster: process.env.NEXT_PUBLIC_PUSHER_APP_CLUSTER,
            }
          : {
              wsHost: "soketi.theninja-rpg.ai",
              forceTLS: true,
              disableStats: true,
              enabledTransports: ["ws", "wss"],
              cluster: process.env.NEXT_PUBLIC_PUSHER_APP_CLUSTER,
            },
      );
      setPusher(pusher);
      const channel = pusher.subscribe(userId);
      channel.bind("event", async (data: UserEvent) => {
        if (data.type === "battle") {
          if (data?.battleId) {
            // NOTE: for some reason using updateUser does not work from this hook
            await utils.profile.getUser.cancel();
            // Update user data with battle status
            utils.profile.getUser.setData(undefined, (old) => {
              if (!old) return old;
              return {
                ...old,
                userData: {
                  ...old.userData,
                  status: "BATTLE",
                  battleId: data.battleId,
                  updatedAt: new Date(),
                },
                notifications: [
                  ...(old.notifications || []),
                  { href: "/combat", name: "In combat", color: "red" },
                ],
              };
            });
            // Invalidate user data to force a refetch
            await utils.profile.getUser.invalidate();
            router.push("/combat");
          }
        } else if (data.type === "newInbox") {
          if (!pathname.includes("/inbox")) {
            showMutationToast({
              success: true,
              message: "You have a new message",
              title: "Notification!",
              action: (
                <ToastAction altText="To Inbox">
                  <Link href="/inbox">To Inbox</Link>
                </ToastAction>
              ),
            });
          }
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
      });
      return () => {
        pusher.unsubscribe(userId);
        pusher.disconnect();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, router, utils]);

  return pusher;
};
