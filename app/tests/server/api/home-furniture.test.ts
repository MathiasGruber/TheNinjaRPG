import { beforeEach, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { HomeTypeDetails } from "@/drizzle/constants";
import { item, itemVariant, userData, userItem, userItemVariant, village } from "@/drizzle/schema";
import { homeRouter } from "@/server/api/routers/home";
import { FURNITURE_ITEM_DEFAULTS } from "@/validators/itemFurniture";
import type { HomePlacement } from "@/validators/home";
import { insertItems, insertUserItems, insertUsers } from "../../setup/factories";
import { beforeStatements } from "../../setup/statements";
import { callerFor, callerForDatabase, describeWithDatabase, getTestDatabase, recordQueries, resetTables } from "../../setup/testDatabase";

const userId = "home-owner";
const homeVillage = "home-village";
const initialMoney = HomeTypeDetails.STUDIO_APARTMENT.cost + 200_000;
const layout = (x = 30): HomePlacement[] => [
  { id: "cabinet-a", x, y: 40, rotation: 0 },
  { id: "cabinet-b", x: x + 10, y: 60, rotation: 1 },
];

/** Real inventory rows verify that every placement and the revision publish together. */
describeWithDatabase("owned furniture persistence", () => {
  beforeEach(async () => {
    await resetTables(userItemVariant, itemVariant, userItem, item, userData, village);
    const database = await getTestDatabase();
    await database.insert(village).values({ id: homeVillage, name: "Home", sector: 30, kageId: "kage" });
    await insertUsers([
      { userId, username: userId, villageId: homeVillage, sector: 30, status: "AWAKE", money: initialMoney },
      { userId: "other-owner", username: "other-owner", villageId: homeVillage, sector: 30, status: "AWAKE" },
    ]);
    await insertItems([
      { ...FURNITURE_ITEM_DEFAULTS, id: "cabinet", name: "Painted Cabinet", description: "Timber cabinet", image: "/cabinet.webp", itemType: "FURNITURE", furnitureWidth: 28, furnitureGroundAnchor: 92, furnitureIsFloor: false },
      { ...FURNITURE_ITEM_DEFAULTS, id: "rug", name: "Woven Rug", itemType: "FURNITURE", furnitureIsFloor: true },
      { ...FURNITURE_ITEM_DEFAULTS, id: "home-bed", name: "Bed", itemType: "FURNITURE", furnitureAction: "sleep", inShop: false, cost: 0 },
      { id: "material", name: "Material", itemType: "MATERIAL" },
    ]);
    await insertUserItems([
      { id: "cabinet-a", userId, itemId: "cabinet", storedAtHome: true, homeX: 20, homeY: 30 },
      { id: "cabinet-b", userId, itemId: "cabinet", storedAtHome: true, homeX: 70, homeY: 60, homeRotation: 1 },
      { id: "rug-row", userId, itemId: "rug", storedAtHome: true },
      { id: "bed-row", userId, itemId: "home-bed", storedAtHome: true },
      { id: "material-row", userId, itemId: "material", storedAtHome: true },
      { id: "foreign-cabinet", userId: "other-owner", itemId: "cabinet", storedAtHome: true },
    ]);
  });

  const snapshot = async () => {
    const database = await getTestDatabase();
    const [users, inventory] = await Promise.all([
      database.select().from(userData).where(eq(userData.userId, userId)),
      database.select().from(userItem).orderBy(userItem.id),
    ]);
    return { owner: users[0]!, inventory };
  };

  it("returns dynamic content and both owned copies while applying the active cosmetic variant", async () => {
    const database = await getTestDatabase();
    await database.insert(itemVariant).values({
      id: "red-cabinet", itemId: "cabinet", name: "Crimson Cabinet", image: "/crimson-cabinet.webp",
      description: "A cabinet with red lacquer", costType: "MONEY", cost: 0, order: 1,
    });
    await database.update(userItem).set({ activeVariantId: "red-cabinet" }).where(eq(userItem.id, "cabinet-a"));
    const api = await callerFor(homeRouter, userId);
    const home = await api.getUserHome();
    expect(home?.furniture).toHaveLength(4);
    expect(home?.furniture.find(({ id }) => id === "cabinet-a")).toMatchObject({
      itemId: "cabinet", name: "Crimson Cabinet", image: "/crimson-cabinet.webp",
      description: "A cabinet with red lacquer", width: 28, groundAnchor: 92, quantity: 1,
    });
    expect(home?.furniture.find(({ id }) => id === "cabinet-b")?.image).toBe("/cabinet.webp");
    expect(home?.furniture.find(({ id }) => id === "rug-row")?.isFloor).toBe(true);
    expect(home?.furniture.find(({ id }) => id === "bed-row")?.action).toBe("sleep");
    expect(home?.layout).toHaveLength(2);
    expect(home?.furniture.some(({ id }) => id === "foreign-cabinet" || id === "material-row")).toBe(false);
  });

  it("publishes every position and its revision with one mutation statement", async () => {
    const api = await callerFor(homeRouter, userId);
    const queries = await recordQueries(() => api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: layout() }));
    expect(queries.result.success).toBe(true);
    expect(queries.statements.filter((statement) => /^\s*(UPDATE|INSERT|DELETE)\b/i.test(statement))).toHaveLength(1);
    const home = await api.getUserHome();
    expect(home?.layout).toEqual(layout());
    const saved = await snapshot();
    expect(saved.owner.homeFurnitureRevision).toBe(1);
    expect(saved.owner.money).toBe(initialMoney);
    expect(saved.inventory.find(({ id }) => id === "material-row")?.homeX).toBeNull();
    expect(saved.inventory.find(({ id }) => id === "foreign-cabinet")?.homeX).toBeNull();
  });

  it("serializes overlapping layouts without mixing their positions", async () => {
    const api = await callerFor(homeRouter, userId);
    const candidates = [layout(30), layout(60)];
    const results = await Promise.all(candidates.map((placements) => api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements })));
    expect(results.filter(({ success }) => success)).toHaveLength(1);
    const winner = results.findIndex(({ success }) => success);
    expect((await api.getUserHome())?.layout).toEqual(candidates[winner]);
    expect((await snapshot()).owner.homeFurnitureRevision).toBe(1);
  });

  it("rejects a stale revision without changing saved coordinates", async () => {
    const api = await callerFor(homeRouter, userId);
    expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: layout() })).success).toBe(true);
    const before = await snapshot();
    expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: layout(60) })).success).toBe(false);
    expect(await snapshot()).toEqual(before);
  });

  it("allows an empty room and clears coordinates without destroying ownership", async () => {
    const api = await callerFor(homeRouter, userId);
    expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: [] })).success).toBe(true);
    expect((await api.getUserHome())?.layout).toEqual([]);
    const after = await snapshot();
    expect(after.inventory).toHaveLength(6);
    expect(after.inventory.filter(({ userId: owner }) => owner === userId).every(({ homeX, homeY, homeRotation }) => homeX === null && homeY === null && homeRotation === 0)).toBe(true);
  });

  it("saves an empty layout even when the account owns no furniture", async () => {
    const database = await getTestDatabase();
    await database.delete(userItem).where(eq(userItem.userId, userId));
    const api = await callerFor(homeRouter, userId);
    expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: [] })).success).toBe(true);
    expect((await api.getUserHome())?.furniture).toEqual([]);
    expect((await snapshot()).owner.homeFurnitureRevision).toBe(1);
  });

  it.each(["foreign-cabinet", "material-row", "unknown-row"])("rejects unavailable row %s without a partial room update", async (id) => {
    const api = await callerFor(homeRouter, userId);
    const before = await snapshot();
    const result = await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: [...layout(), { id, x: 50, y: 50, rotation: 0 }] });
    expect(result.success).toBe(false);
    expect(await snapshot()).toEqual(before);
  });

  it("rejects duplicate instance IDs before any write", async () => {
    const api = await callerFor(homeRouter, userId);
    const before = await snapshot();
    await expect(api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: [layout()[0]!, layout()[0]!] })).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    { isInAuction: true }, { craftingFinishedAt: new Date(Date.now() + 60_000) }, { quantity: 0 },
  ])("excludes inaccessible ownership %j from reads and saves", async (patch) => {
    const database = await getTestDatabase();
    await database.update(userItem).set(patch).where(eq(userItem.id, "cabinet-a"));
    const api = await callerFor(homeRouter, userId);
    const before = await snapshot();
    expect((await api.getUserHome())?.furniture.some(({ id }) => id === "cabinet-a")).toBe(false);
    expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: layout() })).success).toBe(false);
    expect(await snapshot()).toEqual(before);
  });

  it("excludes hidden furniture and accepts completed crafts", async () => {
    const database = await getTestDatabase();
    await Promise.all([
      database.update(item).set({ hidden: true }).where(eq(item.id, "rug")),
      database.update(userItem).set({ craftingFinishedAt: new Date(Date.now() - 60_000), storedAtHome: false }).where(eq(userItem.id, "cabinet-a")),
    ]);
    const api = await callerFor(homeRouter, userId);
    const home = await api.getUserHome();
    expect(home?.furniture.some(({ id }) => id === "rug-row")).toBe(false);
    expect(home?.furniture.some(({ id }) => id === "cabinet-a")).toBe(true);
    expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: layout() })).success).toBe(true);
  });

  it("keeps the same owned-row arrangement after upgrading the residence", async () => {
    const api = await callerFor(homeRouter, userId);
    expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: layout() })).success).toBe(true);
    expect((await api.upgradeHome({ homeType: "STUDIO_APARTMENT" })).success).toBe(true);
    const upgraded = await api.getUserHome();
    expect(upgraded?.homeType).toBe("STUDIO_APARTMENT");
    expect(upgraded?.layout).toEqual(layout());
  });

  it.each([
    { isBanned: true }, { sector: 31 }, { villageId: null },
    { status: "BATTLE" as const }, { isOutlaw: true, sector: 31 },
  ])("rejects unavailable account access %j without writing", async (patch) => {
    const database = await getTestDatabase();
    await database.update(userData).set(patch).where(eq(userData.userId, userId));
    const before = await snapshot();
    const api = await callerFor(homeRouter, userId);
    expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: layout() })).success).toBe(false);
    expect(await snapshot()).toEqual(before);
  });

  it.each([{ homeType: "STUDIO_APARTMENT" as const }, { isBanned: true }, { homeFurnitureRevision: 1 }])("rechecks account changes immediately before publishing %j", async (patch) => {
    const database = await getTestDatabase();
    const client = beforeStatements(database, userData, [async () => database.update(userData).set(patch).where(eq(userData.userId, userId))]);
    const api = callerForDatabase(homeRouter, userId, client);
    expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: layout() })).success).toBe(false);
    const home = await callerFor(homeRouter, userId);
    expect((await home.getUserHome())?.layout).toEqual([
      { id: "cabinet-a", x: 20, y: 30, rotation: 0 },
      { id: "cabinet-b", x: 70, y: 60, rotation: 1 },
    ]);
  });
});
