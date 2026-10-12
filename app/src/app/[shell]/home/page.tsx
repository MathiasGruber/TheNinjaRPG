"use client";

import {
  BadgeMinus,
  BadgePlus,
  ChefHat,
  Hammer,
  Home,
  MinusCircle,
  Package,
  PlusCircle,
  ShoppingBag,
} from "lucide-react";
import { useRef, useState } from "react";
import { api } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  HomeTypeDetails,
  ITEM_LEVEL_CAP,
  ItemRarities,
  ItemTypes,
} from "@/drizzle/constants";
import type { UserItemWithItem, UserItemWithRelations } from "@/drizzle/schema";
import { useSleepToggle } from "@/hooks/sleep";
import BanInfo from "@/layout/BanInfo";
import { ActionSelector } from "@/layout/CombatActions";
import ContentBox from "@/layout/ContentBox";
import { HomeScene } from "@/layout/HomeScene";
import ItemWithEffects from "@/layout/ItemWithEffects";
import Loader from "@/layout/Loader";
import { MergeAllStacksButton } from "@/layout/MergeAllStacksButton";
import Modal from "@/layout/Modal";
import {
  byItemName,
  calcMaxHouseCookingItems,
  calcMaxHouseMaterials,
  finishedImbuementItems,
  getHomeStorageBucket,
  showsItemLevelBadge,
  userItemActionBadges,
} from "@/libs/item";
import { showMutationToast } from "@/libs/toast";
import { remainingXpToLevel } from "@/libs/train";
import { useRequireInVillage } from "@/utils/UserContext";
import { getStrucBoost } from "@/utils/village";

