import { beforeEach, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { HomeFurnitureDetails } from "@/drizzle/constants";
import { userData, village } from "@/drizzle/schema";
import { getDefaultHomeLayout } from "@/libs/home";
import { homeRouter } from "@/server/api/routers/home";
import { insertUsers } from "../../setup/factories";
import { beforeStatements } from "../../setup/statements";
import { callerFor, callerForDatabase, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

const userId = "home-owner";
const initialMoney = 200000;
const savedLayout = () => getDefaultHomeLayout().map((placement) => ({ ...placement, x: placement.x + 2 }));

/** Real rows verify that home revision checks protect paid ownership and layouts in the same update. */
describeWithDatabase("home furniture economy and persistence", () => {
  beforeEach(async () => {
    await resetTables(userData, village);
    const database = await getTestDatabase();
    await database.insert(village).values({ id: "home-village", name: "Home", sector: 30, kageId: "kage" });
    await insertUsers([{ userId, username: userId, villageId: "home-village", sector: 30, status: "AWAKE", money: initialMoney }]);
  });

  const readOwner = async () => {
    const database = await getTestDatabase();
    return (await database.select().from(userData).where(eq(userData.userId, userId)))[0]!;
  };

  it("charges once and retains a decoration in storage until the player places it", async () => {
    const api = await callerFor(homeRouter, userId);
    expect((await api.purchaseFurniture({ furnitureId: "rug", revision: 0 })).success).toBe(true);
    const user = await readOwner();
    expect(user.homeFurnitureRevision).toBe(1);
    expect(user.money).toBe(initialMoney - HomeFurnitureDetails.rug.price);
    expect(user.homeFurniture).toEqual({ owned: ["rug"], layouts: {} });
    expect((await api.purchaseFurniture({ furnitureId: "rug", revision: 1 })).success).toBe(false);
    expect((await readOwner()).money).toBe(user.money);
  });

  it("publishes one purchase when duplicate requests overlap", async () => {
    const api = await callerFor(homeRouter, userId);
    const results = await Promise.all([
      api.purchaseFurniture({ furnitureId: "sofa", revision: 0 }),
      api.purchaseFurniture({ furnitureId: "sofa", revision: 0 }),
    ]);
    expect(results.filter(({ success }) => success)).toHaveLength(1);
    const user = await readOwner();
    expect(user.money).toBe(initialMoney - HomeFurnitureDetails.sofa.price);
    expect(user.homeFurniture.owned).toEqual(["sofa"]);
    expect(user.homeFurnitureRevision).toBe(1);
  });

  it("keeps purchases and layout saves from overwriting each other", async () => {
    const api = await callerFor(homeRouter, userId);
    const results = await Promise.all([
      api.purchaseFurniture({ furnitureId: "rug", revision: 0 }),
      api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: savedLayout() }),
    ]);
    expect(results.filter(({ success }) => success)).toHaveLength(1);
    const user = await readOwner();
    const purchased = results[0]!.success;
    expect(user.homeFurniture.owned).toEqual(purchased ? ["rug"] : []);
    expect(user.money).toBe(initialMoney - (purchased ? HomeFurnitureDetails.rug.price : 0));
    expect(user.homeFurniture.layouts.NONE).toEqual(purchased ? undefined : savedLayout());
  });

  it("retains ownership and every tier layout while storing decorations", async () => {
    const database = await getTestDatabase();
    const palaceLayout = getDefaultHomeLayout();
    await database.update(userData).set({ homeFurniture: { owned: ["rug"], layouts: { PALACE: palaceLayout } } }).where(eq(userData.userId, userId));
    const api = await callerFor(homeRouter, userId);
    expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: savedLayout() })).success).toBe(true);
    const user = await readOwner();
    expect(user.homeFurniture).toEqual({ owned: ["rug"], layouts: { PALACE: palaceLayout, NONE: savedLayout() } });
    expect(user.money).toBe(initialMoney);
    expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: getDefaultHomeLayout() })).success).toBe(false);
    expect((await readOwner()).homeFurniture.layouts.NONE).toEqual(savedLayout());
  });

  it("rejects unpurchased furniture without saving any part of the layout", async () => {
    const api = await callerFor(homeRouter, userId);
    const result = await api.saveFurnitureLayout({
      homeType: "NONE", revision: 0,
      placements: [...getDefaultHomeLayout(), { id: "pond", x: 50, y: 50, rotation: 0 }],
    });
    expect(result.success).toBe(false);
    expect((await readOwner()).homeFurniture).toEqual({ owned: [], layouts: {} });
  });

  it.each([
    { isBanned: true },
    { sector: 31 },
    { villageId: null },
    { status: "BATTLE" as const },
    { isOutlaw: true, sector: 31 },
  ])("rejects furniture changes when account access is unavailable %j", async (patch) => {
    const database = await getTestDatabase();
    await database.update(userData).set(patch).where(eq(userData.userId, userId));
    const api = await callerFor(homeRouter, userId);
    expect((await api.purchaseFurniture({ furnitureId: "rug", revision: 0 })).success).toBe(false);
    expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: savedLayout() })).success).toBe(false);
    const user = await readOwner();
    expect(user.money).toBe(initialMoney);
    expect(user.homeFurnitureRevision).toBe(0);
  });

  it("rechecks a balance spent after the purchase snapshot", async () => {
    const database = await getTestDatabase();
    const client = beforeStatements(database, userData, [async () => database.update(userData).set({ money: 0 }).where(eq(userData.userId, userId))]);
    const api = callerForDatabase(homeRouter, userId, client);
    expect((await api.purchaseFurniture({ furnitureId: "rug", revision: 0 })).success).toBe(false);
    const user = await readOwner();
    expect(user.money).toBe(0);
    expect(user.homeFurniture.owned).toEqual([]);
  });

  it("does not publish a layout after a concurrent home upgrade", async () => {
    const database = await getTestDatabase();
    const client = beforeStatements(database, userData, [async () => database.update(userData).set({ homeType: "STUDIO_APARTMENT" }).where(eq(userData.userId, userId))]);
    const api = callerForDatabase(homeRouter, userId, client);
    expect((await api.saveFurnitureLayout({ homeType: "NONE", revision: 0, placements: savedLayout() })).success).toBe(false);
    expect((await readOwner()).homeFurniture.layouts).toEqual({});
  });

  it("rechecks a ban applied after the purchase snapshot", async () => {
    const database = await getTestDatabase();
    const client = beforeStatements(database, userData, [async () => database.update(userData).set({ isBanned: true }).where(eq(userData.userId, userId))]);
    const api = callerForDatabase(homeRouter, userId, client);
    expect((await api.purchaseFurniture({ furnitureId: "rug", revision: 0 })).success).toBe(false);
    expect((await readOwner()).money).toBe(initialMoney);
  });
});
