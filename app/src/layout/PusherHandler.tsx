"use client";

import { useEffect, useState } from "react";
import { api } from "@/app/_trpc/client";
import Pusher from "pusher-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { showMutationToast } from "@/libs/toast";
import { ToastAction } from "@/components/ui/toast";
import { env } from "@/env/client.mjs";

// Events sent to the user from websockets
export type UserEvent = {
  type: string;
  message?: string;
  route?: string;
  routeText?: string;
};

export const usePusherHandler = (userId?: string | null) => {
  // Navigation
  const router = useRouter();

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
              wsHost: "localhost",
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
          router.push("/combat");
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
  }, [userId, router, utils]);

  return pusher;
};