export default function HomePage() {
  const { userData, sectorVillage, access, ownVillage } = useRequireInVillage("/home");

  // State
  const [selectedItem, setSelectedItem] = useState<UserItemWithRelations | undefined>(
    undefined,
  );
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isStorageOpen, setIsStorageOpen] = useState(false);
  const [isManagementOpen, setIsManagementOpen] = useState(false);
  const storageTriggerRef = useRef<HTMLButtonElement>(null);
  const managementTriggerRef = useRef<HTMLButtonElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [itemTypeFilter, setItemTypeFilter] = useState("ALL");
  const [rarityFilter, setRarityFilter] = useState("ALL");

  // Queries
  const {
    data: homeData,
    isLoading: isHomeLoading,
    isError: isHomeError,
    refetch: userHomeRefetch,
  } = api.home.getUserHome.useQuery(undefined, {
    enabled: !!userData && access && ownVillage,
  });
  const {
    data: availableUpgrades,
    isLoading: isUpgradesLoading,
    isError: isUpgradesError,
    refetch: upgradesRefetch,
  } = api.home.getAvailableUpgrades.useQuery(undefined, {
    enabled: !!userData && access && ownVillage,
  });
  const {
    data: userItems,
    isLoading: isItemsLoading,
    isError: isItemsError,
    refetch: userItemsRefetch,
  } = api.item.getUserItems.useQuery(undefined, {
    enabled: !!userData && access && ownVillage,
  });

  // Mutations
  const { mutate: upgradeHome, isPending: isUpgrading } =
    api.home.upgradeHome.useMutation({
      onSuccess: (data) => {
        showMutationToast(data);
        if (data.success) {
          void userHomeRefetch();
          void upgradesRefetch();
        }
      },
    });

  const { mutate: toggleStoreItem, isPending: isTogglingStoreItem } =
    api.home.toggleStoreItem.useMutation({
      onSuccess: (data) => {
        showMutationToast(data);
        if (data.success) {
          void userHomeRefetch();
          void userItemsRefetch();
          setIsModalOpen(false);
          setSelectedItem(undefined);
        }
      },
    });

  const { toggleSleep, isTogglingSleep } = useSleepToggle();

  if (!userData) return <Loader explanation="Loading userdata" />;
  if (!access) return <Loader explanation="Accessing Residence" />;
  if (userData.isBanned) return <BanInfo />;

  const boost = 1 + getStrucBoost("sleepRegenPerLvl", sectorVillage?.structures);

  const homeType = ownVillage ? (homeData?.homeType ?? userData.homeType) : "NONE";
  const homeName = HomeTypeDetails[homeType].name;
  const homeRegen = homeData ? homeData.regen : 0;
  const homeStorage = homeData ? homeData.storage : 0;
  const filteredItems = userItems?.filter(
    (useritem) =>
      !useritem.craftingFinishedAt || useritem.craftingFinishedAt < new Date(),
  );
  // Filter normal items (non-materials, non-cooking)
  const storedItems =
    filteredItems
      ?.filter(
        (useritem) =>
          useritem.storedAtHome && getHomeStorageBucket(useritem.item) === "normal",
      )
      .sort(byItemName) ?? [];
  const nonStoredItems =
    filteredItems
      ?.filter((useritem) => !useritem.storedAtHome)
      .filter((useritem) => useritem.equipped === "NONE")
      .filter((useritem) => getHomeStorageBucket(useritem.item) === "normal")
      .sort(byItemName) ?? [];

  // Filter materials separately
  const storedMaterials =
    filteredItems
      ?.filter(
        (useritem) =>
          useritem.storedAtHome && getHomeStorageBucket(useritem.item) === "materials",
      )
      .sort(byItemName) ?? [];
  const nonStoredMaterials =
    filteredItems
      ?.filter((useritem) => !useritem.storedAtHome)
      .filter((useritem) => useritem.equipped === "NONE")
      .filter((useritem) => getHomeStorageBucket(useritem.item) === "materials")
      .sort(byItemName) ?? [];

  // Filter cooking separately
  const storedCooking =
    filteredItems
      ?.filter(
        (useritem) =>
          useritem.storedAtHome && getHomeStorageBucket(useritem.item) === "cooking",
      )
      .sort(byItemName) ?? [];
  const nonStoredCooking =
    filteredItems
      ?.filter((useritem) => !useritem.storedAtHome)
      .filter((useritem) => useritem.equipped === "NONE")
      .filter((useritem) => getHomeStorageBucket(useritem.item) === "cooking")
      .sort(byItemName) ?? [];

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const matchesFilters = (userItem: UserItemWithItem) =>
    userItem.item.name.toLowerCase().includes(normalizedSearch) &&
    (itemTypeFilter === "ALL" || userItem.item.itemType === itemTypeFilter) &&
    (rarityFilter === "ALL" || userItem.item.rarity === rarityFilter);
  const visibleStoredItems = storedItems.filter(matchesFilters);
  const visibleStoredMaterials = storedMaterials.filter(matchesFilters);
  const visibleStoredCooking = storedCooking.filter(matchesFilters);
  const visibleInventoryItems = nonStoredItems.filter(matchesFilters);
  const visibleInventoryMaterials = nonStoredMaterials.filter(matchesFilters);
  const visibleInventoryCooking = nonStoredCooking.filter(matchesFilters);
  const hasActiveFilters =
    searchQuery !== "" || itemTypeFilter !== "ALL" || rarityFilter !== "ALL";

  const maxHouseMaterials =
    userData && homeData ? calcMaxHouseMaterials(userData, homeData.storage) : 0;
  const maxHouseCooking =
    userData && homeData ? calcMaxHouseCookingItems(userData, homeData.storage) : 0;
  const canStoreMoreItems = storedItems.length < homeStorage;
  const canStoreMoreMaterials = storedMaterials.length < maxHouseMaterials;
  const canStoreMoreCooking = storedCooking.length < maxHouseCooking;

  const storedItemBadges = userItemActionBadges(storedItems);
  const storedMaterialBadges = userItemActionBadges(storedMaterials);
  const storedCookingBadges = userItemActionBadges(storedCooking);
  const inventoryItemBadges = userItemActionBadges(nonStoredItems);
  const inventoryMaterialBadges = userItemActionBadges(nonStoredMaterials);
  const inventoryCookingBadges = userItemActionBadges(nonStoredCooking);

  // Filter upgrades and downgrades
  const upgrades = availableUpgrades?.filter((upgrade) => upgrade.isUpgrade) || [];
  const downgrades = availableUpgrades?.filter((upgrade) => !upgrade.isUpgrade) || [];

  return (
    <>
      <ContentBox
        title={ownVillage ? "Your Home" : "Guest Residence"}
        subtitle={
          ownVillage
            ? `${homeName} · +${boost}% regen sleeping.`
            : "Rest during your visit. Your home storage is in your own village."
        }
        defaultBackHref="/village"
      >
        {isHomeLoading ? (
          <Loader explanation="Loading your home" />
        ) : (
          <HomeScene
            homeType={homeType}
            isGuest={!ownVillage}
            isAsleep={userData.status === "ASLEEP"}
            isTogglingSleep={isTogglingSleep}
            onSleep={() => toggleSleep()}
            onStorage={(trigger) => {
              storageTriggerRef.current = trigger;
              setIsStorageOpen(true);
            }}
            onManage={(trigger) => {
              managementTriggerRef.current = trigger;
              setIsManagementOpen(true);
            }}
          />
        )}
        {isHomeError && (
          <div role="alert" className="mt-3 text-center">
            Unable to load your home details.
            <Button variant="outline" onClick={() => void userHomeRefetch()}>
              Retry
            </Button>
          </div>
        )}
      </ContentBox>
      {ownVillage && (
        <>
          <Modal
            title="Home Management"
            isOpen={isManagementOpen}
            setIsOpen={setIsManagementOpen}
            returnFocusRef={managementTriggerRef}
            className="sm:max-w-3xl"
          >
            {isHomeLoading || isUpgradesLoading ? (
              <Loader explanation="Loading home data" />
            ) : isHomeError || isUpgradesError || !homeData ? (
              <div role="alert">
                Unable to load home management.
                <Button
                  variant="outline"
                  onClick={() => {
                    void userHomeRefetch();
                    void upgradesRefetch();
                  }}
                >
                  Retry
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Home className="mr-2" />{" "}
                      <div className="flex flex-col gap-1">
                        <span>Current Home: {homeName}</span>
                        <div className="font-normal text-muted-foreground italic">
                          {homeRegen > 0 && <span>+{homeRegen} Regeneration</span>}
                          {homeStorage > 0 && (
                            <span className="ml-2">+{homeStorage} Item Storage</span>
                          )}
                          {userData &&
                            homeData &&
                            calcMaxHouseMaterials(userData, homeData.storage) > 0 && (
                              <span className="ml-2">
                                +{calcMaxHouseMaterials(userData, homeData.storage)}{" "}
                                Material Storage
                              </span>
                            )}
                          {userData &&
                            homeData &&
                            calcMaxHouseCookingItems(userData, homeData.storage) >
                              0 && (
                              <span className="ml-2">
                                +{calcMaxHouseCookingItems(userData, homeData.storage)}{" "}
                                Cooking Storage
                              </span>
                            )}
                        </div>
                      </div>
                    </CardTitle>
                  </CardHeader>
                </Card>

                <Tabs defaultValue="upgrades" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="upgrades">
                      <BadgePlus className="mr-2 h-5 w-5" /> Buy New Home
                    </TabsTrigger>
                    <TabsTrigger value="downgrades">
                      <BadgeMinus className="mr-2 h-5 w-5" /> Downgrades
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="upgrades">
                    {upgrades.length === 0 ? (
                      <div className="p-4 text-center">
                        You already have the best home available!
                      </div>
                    ) : (
                      <div className="h-64 overflow-y-auto pr-1">
                        <div className="space-y-2 p-1">
                          {upgrades.map((upgrade, i) => (
                            <Card key={`${upgrade.type}-${i}`} className="mb-2">
                              <CardHeader className="pb-2">
                                <CardTitle>
                                  <div className="flex justify-between">
                                    <div className="flex flex-col">
                                      <span className="font-semibold text-lg">
                                        {upgrade.name}
                                      </span>
                                      <div className="flex flex-col font-normal text-muted-foreground italic sm:flex-row sm:gap-3">
                                        {upgrade.regen > 0 && (
                                          <span>+{upgrade.regen} Regen</span>
                                        )}
                                        {upgrade.storage > 0 && (
                                          <span>+{upgrade.storage} Item Storage</span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex flex-col items-center">
                                      <span className="font-semibold text-lg">
                                        {upgrade.upgradeCost > 0
                                          ? `${upgrade.upgradeCost.toLocaleString()} Ryo`
                                          : "Free"}
                                      </span>
                                      <Button
                                        onClick={() =>
                                          upgradeHome({
                                            homeType: upgrade.type,
                                          })
                                        }
                                        disabled={
                                          isUpgrading ||
                                          (userData?.money ?? 0) < upgrade.upgradeCost
                                        }
                                        size="sm"
                                      >
                                        <PlusCircle className="mr-2 h-4 w-4" /> Buy
                                      </Button>
                                    </div>
                                  </div>
                                </CardTitle>
                              </CardHeader>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="downgrades">
                    {downgrades.length === 0 ? (
                      <div className="p-4 text-center">
                        You already have the lowest tier home!
                      </div>
                    ) : (
                      <div className="h-64 overflow-y-auto pr-1">
                        <div className="space-y-2 p-1">
                          {downgrades.map((downgrade) => (
                            <Card key={downgrade.type} className="mb-2">
                              <CardHeader className="pb-2">
                                <CardTitle>
                                  <div className="flex justify-between">
                                    <div className="flex flex-col">
                                      <span className="font-semibold text-lg">
                                        {downgrade.name}
                                      </span>
                                      <div className="flex flex-col font-normal text-muted-foreground italic sm:flex-row sm:gap-3">
                                        {downgrade.regen > 0 && (
                                          <span>+{downgrade.regen} Regen</span>
                                        )}
                                        {downgrade.storage > 0 && (
                                          <span>+{downgrade.storage} Item Storage</span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex flex-col items-center">
                                      <span className="font-semibold text-lg text-muted-foreground">
                                        {downgrade.downgradeRefund > 0
                                          ? `${downgrade.downgradeRefund.toLocaleString()} Ryo back (75%)`
                                          : "No cost"}
                                      </span>
                                      <Button
                                        onClick={() =>
                                          upgradeHome({
                                            homeType: downgrade.type,
                                          })
                                        }
                                        disabled={isUpgrading}
                                        size="sm"
                                      >
                                        <MinusCircle className="mr-2 h-4 w-4" />{" "}
                                        Downgrade
                                      </Button>
                                    </div>
                                  </div>
                                </CardTitle>
                              </CardHeader>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </Modal>

          <Modal
            title="Armory · Home Storage"
            isOpen={isStorageOpen}
            setIsOpen={setIsStorageOpen}
            returnFocusRef={storageTriggerRef}
            className="sm:max-w-4xl"
          >
            {homeData && !isItemsError && (
              <div className="flex justify-end">
                <MergeAllStacksButton
                  storedAtHome={true}
                  onMerged={() => {
                    setSelectedItem(undefined);
                    setIsModalOpen(false);
                  }}
                />
              </div>
            )}
            {isHomeLoading || isItemsLoading ? (
              <Loader explanation="Loading item storage data" />
            ) : isHomeError || isItemsError || !homeData ? (
              <div role="alert">
                Unable to load home storage.
                <Button
                  variant="outline"
                  onClick={() => {
                    void userHomeRefetch();
                    void userItemsRefetch();
                  }}
                >
                  Retry
                </Button>
              </div>
            ) : (
              <Tabs defaultValue="stored" className="w-full">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                  <Input
                    aria-label="Search home storage by name"
                    placeholder="Search by name..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="flex-1"
                  />
                  <Select value={itemTypeFilter} onValueChange={setItemTypeFilter}>
                    <SelectTrigger
                      aria-label="Filter by item type"
                      className="w-full sm:w-40"
                    >
                      <SelectValue placeholder="Item type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Types</SelectItem>
                      {ItemTypes.map((itemType) => (
                        <SelectItem key={itemType} value={itemType}>
                          {itemType.charAt(0) + itemType.slice(1).toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={rarityFilter} onValueChange={setRarityFilter}>
                    <SelectTrigger
                      aria-label="Filter by rarity"
                      className="w-full sm:w-40"
                    >
                      <SelectValue placeholder="Rarity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Rarities</SelectItem>
                      {ItemRarities.map((rarity) => (
                        <SelectItem key={rarity} value={rarity}>
                          {rarity.charAt(0) + rarity.slice(1).toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    disabled={!hasActiveFilters}
                    onClick={() => {
                      setSearchQuery("");
                      setItemTypeFilter("ALL");
                      setRarityFilter("ALL");
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
                <TabsList className="grid w-full grid-cols-2 items-stretch sm:grid-cols-4">
                  <TabsTrigger
                    value="stored"
                    className="min-w-0 flex-wrap gap-x-1 px-2"
                    aria-label={`Stored Items (${storedItems.length} / ${homeStorage} slots used)`}
                  >
                    <span className="inline-flex items-center">
                      <Package className="mr-1 h-4 w-4 shrink-0" /> Stored Items
                    </span>
                    <span className="font-normal text-xs tabular-nums">
                      ({storedItems.length} / {homeStorage})
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="materials"
                    className="min-w-0 flex-wrap gap-x-1 px-2"
                    aria-label={`Materials (${storedMaterials.length} / ${maxHouseMaterials} slots used)`}
                  >
                    <span className="inline-flex items-center">
                      <Hammer className="mr-1 h-4 w-4 shrink-0" /> Materials
                    </span>
                    <span className="font-normal text-xs tabular-nums">
                      ({storedMaterials.length} / {maxHouseMaterials})
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="cooking"
                    className="min-w-0 flex-wrap gap-x-1 px-2"
                    aria-label={`Cooking (${storedCooking.length} / ${maxHouseCooking} slots used)`}
                  >
                    <span className="inline-flex items-center">
                      <ChefHat className="mr-1 h-4 w-4 shrink-0" /> Cooking
                    </span>
                    <span className="font-normal text-xs tabular-nums">
                      ({storedCooking.length} / {maxHouseCooking})
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="inventory" className="min-w-0 px-2">
                    <ShoppingBag className="mr-1 h-4 w-4 shrink-0" /> Inventory
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="stored">
                  {visibleStoredItems.length === 0 ? (
                    <div className="p-4 text-center">
                      {storedItems.length === 0
                        ? "You don't have any items stored in your home."
                        : "No items match your filters."}
                    </div>
                  ) : (
                    <div className="p-3">
                      <ActionSelector
                        items={visibleStoredItems?.map((useritem) => ({
                          ...useritem.item,
                          ...useritem,
                        }))}
                        counts={storedItemBadges.counts}
                        levels={storedItemBadges.levels}
                        selectedId={selectedItem?.id}
                        showBgColor={false}
                        showLabels={false}
                        onClick={(id) => {
                          if (id === selectedItem?.id) {
                            setSelectedItem(undefined);
                            setIsModalOpen(false);
                          } else {
                            const item = visibleStoredItems?.find(
                              (item) => item.id === id,
                            );
                            if (item) {
                              setSelectedItem(item);
                              setIsModalOpen(true);
                            }
                          }
                        }}
                      />
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="materials">
                  <div className="space-y-4">
                    <div>
                      <h4 className="mb-2 font-semibold">Stored Materials</h4>
                      {visibleStoredMaterials.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground">
                          {storedMaterials.length === 0
                            ? "No materials stored in your home."
                            : "No materials match your filters."}
                        </div>
                      ) : (
                        <div className="p-3">
                          <ActionSelector
                            items={visibleStoredMaterials?.map((useritem) => ({
                              ...useritem.item,
                              ...useritem,
                            }))}
                            counts={storedMaterialBadges.counts}
                            levels={storedMaterialBadges.levels}
                            selectedId={selectedItem?.id}
                            showBgColor={false}
                            showLabels={false}
                            onClick={(id) => {
                              if (id === selectedItem?.id) {
                                setSelectedItem(undefined);
                                setIsModalOpen(false);
                              } else {
                                const item = visibleStoredMaterials?.find(
                                  (item) => item.id === id,
                                );
                                if (item) {
                                  setSelectedItem(item);
                                  setIsModalOpen(true);
                                }
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="cooking">
                  <div className="space-y-4">
                    <div>
                      <h4 className="mb-2 font-semibold">Stored Cooking</h4>
                      {visibleStoredCooking.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground">
                          {storedCooking.length === 0
                            ? "No cooking items stored in your home."
                            : "No cooking items match your filters."}
                        </div>
                      ) : (
                        <div className="p-3">
                          <ActionSelector
                            items={visibleStoredCooking?.map((useritem) => ({
                              ...useritem.item,
                              ...useritem,
                            }))}
                            counts={storedCookingBadges.counts}
                            levels={storedCookingBadges.levels}
                            selectedId={selectedItem?.id}
                            showBgColor={false}
                            showLabels={false}
                            onClick={(id) => {
                              if (id === selectedItem?.id) {
                                setSelectedItem(undefined);
                                setIsModalOpen(false);
                              } else {
                                const item = visibleStoredCooking?.find(
                                  (item) => item.id === id,
                                );
                                if (item) {
                                  setSelectedItem(item);
                                  setIsModalOpen(true);
                                }
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="inventory">
                  {visibleInventoryItems.length === 0 &&
                  visibleInventoryMaterials.length === 0 &&
                  visibleInventoryCooking.length === 0 ? (
                    <div className="p-4 text-center">
                      {nonStoredItems.length === 0 &&
                      nonStoredMaterials.length === 0 &&
                      nonStoredCooking.length === 0
                        ? "You don't have any items in your inventory."
                        : "No inventory items match your filters."}
                    </div>
                  ) : (
                    <div className="p-3">
                      {visibleInventoryItems.length > 0 && (
                        <div className="mb-4">
                          <h4 className="mb-2 font-semibold">Items</h4>
                          <ActionSelector
                            items={visibleInventoryItems?.map((useritem) => ({
                              ...useritem.item,
                              ...useritem,
                            }))}
                            counts={inventoryItemBadges.counts}
                            levels={inventoryItemBadges.levels}
                            selectedId={selectedItem?.id}
                            showBgColor={false}
                            showLabels={false}
                            greyedIds={
                              !canStoreMoreItems
                                ? visibleInventoryItems?.map((useritem) => useritem.id)
                                : undefined
                            }
                            onClick={(id) => {
                              if (id === selectedItem?.id) {
                                setSelectedItem(undefined);
                                setIsModalOpen(false);
                              } else {
                                const item = userItems?.find((item) => item.id === id);
                                if (item) {
                                  setSelectedItem(item);
                                  setIsModalOpen(true);
                                }
                              }
                            }}
                          />
                        </div>
                      )}

                      {visibleInventoryMaterials.length > 0 && (
                        <div className="mb-4">
                          <h4 className="mb-2 font-semibold">Materials</h4>
                          <ActionSelector
                            items={visibleInventoryMaterials?.map((useritem) => ({
                              ...useritem.item,
                              ...useritem,
                            }))}
                            counts={inventoryMaterialBadges.counts}
                            levels={inventoryMaterialBadges.levels}
                            selectedId={selectedItem?.id}
                            showBgColor={false}
                            showLabels={false}
                            greyedIds={
                              !canStoreMoreMaterials
                                ? visibleInventoryMaterials?.map(
                                    (useritem) => useritem.id,
                                  )
                                : undefined
                            }
                            onClick={(id) => {
                              if (id === selectedItem?.id) {
                                setSelectedItem(undefined);
                                setIsModalOpen(false);
                              } else {
                                const item = userItems?.find((item) => item.id === id);
                                if (item) {
                                  setSelectedItem(item);
                                  setIsModalOpen(true);
                                }
                              }
                            }}
                          />
                        </div>
                      )}

                      {visibleInventoryCooking.length > 0 && (
                        <div>
                          <h4 className="mb-2 font-semibold">Cooking</h4>
                          <ActionSelector
                            items={visibleInventoryCooking?.map((useritem) => ({
                              ...useritem.item,
                              ...useritem,
                            }))}
                            counts={inventoryCookingBadges.counts}
                            levels={inventoryCookingBadges.levels}
                            selectedId={selectedItem?.id}
                            showBgColor={false}
                            showLabels={false}
                            greyedIds={
                              !canStoreMoreCooking
                                ? visibleInventoryCooking?.map(
                                    (useritem) => useritem.id,
                                  )
                                : undefined
                            }
                            onClick={(id) => {
                              if (id === selectedItem?.id) {
                                setSelectedItem(undefined);
                                setIsModalOpen(false);
                              } else {
                                const item = userItems?.find((item) => item.id === id);
                                if (item) {
                                  setSelectedItem(item);
                                  setIsModalOpen(true);
                                }
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}

            {/* Stored Items Modal */}
            {isModalOpen && selectedItem && (
              <Modal
                title="Item Details"
                isOpen={isModalOpen}
                setIsOpen={setIsModalOpen}
                isLoading={isTogglingStoreItem}
                keepOpenOnAccept
                proceed_label={
                  selectedItem.storedAtHome ? "Take from Storage" : "Store Item"
                }
                onAccept={() => {
                  toggleStoreItem({ userItemId: selectedItem.id });
                }}
              >
                {showsItemLevelBadge(selectedItem.item) &&
                  selectedItem.level < ITEM_LEVEL_CAP && (
                    <p>
                      - Need{" "}
                      {remainingXpToLevel(
                        selectedItem.item.xpToLevel,
                        selectedItem.experience,
                      )}{" "}
                      XP more to level
                    </p>
                  )}
                <ItemWithEffects
                  item={{
                    ...selectedItem.item,
                    imbuements: finishedImbuementItems(selectedItem),
                    curDurability: selectedItem.durability,
                    level: selectedItem.level,
                    experience: selectedItem.experience,
                  }}
                  key={selectedItem.id}
                  showStatistic="item"
                />
                {isTogglingStoreItem && (
                  <Loader explanation={`Moving ${selectedItem.item.name}`} />
                )}
              </Modal>
            )}
          </Modal>
        </>
      )}
    </>
  );
}
