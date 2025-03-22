"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import BanInfo from "@/layout/BanInfo";
import {
  IMG_HOME_TRAIN,
  IMG_HOME_EAT,
  IMG_HOME_SLEEP,
  IMG_HOME_AWAKE,
  HomeTypeDetails
} from "@/drizzle/constants";
import { api } from "@/app/_trpc/client";
import { structureBoost } from "@/utils/village";
import { showMutationToast } from "@/libs/toast";
import { useRequireInVillage } from "@/utils/UserContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRyo } from "@/utils/formatting";
import { 
  BadgePlus,
  BadgeMinus,
  Home,
  Package,
  PlusCircle,
  MinusCircle,
  ShoppingBag
} from "lucide-react";
import { cn } from "@/libs/shadui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function HomePage() {
  const { userData, sectorVillage, access, ownVillage, updateUser } =
    useRequireInVillage("/home");
  const [activeTab, setActiveTab] = useState<"upgrades" | "downgrades">("upgrades");

  const { mutate: toggleSleep, isPending: isTogglingSleep } =
    api.home.toggleSleep.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success && data.newStatus) {
          await updateUser({ status: data.newStatus });
        }
      },
    });

  const { data: homeData, isLoading: isHomeLoading } = api.home.getUserHome.useQuery();
  const { data: availableUpgrades, isLoading: isUpgradesLoading } = api.home.getAvailableUpgrades.useQuery();
  
  const { mutate: upgradeHome, isPending: isUpgrading } = api.home.upgradeHome.useMutation({
    onSuccess: (data) => {
      showMutationToast(data);
      if (data.success) {
        // Refetch data after successful upgrade
        void userHomeRefetch();
        void upgradesRefetch();
      }
    },
  });
  
  const { mutate: storeItem, isPending: isStoringItem } = api.home.storeItem.useMutation({
    onSuccess: (data) => {
      showMutationToast(data);
      if (data.success) {
        // Refetch data after successful item storage
        void userHomeRefetch();
        void userItemsRefetch();
      }
    },
  });
  
  const { mutate: retrieveItem, isPending: isRetrievingItem } = api.home.retrieveItem.useMutation({
    onSuccess: (data) => {
      showMutationToast(data);
      if (data.success) {
        // Refetch data after successful item retrieval
        void userHomeRefetch();
        void userItemsRefetch();
      }
    },
  });

  // Refetch functions
  const { refetch: userHomeRefetch } = api.home.getUserHome.useQuery();
  const { refetch: upgradesRefetch } = api.home.getAvailableUpgrades.useQuery();
  
  // Get user's items for storage functionality
  const { data: userItems, isLoading: isItemsLoading, refetch: userItemsRefetch } = api.item.getUserItems.useQuery();

  if (!userData) return <Loader explanation="Loading userdata" />;
  if (!access) return <Loader explanation="Accessing Residence" />;
  if (userData.isBanned) return <BanInfo />;

  const boost = 1 + structureBoost("sleepRegenPerLvl", sectorVillage?.structures);
  
  const homeName = homeData ? HomeTypeDetails[homeData.homeType].name : "No Home";
  const homeRegen = homeData ? homeData.regen : 0;
  const homeStorage = homeData ? homeData.storage : 0;
  const storedItems = homeData?.storedItems || [];
  
  const canStoreMoreItems = storedItems.length < homeStorage;
  
  // Filter upgrades and downgrades
  const upgrades = availableUpgrades?.filter(upgrade => upgrade.isUpgrade) || [];
  const downgrades = availableUpgrades?.filter(upgrade => !upgrade.isUpgrade) || [];

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
            subtitle="Upgrade your home for additional storage space and increased regeneration"
            initialBreak={true}
          >
            {isHomeLoading || isUpgradesLoading ? (
              <Loader explanation="Loading home data" />
            ) : (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Home className="mr-2" /> Current Home: {homeName}
                    </CardTitle>
                    <CardDescription>
                      {homeRegen > 0 && <span>+{homeRegen} Regeneration</span>}
                      {homeStorage > 0 && <span className="ml-2">+{homeStorage} Item Storage</span>}
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Tabs defaultValue="upgrades" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="upgrades" onClick={() => setActiveTab("upgrades")}>
                      <BadgePlus className="mr-2" /> Upgrades
                    </TabsTrigger>
                    <TabsTrigger value="downgrades" onClick={() => setActiveTab("downgrades")}>
                      <BadgeMinus className="mr-2" /> Downgrades
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="upgrades">
                    {upgrades.length === 0 ? (
                      <div className="text-center p-4">
                        You already have the best home available!
                      </div>
                    ) : (
                      <div className="h-64 overflow-y-auto pr-1">
                        <div className="space-y-2 p-1">
                          {upgrades.map((upgrade) => (
                            <Card key={upgrade.type} className="mb-2">
                              <CardHeader className="pb-2">
                                <CardTitle>{upgrade.name}</CardTitle>
                                <CardDescription>
                                  <div className="flex justify-between">
                                    <span>+{upgrade.regen} Regeneration</span>
                                    <span>+{upgrade.storage} Item Storage</span>
                                  </div>
                                </CardDescription>
                              </CardHeader>
                              <CardFooter className="pt-2 flex justify-between items-center">
                                <span className="font-semibold">{formatRyo(upgrade.cost)}</span>
                                <Button 
                                  onClick={() => upgradeHome({ homeType: upgrade.type })}
                                  disabled={isUpgrading || userData.ryo < upgrade.cost}
                                  size="sm"
                                >
                                  <PlusCircle className="mr-2 h-4 w-4" /> Upgrade
                                </Button>
                              </CardFooter>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="downgrades">
                    {downgrades.length === 0 ? (
                      <div className="text-center p-4">
                        You already have the lowest tier home!
                      </div>
                    ) : (
                      <div className="h-64 overflow-y-auto pr-1">
                        <div className="space-y-2 p-1">
                          {downgrades.map((downgrade) => (
                            <Card key={downgrade.type} className="mb-2">
                              <CardHeader className="pb-2">
                                <CardTitle>{downgrade.name}</CardTitle>
                                <CardDescription>
                                  <div className="flex justify-between">
                                    <span>+{downgrade.regen} Regeneration</span>
                                    <span>+{downgrade.storage} Item Storage</span>
                                  </div>
                                </CardDescription>
                              </CardHeader>
                              <CardFooter className="pt-2 flex justify-end">
                                <Button 
                                  onClick={() => upgradeHome({ homeType: downgrade.type })}
                                  disabled={isUpgrading || storedItems.length > downgrade.storage}
                                  size="sm"
                                  variant="outline"
                                >
                                  <MinusCircle className="mr-2 h-4 w-4" /> Downgrade
                                </Button>
                              </CardFooter>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </ContentBox>
          
          <ContentBox 
            title="Item Storage" 
            subtitle={`Store items in your home (${storedItems.length}/${homeStorage} slots used)`}
            initialBreak={true}
          >
            {isHomeLoading || isItemsLoading ? (
              <Loader explanation="Loading item storage data" />
            ) : homeData?.homeType === "NONE" ? (
              <div className="text-center p-4">
                You need to upgrade your home to store items.
              </div>
            ) : (
              <Tabs defaultValue="stored" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="stored">
                    <Package className="mr-2" /> Stored Items
                  </TabsTrigger>
                  <TabsTrigger value="inventory">
                    <ShoppingBag className="mr-2" /> Inventory
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="stored">
                  {storedItems.length === 0 ? (
                    <div className="text-center p-4">
                      You don't have any items stored in your home.
                    </div>
                  ) : (
                    <div className="h-64 overflow-y-auto pr-1">
                      <div className="space-y-2 p-1">
                        {storedItems.map((itemId) => {
                          const itemDetails = userItems?.find(item => item.id === itemId);
                          return (
                            <Card key={itemId} className="mb-2">
                              <CardContent className="p-4 flex justify-between items-center">
                                <div>
                                  <h4 className="font-medium">{itemDetails?.name || "Unknown Item"}</h4>
                                  <p className="text-sm text-muted-foreground">
                                    {itemDetails?.itemType || ""}
                                  </p>
                                </div>
                                <Button 
                                  onClick={() => retrieveItem({ itemId })}
                                  disabled={isRetrievingItem}
                                  size="sm"
                                  variant="outline"
                                >
                                  <MinusCircle className="mr-2 h-4 w-4" /> Take
                                </Button>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="inventory">
                  {!userItems || userItems.length === 0 ? (
                    <div className="text-center p-4">
                      You don't have any items in your inventory.
                    </div>
                  ) : (
                    <div className="h-64 overflow-y-auto pr-1">
                      <div className="space-y-2 p-1">
                        {userItems
                          .filter(item => item.equipped === "NONE")
                          .map((item) => (
                            <Card key={item.id} className="mb-2">
                              <CardContent className="p-4 flex justify-between items-center">
                                <div>
                                  <h4 className="font-medium">{item.name}</h4>
                                  <p className="text-sm text-muted-foreground">
                                    {item.itemType} (x{item.quantity})
                                  </p>
                                </div>
                                <Button 
                                  onClick={() => storeItem({ itemId: item.id })}
                                  disabled={isStoringItem || !canStoreMoreItems}
                                  size="sm"
                                >
                                  <PlusCircle className="mr-2 h-4 w-4" /> Store
                                </Button>
                              </CardContent>
                            </Card>
                          ))}
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </ContentBox>
        </>
      )}
    </>
  );
}
