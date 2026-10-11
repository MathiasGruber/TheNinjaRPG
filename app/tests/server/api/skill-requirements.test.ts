import { beforeEach, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { item, itemLoadout, jutsu, jutsuLoadout, skillTree, userData, userItem, userJutsu, userSkill } from "@/drizzle/schema";
import { itemRouter } from "@/server/api/routers/item";
import { jutsuRouter } from "@/server/api/routers/jutsu";
import { skillTreeRouter } from "@/server/api/routers/skillTree";
import { HealTag, RepairTag } from "@/validators/combat";
import { insertItems, insertUserItems, insertUsers } from "../../setup/factories";
import { callerFor, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

const USER = "skill-requirement-player";

describeWithDatabase("skill requirements against MySQL", () => {
  beforeEach(async () => {
    await resetTables(userSkill, userItem, userJutsu, itemLoadout, jutsuLoadout, item, jutsu, skillTree, userData);
    await insertUsers([{ userId: USER, username: USER, rank: "JONIN", level: 50, role: "OWNER", status: "AWAKE", isOutlaw: true, money: 1000000 }]);
    const db = await getTestDatabase();
    await db.insert(skillTree).values({ id: "skill", name: "Required skill", image: "skill.webp", description: "Required skill", effects: [] });
    await db.insert(userSkill).values({ id: "owned-skill", userId: USER, skillId: "skill", activated: false });
    await insertItems([
      { id: "weapon", name: "Skill weapon", itemType: "WEAPON", slot: "HAND", requiredSkillId: "skill", maxEquips: 1, inShop: true },
      { id: "potion", name: "Skill potion", itemType: "CONSUMABLE", requiredSkillId: "skill", destroyOnUse: true, effects: [HealTag.parse({ power: 10 })] },
      { id: "kit", name: "Skill repair kit", itemType: "CONSUMABLE", requiredSkillId: "skill", destroyOnUse: true, effects: [RepairTag.parse({ power: 100 })] },
    ]);
    await insertUserItems([
      { id: "owned-weapon", userId: USER, itemId: "weapon", durability: 50 },
      { id: "owned-potion", userId: USER, itemId: "potion", quantity: 3 },
      { id: "owned-kit", userId: USER, itemId: "kit", quantity: 3 },
    ]);
    await db.insert(jutsu).values({ id: "jutsu", name: "Skill jutsu", description: "Skill jutsu", battleDescription: "Uses skill jutsu", image: "jutsu.webp", effects: [], target: "SELF", range: 0, requiredRank: "STUDENT", jutsuType: "NORMAL", requiredSkillId: "skill" });
  });

  it("rejects equip and consumptions without spending stacks, then allows activation", async () => {
    const db = await getTestDatabase();
    const caller = await callerFor(itemRouter, USER);
    expect((await caller.toggleEquip({ userItemId: "owned-weapon" })).success).toBe(false);
    expect((await caller.consume({ userItemId: "owned-potion" })).success).toBe(false);
    expect((await caller.useRepairItem({ repairItemId: "owned-kit", targetItemId: "owned-weapon" })).success).toBe(false);
    expect((await caller.useRepairAll()).success).toBe(false);
    expect((await db.query.userItem.findFirst({ where: eq(userItem.id, "owned-potion") }))?.quantity).toBe(3);
    expect((await db.query.userItem.findFirst({ where: eq(userItem.id, "owned-kit") }))?.quantity).toBe(3);
    await db.update(userSkill).set({ activated: true }).where(eq(userSkill.userId, USER));
    expect((await caller.toggleEquip({ userItemId: "owned-weapon" })).success).toBe(true);
    expect((await caller.consume({ userItemId: "owned-potion" })).success).toBe(true);
    expect((await db.query.userItem.findFirst({ where: eq(userItem.id, "owned-potion") }))?.quantity).toBe(2);
  });

  it("allows purchases and training while preventing automatic equipment", async () => {
    const db = await getTestDatabase();
    const items = await callerFor(itemRouter, USER);
    const jutsus = await callerFor(jutsuRouter, USER);
    expect((await items.buy({ itemId: "weapon", stack: 1, villageId: null })).success).toBe(true);
    const weapons = await db.query.userItem.findMany({ where: eq(userItem.itemId, "weapon") });
    expect(weapons.every((row) => row.equipped === "NONE")).toBe(true);
    expect((await jutsus.startTraining({ jutsuId: "jutsu" })).success).toBe(true);
    const learned = await db.query.userJutsu.findFirst({ where: eq(userJutsu.userId, USER) });
    expect(learned?.equipped).toBe(false);
    expect((await jutsus.toggleEquip({ userJutsuId: learned!.id })).success).toBe(false);
  });

  it("refuses deletion of skills referenced by content even before purchase", async () => {
    const db = await getTestDatabase();
    await db.delete(userSkill).where(eq(userSkill.userId, USER));
    const caller = await callerFor(skillTreeRouter, USER);
    const result = await caller.delete({ id: "skill" });
    expect(result.success).toBe(false);
    expect(result.message).toContain("required by items or jutsu");
    expect(await db.query.skillTree.findFirst({ where: eq(skillTree.id, "skill") })).toBeDefined();
  });
});
