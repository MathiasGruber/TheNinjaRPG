import { beforeEach, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { HOME_FURNITURE_ESSENTIALS, HOME_FURNITURE_STORAGE_CAPACITY, HomeTypeDetails } from "@/drizzle/constants";
import { item, itemVariant, userData, userItem, userItemVariant, village } from "@/drizzle/schema";
import { homeRouter } from "@/server/api/routers/home";
import { clampHomeFurniturePlacement, homeLayoutEssentialsError, homeLayoutPlacementError } from "@/libs/home";
import { DEFAULT_FURNITURE_DATA, FURNITURE_ITEM_DEFAULTS } from "@/validators/itemFurniture";
import type { HomePlacement } from "@/validators/home";
import { insertItems, insertUserItems, insertUsers } from "../../setup/factories";
import { beforeStatements } from "../../setup/statements";
import { callerFor, callerForDatabase, describeWithDatabase, getTestDatabase, recordQueries, resetTables } from "../../setup/testDatabase";

const userId = "home-owner";
const homeVillage = "home-village";
const initialMoney = HomeTypeDetails.STUDIO_APARTMENT.cost + 200_000;
const essentialLayout: HomePlacement[] = [
  { id: "bed-row", x: 22, y: 15.15, rotation: 0 },
  { id: "storage-row", x: 75, y: 15.15, rotation: 0 },
  { id: "kitchen-row", x: 20, y: 60, rotation: 0 },
];
const layout = (x = 30): HomePlacement[] => [
  { id: "cabinet-a", x, y: 40, rotation: 0 },
  { id: "cabinet-b", x: x + 10, y: 60, rotation: 1 },
  ...essentialLayout,
];

const expectLayout = (actual: HomePlacement[] | undefined, expected: HomePlacement[]) => {
  const sort = (placements: HomePlacement[]) => [...placements].sort((a, b) => a.id.localeCompare(b.id));
  expect(actual && sort(actual)).toEqual(sort(expected));
};

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
      { ...FURNITURE_ITEM_DEFAULTS, id: "cabinet", name: "Painted Cabinet", description: "Timber cabinet", image: "/cabinet.webp", itemType: "FURNITURE", furnitureData: { ...DEFAULT_FURNITURE_DATA, width: 28, groundAnchor: 92, views: { "90": { image: "/cabinet-90.webp" }, "180": { image: "/cabinet-180.webp", width: 18 }, "270": { image: "/cabinet-270.webp", groundAnchor: 85 } } } },
      { ...FURNITURE_ITEM_DEFAULTS, id: "rug", name: "Woven Rug", itemType: "FURNITURE", furnitureData: { ...DEFAULT_FURNITURE_DATA, isFloor: true } },
      { ...FURNITURE_ITEM_DEFAULTS, id: "home-bed", name: "Bed", itemType: "FURNITURE", furnitureData: { ...DEFAULT_FURNITURE_DATA, action: "sleep", width: 6 }, inShop: false, cost: 0 },
      { ...FURNITURE_ITEM_DEFAULTS, id: "home-storage", name: "Storage", itemType: "FURNITURE", furnitureData: { ...DEFAULT_FURNITURE_DATA, action: "storage", width: 6 } },
      { ...FURNITURE_ITEM_DEFAULTS, id: "home-cooking", name: "Cooking", itemType: "FURNITURE", furnitureData: { ...DEFAULT_FURNITURE_DATA, action: "kitchen", width: 6 } },
      ...HOME_FURNITURE_ESSENTIALS.map(({ itemId, action, name }) => ({ ...FURNITURE_ITEM_DEFAULTS, id: itemId, name: `Basic ${name}`, itemType: "FURNITURE" as const, furnitureData: { ...DEFAULT_FURNITURE_DATA, action, width: 6 }, inShop: false, canBeTraded: false, cost: 0 })),
      { id: "material", name: "Material", itemType: "MATERIAL" },
    ]);
    await insertUserItems([
      { id: "cabinet-a", userId, itemId: "cabinet", storedAtHome: true, homeX: 25, homeY: 30 },
      { id: "cabinet-b", userId, itemId: "cabinet", storedAtHome: true, homeX: 70, homeY: 60, homeRotation: 1 },
      { id: "rug-row", userId, itemId: "rug", storedAtHome: true },
      { id: "bed-row", userId, itemId: "home-bed", storedAtHome: true, homeX: 22, homeY: 15.15 },
      { id: "storage-row", userId, itemId: "home-storage", storedAtHome: true, homeX: 75, homeY: 15.15 },
      { id: "kitchen-row", userId, itemId: "home-cooking", storedAtHome: true, homeX: 20, homeY: 60 },
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

  it("publishes separate rooms and finishes together, then stores removed-room furniture permanently on downgrade", async () => {
    const db = await getTestDatabase();
    await db.update(userData).set({ homeType: "TOWN_HOUSE" }).where(eq(userData.userId, userId));
    const api = await callerFor(homeRouter, userId);
    const placements: HomePlacement[] = [...essentialLayout, { id: "cabinet-a", x: 50, y: 50, rotation: 0, room: "room-1" }, { id: "cabinet-b", x: 50, y: 50, rotation: 0 }];
    const styles = [{ room: "room-1", paint: "sage", floor: "slate" }] as const;
    expect((await api.saveFurnitureLayout({ homeType: "TOWN_HOUSE", revision: 0, placements, styles: [...styles] })).success).toBe(true);
    const home = await api.getUserHome();
    expectLayout(home?.layout, placements);
    expect(home?.styles).toEqual([...styles]);
    expect((await api.upgradeHome({ homeType: "TWO_BED_HOUSE" })).success).toBe(true);
    const stored = (await snapshot()).inventory.find(({ id }) => id === "cabinet-a");
    expect(stored).toMatchObject({ quantity: 1, homeX: null, homeY: null });
    const downgraded = await api.getUserHome();
    expect(downgraded?.styles).toEqual([]);
    expect(downgraded?.layout.some(({ id }) => id === "cabinet-a")).toBe(false);
    await db.update(userData).set({ money: HomeTypeDetails.TOWN_HOUSE.cost }).where(eq(userData.userId, userId));
    expect((await api.upgradeHome({ homeType: "TOWN_HOUSE" })).success).toBe(true);
    expect((await api.getUserHome())?.layout.some(({ id }) => id === "cabinet-a")).toBe(false);
  });

  it("rejects removed rooms and duplicate finishes before publishing", async () => {
    const api = await callerFor(homeRouter, userId);
    const before = await snapshot();
    expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: [...essentialLayout, { id: "cabinet-a", x: 50, y: 50, rotation: 0, room: "room-1" }] })).success).toBe(false);
    expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: essentialLayout, styles: [{ room: "main", paint: "sage", floor: "oak" }, { room: "main", paint: "rose", floor: "slate" }] })).success).toBe(false);
    expect(await snapshot()).toEqual(before);
  });

  it("enforces private, invited, revoked and public visits without exposing unplaced furniture or mutating the owner", async () => {
    const api = await callerFor(homeRouter, userId);
    const visitor = await callerFor(homeRouter, "other-owner");
    const before = await snapshot();
    expect((await visitor.getVisitedHome({ userId })).home).toBeNull();
    expect(await snapshot()).toEqual(before);
    expect((await api.setHomeSharing({ revision: 0, isPublic: false, inviteUsername: "other-owner" })).success).toBe(true);
    const visit = await visitor.getVisitedHome({ userId });
    expect(visit.success).toBe(true);
    expect(visit.home?.furniture.some(({ id }) => id === "rug-row")).toBe(false);
    expect(visit.home && Object.keys(visit.home).sort()).toEqual(["furniture", "homeType", "layout", "styles", "username"]);
    expect((await api.setHomeSharing({ revision: 1, isPublic: false, revokeUserId: "other-owner" })).success).toBe(true);
    expect((await visitor.getVisitedHome({ userId })).home).toBeNull();
    expect((await api.setHomeSharing({ revision: 2, isPublic: true })).success).toBe(true);
    expect((await visitor.getVisitedHome({ userId })).success).toBe(true);
    expect((await api.setHomeSharing({ revision: 2, isPublic: false })).success).toBe(false);
    expect((await visitor.getVisitedHome({ userId })).success).toBe(true);
  });

  it("guards a downgrade against a concurrent layout save before refunding or clearing rooms", async () => {
    const db = await getTestDatabase();
    await db.update(userData).set({ homeType: "TOWN_HOUSE" }).where(eq(userData.userId, userId));
    const regular = await callerFor(homeRouter, userId);
    const client = new Proxy(db, { get(target, property, receiver) {
      if (property === "transaction") return async (...args: Parameters<typeof db.transaction>) => {
        expect((await regular.saveFurnitureLayout({ homeType: "TOWN_HOUSE", revision: 0, placements: essentialLayout })).success).toBe(true);
        return target.transaction(...args);
      };
      return Reflect.get(target, property, receiver);
    } });
    const api = callerForDatabase(homeRouter, userId, client);
    expect((await api.upgradeHome({ homeType: "NONE" })).success).toBe(false);
    const after = await snapshot();
    expect(after.owner.homeType).toBe("TOWN_HOUSE");
    expect(after.owner.money).toBe(initialMoney);
    expect(after.owner.homeFurnitureRevision).toBe(1);
  });

  it("rejects a layout after an inventory snapshot claim without regressing its timestamp", async () => {
    const db = await getTestDatabase();
    const next = new Date(Date.now() + 60_000);
    const client = beforeStatements(db, userData, [async () => db.update(userData).set({ updatedAt: next }).where(eq(userData.userId, userId))]);
    const api = callerForDatabase(homeRouter, userId, client);
    expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: layout() })).success).toBe(false);
    const after = await snapshot();
    expect(after.owner.updatedAt).toEqual(next);
    expect(after.owner.homeFurnitureRevision).toBe(0);
  });

  it.each([{}, { isInAuction: true }, { craftingFinishedAt: new Date(Date.now() + 60_000) }])("counts stored unavailable furniture against capacity without storing a carried piece %j", async (unavailable) => {
    const db = await getTestDatabase();
    await db.update(userData).set({ homeType: "TOWN_HOUSE" }).where(eq(userData.userId, userId));
    await insertUserItems(Array.from({ length: HOME_FURNITURE_STORAGE_CAPACITY - 6 }, (_, i) => ({ id: `stored-${i}`, userId, itemId: "rug", storedAtHome: true, ...(i === 0 ? unavailable : {}) })));
    await insertUserItems([{ id: "carried-extra", userId, itemId: "rug", storedAtHome: false, homeRoom: "room-1", homeX: 50, homeY: 50 }]);
    const before = await snapshot();
    const api = await callerFor(homeRouter, userId);
    const result = await api.saveFurnitureLayout({ homeType: "TOWN_HOUSE", revision: 0, placements: [...essentialLayout, { id: "carried-extra", x: 50, y: 50, rotation: 0, room: "room-1" }] });
    expect(result.success).toBe(false);
    expect(result.message).toContain("storage is full");
    expect((await api.upgradeHome({ homeType: "NONE" })).success).toBe(false);
    expect(await snapshot()).toEqual(before);
  });

  it("grants and places three free basics once for a legacy empty inventory", async () => {
    const database = await getTestDatabase();
    await database.delete(userItem).where(eq(userItem.userId, userId));
    const api = await callerFor(homeRouter, userId);
    const home = await api.getUserHome();
    expect(home?.furniture.map(({ itemId }) => itemId).sort()).toEqual(HOME_FURNITURE_ESSENTIALS.map(({ itemId }) => itemId).sort());
    expect(home?.layout).toHaveLength(3);
    expect(homeLayoutEssentialsError(home!.layout, home!.furniture)).toBeNull();
    expect(homeLayoutPlacementError(home!.layout, home!.furniture, "NONE")).toBeNull();
    expect(home?.furnitureRevision).toBe(1);
    const before = await snapshot();
    const replay = await recordQueries(() => api.getUserHome());
    expect(replay.result).toEqual(home);
    expect(replay.statements).toHaveLength(1);
    expect(replay.statements[0]).toMatch(/^\s*select\b/i);
    expect(await snapshot()).toEqual(before);
    expect(before.owner.money).toBe(initialMoney);
    expect(before.inventory.filter(({ userId: owner }) => owner === userId).every(({ quantity, storedAtHome }) => quantity === 1 && storedAtHome)).toBe(true);
  });

  it("places a missing action using its available owned piece without querying or granting basics", async () => {
    const database = await getTestDatabase();
    await database.update(userItem).set({ homeX: null, homeY: null }).where(eq(userItem.id, "kitchen-row"));
    const api = await callerFor(homeRouter, userId);
    const result = await recordQueries(() => api.getUserHome());
    expect(result.result?.layout.some(({ id }) => id === "kitchen-row")).toBe(true);
    expect(result.result?.furniture).toHaveLength(6);
    expect(result.statements.filter((statement) => /^\s*select\b/i.test(statement))).toHaveLength(2);
    expect(result.statements.some((statement) => /^\s*insert\b/i.test(statement))).toBe(false);
    const original: HomePlacement[] = [
      { id: "cabinet-a", x: 25, y: 30, rotation: 0 },
      { id: "cabinet-b", x: 70, y: 60, rotation: 1 },
      ...essentialLayout.slice(0, 2),
    ];
    for (const placement of original) expect(result.result?.layout).toContainEqual(placement);
    expect((await snapshot()).owner.homeFurnitureRevision).toBe(1);
  });

  it.each([
    { isInAuction: true }, { craftingFinishedAt: new Date(Date.now() + 60_000) }, { quantity: 0 },
  ])("supplies a basic when the only owned action is unavailable %j", async (patch) => {
    const database = await getTestDatabase();
    await database.update(userItem).set(patch).where(eq(userItem.id, "kitchen-row"));
    const api = await callerFor(homeRouter, userId);
    const home = await api.getUserHome();
    expect(home?.furniture.some(({ id }) => id === "kitchen-row")).toBe(false);
    const basic = home?.furniture.find(({ itemId }) => itemId === "home-kitchen-utensils");
    expect(basic).toBeDefined();
    expect(home?.layout.some(({ id }) => id === basic!.id)).toBe(true);
    expect(homeLayoutEssentialsError(home!.layout, home!.furniture)).toBeNull();
    expect((await snapshot()).inventory.filter(({ itemId }) => itemId === "home-kitchen-utensils")).toHaveLength(1);
  });

  it("replaces an owned essential whose changed artwork can no longer fit, preserving its inventory", async () => {
    const database = await getTestDatabase();
    await database.update(item).set({ furnitureData: {
      ...DEFAULT_FURNITURE_DATA, action: "kitchen", width: 40,
      geometry: { aspectRatio: 0.05, visibleBounds: { x: 0, y: 0, width: 100, height: 100 }, footprint: { x: 0, y: 90, width: 100, height: 10 } },
    } }).where(eq(item.id, "home-cooking"));
    const api = await callerFor(homeRouter, userId);
    const home = await api.getUserHome();
    expect(homeLayoutEssentialsError(home!.layout, home!.furniture)).toBeNull();
    expect(homeLayoutPlacementError(home!.layout, home!.furniture, "NONE")).toBeNull();
    expect(home?.furniture.some(({ itemId }) => itemId === "home-kitchen-utensils")).toBe(true);
    expect((await snapshot()).inventory.find(({ id }) => id === "kitchen-row")).toMatchObject({ quantity: 1, homeX: null, homeY: null });
  });

  it("keeps concurrent first views idempotent with one coherent revision", async () => {
    const database = await getTestDatabase();
    await database.delete(userItem).where(eq(userItem.userId, userId));
    const api = await callerFor(homeRouter, userId);
    const views = await Promise.all([api.getUserHome(), api.getUserHome()]);
    expect(views[0]).toEqual(views[1]);
    expect(views[0]?.furnitureRevision).toBe(1);
    expect((await snapshot()).inventory.filter(({ userId: owner }) => owner === userId)).toHaveLength(3);
    expect(homeLayoutEssentialsError(views[0]!.layout, views[0]!.furniture)).toBeNull();
  });

  it.each([
    { isInAuction: true }, { craftingFinishedAt: new Date(Date.now() + 60_000) }, { quantity: 0 },
  ])("does not revive an unavailable basic or publish phantom essential placements %j", async (patch) => {
    const database = await getTestDatabase();
    await database.delete(userItem).where(eq(userItem.userId, userId));
    const api = await callerFor(homeRouter, userId);
    const initialized = await api.getUserHome();
    const basic = initialized!.furniture.find(({ action }) => action === "kitchen")!;
    await database.update(userItem).set(patch).where(eq(userItem.id, basic.id));
    const before = await snapshot();
    const home = await api.getUserHome();
    expect(home?.furniture.some(({ id }) => id === basic.id)).toBe(false);
    expect(home?.layout.some(({ id }) => id === basic.id)).toBe(false);
    expect(home?.furnitureRevision).toBe(1);
    expect(await snapshot()).toEqual(before);
    expect(await api.getUserHome()).toEqual(home);
    expect(await snapshot()).toEqual(before);
  });

  it("does not let first-view placement overwrite a concurrent valid save", async () => {
    const database = await getTestDatabase();
    await database.update(userItem).set({ homeX: null, homeY: null }).where(eq(userItem.id, "kitchen-row"));
    const regularApi = await callerFor(homeRouter, userId);
    const saved = layout(60);
    const client = beforeStatements(database, userData, [async () => {
      expect((await regularApi.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: saved })).success).toBe(true);
    }]);
    const api = callerForDatabase(homeRouter, userId, client);
    const home = await api.getUserHome();
    expectLayout(home?.layout, saved);
    expect(home?.furnitureRevision).toBe(1);
  });

  it.each([
    { isBanned: true }, { sector: 31 }, { villageId: null }, { status: "BATTLE" as const },
  ])("does not grant or place basics when first-view access is denied %j", async (patch) => {
    const database = await getTestDatabase();
    await database.delete(userItem).where(eq(userItem.userId, userId));
    await database.update(userData).set(patch).where(eq(userData.userId, userId));
    const before = await snapshot();
    const api = await callerFor(homeRouter, userId);
    const read = await recordQueries(() => api.getUserHome());
    expect(read.result?.furniture).toEqual([]);
    expect(read.statements).toHaveLength(1);
    expect(await snapshot()).toEqual(before);
  });

  it("rechecks first-view access before inserting basics", async () => {
    const database = await getTestDatabase();
    await database.delete(userItem).where(eq(userItem.userId, userId));
    const client = beforeStatements(database, userItem, [async () => {
      await database.update(userData).set({ status: "BATTLE" }).where(eq(userData.userId, userId));
    }]);
    const api = callerForDatabase(homeRouter, userId, client);
    expect((await api.getUserHome())?.furniture).toEqual([]);
    const after = await snapshot();
    expect(after.owner.homeFurnitureRevision).toBe(0);
    expect(after.inventory.filter(({ userId: owner }) => owner === userId)).toHaveLength(0);
  });

  it("can initialize an asleep resident without waking the character", async () => {
    const database = await getTestDatabase();
    await database.update(userItem).set({ homeX: null, homeY: null }).where(eq(userItem.userId, userId));
    await database.update(userData).set({ status: "ASLEEP" }).where(eq(userData.userId, userId));
    const api = await callerFor(homeRouter, userId);
    const home = await api.getUserHome();
    expect(homeLayoutEssentialsError(home!.layout, home!.furniture)).toBeNull();
    expect((await snapshot()).owner.status).toBe("ASLEEP");
  });

  it("returns dynamic content and both owned copies while applying the active cosmetic variant", async () => {
    const database = await getTestDatabase();
    await database.insert(itemVariant).values({
      id: "red-cabinet", itemId: "cabinet", name: "Crimson Cabinet", image: "/crimson-cabinet.webp",
      description: "A cabinet with red lacquer", costType: "MONEY", cost: 0, order: 1,
    });
    await database.update(userItem).set({ activeVariantId: "red-cabinet" }).where(eq(userItem.id, "cabinet-a"));
    const api = await callerFor(homeRouter, userId);
    const home = await api.getUserHome();
    expect(home?.furniture).toHaveLength(6);
    expect(home?.furniture.find(({ id }) => id === "cabinet-a")).toMatchObject({
      itemId: "cabinet", name: "Crimson Cabinet", image: "/crimson-cabinet.webp",
      width: 28, groundAnchor: 92, quantity: 1, views: {},
    });
    expect(home?.furniture.find(({ id }) => id === "cabinet-b")?.image).toBe("/cabinet.webp");
    expect(home?.furniture.find(({ id }) => id === "rug-row")?.isFloor).toBe(true);
    expect(home?.furniture.find(({ id }) => id === "bed-row")?.action).toBe("sleep");
    expect(home?.layout).toHaveLength(5);
    expect(home?.furniture.some(({ id }) => id === "foreign-cabinet" || id === "material-row")).toBe(false);
  });

  it("publishes every position and its revision with one mutation statement", async () => {
    const api = await callerFor(homeRouter, userId);
    const queries = await recordQueries(() => api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: layout() }));
    expect(queries.result.success).toBe(true);
    expect(queries.statements.filter((statement) => /^\s*(UPDATE|INSERT|DELETE)\b/i.test(statement))).toHaveLength(1);
    const home = await api.getUserHome();
    expectLayout(home?.layout, layout());
    const saved = await snapshot();
    expect(saved.owner.homeFurnitureRevision).toBe(1);
    expect(saved.owner.money).toBe(initialMoney);
    expect(saved.inventory.find(({ id }) => id === "material-row")?.homeX).toBeNull();
    expect(saved.inventory.find(({ id }) => id === "foreign-cabinet")?.homeX).toBeNull();
  });

  it("persists all four quarter turns while rejecting directions without published art", async () => {
    const api = await callerFor(homeRouter, userId);
    for (const rotation of [0, 1, 2, 3] as const) {
      const placements = [{ id: "cabinet-a", x: 30, y: 40, rotation }, ...essentialLayout];
      expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: rotation, placements })).success).toBe(true);
      expectLayout((await api.getUserHome())?.layout, placements);
    }
    const before = await snapshot();
    const result = await api.saveFurnitureLayout({ homeType: "NONE", revision: 4, placements: [{ id: "rug-row", x: 30, y: 40, rotation: 1 }] });
    expect(result.success).toBe(false);
    expect(result.message).toContain("orientation");
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    [{ id: "cabinet-a", x: 0, y: 40, rotation: 0 }],
    [{ id: "cabinet-a", x: 50, y: 80, rotation: 0 }],
    [{ id: "cabinet-a", x: 50, y: 100, rotation: 0 }],
    [{ id: "cabinet-a", x: 50, y: 40, rotation: 0 }, { id: "cabinet-b", x: 50, y: 40, rotation: 0 }],
  ].map((placements) => ({ placements: placements as HomePlacement[] })))("rejects walls, curtains, outdoor furniture and overlapping footprints before writing %j", async ({ placements }) => {
    const api = await callerFor(homeRouter, userId);
    const before = await snapshot();
    const result = await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/floor|overlaps/);
    expect(await snapshot()).toEqual(before);
  });

  it("accepts a rug beneath furniture without allowing the solid pieces to overlap", async () => {
    const api = await callerFor(homeRouter, userId);
    expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: [
      { id: "cabinet-a", x: 50, y: 40, rotation: 0 },
      { id: "rug-row", x: 50, y: 40, rotation: 0 },
      ...essentialLayout,
    ] })).success).toBe(true);
  });

  it("requires the entire farm artwork to fit in outdoor ground using the joined content metadata", async () => {
    const database = await getTestDatabase();
    const geometry = {
      aspectRatio: 2,
      visibleBounds: { x: 10, y: 10, width: 80, height: 80 },
      footprint: { x: 20, y: 75, width: 60, height: 15 },
    };
    await database.update(item).set({ furnitureData: { ...DEFAULT_FURNITURE_DATA, action: "farm", width: 12, geometry } }).where(eq(item.id, "rug"));
    const api = await callerFor(homeRouter, userId);
    const home = await api.getUserHome();
    const piece = home!.furniture.find(({ id }) => id === "rug-row")!;
    expect(piece.geometry).toEqual(geometry);
    const before = await snapshot();
    const rejected = await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: [{ id: piece.id, x: 50, y: 40, rotation: 0 }] });
    expect(rejected.success).toBe(false);
    expect(rejected.message).toContain("outside");
    expect(await snapshot()).toEqual(before);
    const outdoor = clampHomeFurniturePlacement({ id: piece.id, x: 50, y: 100, rotation: 0 }, piece, "NONE");
    expect(outdoor).not.toBeNull();
    expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: [outdoor!, ...essentialLayout] })).success).toBe(true);
  });

  it("validates saved directions against the selected skin instead of mixing base artwork", async () => {
    const database = await getTestDatabase();
    await database.insert(itemVariant).values({
      id: "red-cabinet", itemId: "cabinet", name: "Crimson Cabinet", image: "/crimson-cabinet.webp",
      costType: "MONEY", order: 1, furnitureData: { views: { "180": { image: "/red-180.webp", width: 18 } } },
    });
    await database.update(userItem).set({ activeVariantId: "red-cabinet" }).where(eq(userItem.id, "cabinet-a"));
    const api = await callerFor(homeRouter, userId);
    const piece = (await api.getUserHome())?.furniture.find(({ id }) => id === "cabinet-a");
    expect(piece?.views).toEqual({ "180": { image: "/red-180.webp", width: 18 } });
    const before = await snapshot();
    const unsupported = await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: [{ id: "cabinet-a", x: 30, y: 40, rotation: 1 }] });
    expect(unsupported.success).toBe(false);
    expect(await snapshot()).toEqual(before);
    expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: [{ id: "cabinet-a", x: 30, y: 40, rotation: 2 }, ...essentialLayout] })).success).toBe(true);
  });

  it("serializes overlapping layouts without mixing their positions", async () => {
    const api = await callerFor(homeRouter, userId);
    const candidates = [layout(30), layout(60)];
    const results = await Promise.all(candidates.map((placements) => api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements })));
    expect(results.filter(({ success }) => success)).toHaveLength(1);
    const winner = results.findIndex(({ success }) => success);
    expectLayout((await api.getUserHome())?.layout, candidates[winner]!);
    expect((await snapshot()).owner.homeFurnitureRevision).toBe(1);
  });

  it("rejects a stale revision without changing saved coordinates", async () => {
    const api = await callerFor(homeRouter, userId);
    expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: layout() })).success).toBe(true);
    const before = await snapshot();
    expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: layout(60) })).success).toBe(false);
    expect(await snapshot()).toEqual(before);
  });

  it.each(["sleep", "storage", "kitchen"] as const)("rejects layouts missing %s without changing inventory or coordinates", async (action) => {
    const api = await callerFor(homeRouter, userId);
    const rowId = { sleep: "bed-row", storage: "storage-row", kitchen: "kitchen-row" }[action];
    const before = await snapshot();
    const result = await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: layout().filter(({ id }) => id !== rowId) });
    expect(result.success).toBe(false);
    expect(result.message).toContain(HOME_FURNITURE_ESSENTIALS.find((essential) => essential.action === action)!.name);
    expect(await snapshot()).toEqual(before);
  });

  it("rejects an empty layout even when the account owns no furniture", async () => {
    const database = await getTestDatabase();
    await database.delete(userItem).where(eq(userItem.userId, userId));
    const api = await callerFor(homeRouter, userId);
    const before = await snapshot();
    const result = await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: [] });
    expect(result.success).toBe(false);
    expect(result.message).toContain("sleeping area, storage, kitchen");
    expect(await snapshot()).toEqual(before);
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
    expectLayout(upgraded?.layout, layout());
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
    expectLayout((await home.getUserHome())?.layout, [
      { id: "cabinet-a", x: 25, y: 30, rotation: 0 },
      { id: "cabinet-b", x: 70, y: 60, rotation: 1 },
      ...essentialLayout,
    ]);
  });
});
