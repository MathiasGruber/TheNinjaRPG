"use client";

import Image from "next/image";
import Link from "next/link";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import BanInfo from "@/layout/BanInfo";
import { api } from "@/app/_trpc/client";
import { structureBoost } from "@/utils/village";
import { showMutationToast } from "@/libs/toast";
import { useRequireInVillage } from "@/utils/UserContext";

export default function Home() {
  const util = api.useUtils();

  const { userData, sectorVillage, access, ownVillage } = useRequireInVillage("/home");

  const { mutate: toggleSleep, isPending: isTogglingSleep } =
    api.home.toggleSleep.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await util.profile.getUser.invalidate();
        }
      },
    });

  if (!userData) return <Loader explanation="Loading userdata" />;
  if (!access) return <Loader explanation="Accessing Residence" />;
  if (userData.isBanned) return <BanInfo />;

  const boost = 1 + structureBoost("sleepRegenPerLvl", sectorVillage?.structures);

  return (
    <>
      <ContentBox
        title={ownVillage ? "Your Home" : "Guest Residence"}
        subtitle={`Train, eat, sleep. +${boost}% regen sleeping.`}
        back_href="/village"
      >
        <div className="grid grid-cols-3 text-center font-bold italic">
          <Link href="/traininggrounds">
            <Image
              className="hover:opacity-30"
              alt="train"
              src="/home/train.webp"
              width={256}
              height={256}
            />
            Go train
          </Link>
          <Link href="/ramenshop">
            <Image
              className="hover:opacity-30"
              alt="eat"
              src="/home/eat.webp"
              width={256}
              height={256}
            />
            Get Food
          </Link>
          {isTogglingSleep && <Loader explanation="Toggling sleep status" />}
          {!isTogglingSleep && (
            <div className="cursor-pointer" onClick={() => toggleSleep()}>
              {userData.status === "ASLEEP" ? (
                <>
                  <Image
                    className="hover:opacity-30 animate-pulse"
                    alt="sleeping"
                    src="/home/sleep.webp"
                    width={256}
                    height={256}
                  />
                  Wake up
                </>
              ) : (
                <>
                  <Image
                    className="hover:opacity-30"
                    alt="sleeping"
                    src="/home/awake.webp"
                    width={256}
                    height={256}
                  />
                  Go to Sleep
                </>
              )}
            </div>
          )}
        </div>
      </ContentBox>
      {ownVillage && (
        <>
          <ContentBox
            title="Overview"
            subtitle="Decorate, upgrade, host parties"
            initialBreak={true}
          >
            WIP
          </ContentBox>
          <ContentBox title="Item Storage" subtitle="Store items" initialBreak={true}>
            WIP
          </ContentBox>
        </>
      )}
    </>
  );
}
