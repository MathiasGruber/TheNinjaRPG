"use client";

import Image from "next/image";
import Link from "next/link";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import BanInfo from "@/layout/BanInfo";
import {
  IMG_HOME_TRAIN,
  IMG_HOME_EAT,
  IMG_HOME_SLEEP,
  IMG_HOME_AWAKE,
} from "@/drizzle/constants";
import { api } from "@/app/_trpc/client";
import { structureBoost } from "@/utils/village";
import { showMutationToast } from "@/libs/toast";
import { useRequireInVillage } from "@/utils/UserContext";

export default function Home() {
  const { userData, sectorVillage, access, ownVillage, updateUser } =
    useRequireInVillage("/home");

  const { data, refetch } = api.home.getHome.useQuery(undefined, {
    enabled: !!access && !!ownVillage,
  });

  const { mutate: upgradeHome, isPending: isUpgrading } =
    api.home.upgradeHome.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await refetch();
          await updateUser({ home: data.home });
        }
      },
    });

  const { mutate: storeItem, isPending: isStoringItem } =
    api.home.storeItem.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await refetch();
        }
      },
    });

  const { mutate: removeItem, isPending: isRemovingItem } =
    api.home.removeItem.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await refetch();
        }
      },
    });

  const { mutate: toggleSleep, isPending: isTogglingSleep } =
    api.home.toggleSleep.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success && data.newStatus) {
          await updateUser({ status: data.newStatus });
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
              src={IMG_HOME_TRAIN}
              width={256}
              height={256}
            />
            Go train
          </Link>
          <Link href="/ramenshop">
            <Image
              className="hover:opacity-30"
              alt="eat"
              src={IMG_HOME_EAT}
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
                    src={IMG_HOME_SLEEP}
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
                    src={IMG_HOME_AWAKE}
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
            subtitle="Upgrade your home for better regeneration and storage"
            initialBreak={true}
          >
            <div className="space-y-4">
              {data?.home ? (
                <div className="text-center bg-gray-100 p-4 rounded-lg">
                  <h3 className="text-lg font-bold">{data.home.name}</h3>
                  <p>Regeneration Bonus: +{data.home.regenBonus}</p>
                  <p>Storage Slots: {data.home.storageSlots}</p>
                </div>
              ) : (
                <p className="text-center italic">You don&apos;t own a home yet</p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data?.availableHomes
                  .sort((a, b) => a.cost - b.cost)
                  .map((home) => (
                    <div
                      key={home.id}
                      className={`p-4 border rounded-lg ${
                        data.home?.id === home.id
                          ? "border-green-500 bg-green-50"
                          : "border-gray-300 hover:border-blue-500"
                      }`}
                    >
                      <h4 className="font-bold text-lg">{home.name}</h4>
                      <div className="mt-2 space-y-1">
                        <p className="flex justify-between">
                          <span>Regeneration:</span>
                          <span className="font-semibold">+{home.regenBonus}</span>
                        </p>
                        <p className="flex justify-between">
                          <span>Storage:</span>
                          <span className="font-semibold">{home.storageSlots} slots</span>
                        </p>
                        <p className="flex justify-between">
                          <span>Cost:</span>
                          <span className="font-semibold">{home.cost.toLocaleString()} Ryo</span>
                        </p>
                      </div>
                      {data.home?.id !== home.id && (
                        <button
                          className={`mt-4 w-full px-4 py-2 rounded ${
                            userData.money >= home.cost
                              ? "bg-blue-500 hover:bg-blue-600 text-white"
                              : "bg-gray-300 text-gray-500 cursor-not-allowed"
                          }`}
                          onClick={() => upgradeHome({ homeTypeId: home.id })}
                          disabled={isUpgrading || userData.money < home.cost}
                        >
                          {isUpgrading ? "Upgrading..." : "Upgrade"}
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </ContentBox>
          <ContentBox
            title="Item Storage"
            subtitle={`${data?.storage?.length ?? 0}/${
              data?.home?.storageSlots ?? 0
            } slots used`}
            initialBreak={true}
          >
            {data?.home ? (
              <div className="grid grid-cols-5 gap-4">
                {Array.from({ length: data.home.storageSlots }).map((_, i) => {
                  const storedItem = data.storage?.find((s) => s.slot === i);
                  return (
                    <div
                      key={i}
                      className="aspect-square border border-gray-300 rounded-lg p-2 flex items-center justify-center"
                    >
                      {storedItem ? (
                        <div className="flex flex-col items-center gap-2">
                          <Image
                            src={storedItem.item.image}
                            alt={storedItem.item.name}
                            width={32}
                            height={32}
                            className="rounded-md"
                          />
                          <p className="text-sm font-medium">{storedItem.item.name}</p>
                          <button
                            className="text-red-500 hover:text-red-600 text-sm"
                            onClick={() => removeItem({ slot: i })}
                            disabled={isRemovingItem}
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div className="text-center">
                          <p className="text-sm text-gray-500 mb-2">Empty Slot</p>
                          <select
                            className="w-full max-w-[200px] text-sm p-1 border rounded"
                            onChange={(e) => {
                              if (e.target.value) {
                                storeItem({ userItemId: e.target.value, slot: i });
                              }
                            }}
                            value=""
                            disabled={isStoringItem}
                          >
                            <option value="">Select Item</option>
                            {data?.userItems.map((userItem) => (
                              <option key={userItem.id} value={userItem.id}>
                                {userItem.item.name} ({userItem.quantity})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center italic">Purchase a home to store items</p>
            )}
          </ContentBox>
        </>
      )}
    </>
  );
}
