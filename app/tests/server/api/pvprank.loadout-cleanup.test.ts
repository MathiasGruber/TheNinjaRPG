import { beforeEach, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import {
  item,
  jutsu,
  rankedLoadout,
  rankedPvpQueue,
  rankedSeason,
  userData,
} from "@/drizzle/schema";
import { pvpRankRouter } from "@/server/api/routers/pvprank";
import { cleanRankedProhibitedSelections } from "@/server/utils/ranked";
import { insertItems, insertUsers } from "../../setup/factories";
import {
  callerFor,
  describeWithDatabase,
  getTestDatabase,
  resetTables,
} from "../../setup/testDatabase";

const USER = "ranked-cleanup-user";
const loadout = (jutsuIds: string[], weaponIds: string[] = []) => ({
  jutsuIds,
  weaponIds,
  consumableIds: [],
  favoriteJutsuIds: jutsuIds,
  favoriteWeaponIds: weaponIds,
  favoriteConsumableIds: [],
});

describeWithDatabase("ranked prohibited loadout cleanup", () => {
  beforeEach(async () => {
    await resetTables(
      rankedPvpQueue,
      rankedLoadout,
      rankedSeason,
      item,
      jutsu,
      userData,
    );
    await insertUsers([
      { userId: USER, username: USER, rank: "JONIN", status: "AWAKE", rankedLp: 100 },
    ]);
    const db = await getTestDatabase();
    await db.insert(jutsu).values(
      [
        {
          id: "usable",
          requiredSkillId: null,
          villageId: null,
          battleUsageType: "BOTH" as const,
        },
        {
          id: "usable-two",
          requiredSkillId: null,
          villageId: null,
          battleUsageType: "BOTH" as const,
        },
        {
          id: "skill-jutsu",
          requiredSkillId: "skill",
          villageId: null,
          battleUsageType: "BOTH" as const,
        },
        {
          id: "village-jutsu",
          requiredSkillId: null,
          villageId: "village",
          battleUsageType: "BOTH" as const,
        },
        {
          id: "pve-jutsu",
          requiredSkillId: null,
          villageId: null,
          battleUsageType: "PVE" as const,
        },
      ].map((entry) => ({
        ...entry,
        name: entry.id,
        description: entry.id,
        battleDescription: entry.id,
        effects: [],
        target: "SELF" as const,
        range: 0,
        jutsuType: "NORMAL" as const,
        requiredRank: "GENIN" as const,
        image: "",
      })),
    );
    await insertItems([
      { id: "weapon", itemType: "WEAPON", bloodlineId: null, requiredSkillId: null },
      { id: "bloodline-item", itemType: "WEAPON", bloodlineId: "bloodline" },
      { id: "skill-item", itemType: "WEAPON", requiredSkillId: "skill" },
    ]);
    await db
      .insert(rankedLoadout)
      .values({
        id: "ranked-loadout",
        userId: USER,
        loadout: loadout(
          ["usable", "skill-jutsu", "village-jutsu", "pve-jutsu"],
          ["weapon", "bloodline-item", "skill-item"],
        ),
      });
  });

  const storedLoadout = async () => {
    const row = await (await getTestDatabase()).query.rankedLoadout.findFirst({
      where: eq(rankedLoadout.userId, USER),
    });
    if (!row) throw new Error("Missing ranked loadout");
    return row;
  };

  it("cleans equipped and favorite selections before queueing and reports removals", async () => {
    const result = await (await callerFor(pvpRankRouter, USER)).queueForRankedPvp();
    expect(result.success).toBe(true);
    expect(result.removedJutsuIds?.sort()).toEqual([
      "pve-jutsu",
      "skill-jutsu",
      "village-jutsu",
    ]);
    expect(result.removedItemIds?.sort()).toEqual(["bloodline-item", "skill-item"]);
    expect((await storedLoadout()).loadout).toEqual(loadout(["usable"], ["weapon"]));
    expect(await (await callerFor(pvpRankRouter, USER)).getRankedQueueCount()).toBe(1);
  });

  it("does not overwrite a newer valid selection when cleanup loses its CAS", async () => {
    const db = await getTestDatabase();
    const original = await storedLoadout();
    await db
      .update(rankedLoadout)
      .set({
        loadout: loadout(["usable-two"]),
        updatedAt: new Date(original.updatedAt.getTime() + 2000),
      })
      .where(eq(rankedLoadout.id, original.id));
    const cleaned = await cleanRankedProhibitedSelections(db, original);
    expect(cleaned.loadout.loadout).toEqual(loadout(["usable-two"]));
    expect((await storedLoadout()).loadout).toEqual(loadout(["usable-two"]));
  });
});
