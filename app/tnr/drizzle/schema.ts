import {
  mysqlTable,
  uniqueIndex,
  varchar,
  datetime,
  mysqlEnum,
  json,
  int,
  index,
  text,
  tinyint,
  double,
  primaryKey,
} from "drizzle-orm/mysql-core";
import { InferModel } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const battle = mysqlTable(
  "Battle",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 }).notNull(),
    background: varchar("background", { length: 191 }).notNull(),
    battleType: mysqlEnum("battleType", ["ARENA", "COMBAT", "SPARRING"]).notNull(),
    usersState: json("usersState").notNull(),
    usersEffects: json("usersEffects").notNull(),
    groundEffects: json("groundEffects").notNull(),
    version: int("version").default(1).notNull(),
  },
  (table) => {
    return {
      idVersionKey: uniqueIndex("Battle_id_version_key").on(table.id, table.version),
    };
  }
);

export const battleAction = mysqlTable(
  "BattleAction",
  {
    id: int("id").autoincrement().primaryKey().notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    battleId: varchar("battleId", { length: 191 }).notNull(),
    battleVersion: int("battleVersion").notNull(),
    description: text("description").notNull(),
    appliedEffects: json("appliedEffects").notNull(),
  },
  (table) => {
    return {
      battleIdIdx: index("BattleAction_battleId_idx").on(table.battleId),
    };
  }
);

export const bloodline = mysqlTable(
  "Bloodline",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    effects: json("effects").notNull(),
    description: text("description").notNull(),
    regenIncrease: int("regenIncrease").default(0).notNull(),
    village: varchar("village", { length: 191 }).notNull(),
    image: varchar("image", { length: 191 }).notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    rank: mysqlEnum("rank", ["D", "C", "B", "A", "S"]).notNull(),
  },
  (table) => {
    return {
      nameKey: uniqueIndex("Bloodline_name_key").on(table.name),
      imageKey: uniqueIndex("Bloodline_image_key").on(table.image),
      villageIdx: index("Bloodline_village_idx").on(table.village),
      rankIdx: index("Bloodline_rank_idx").on(table.rank),
    };
  }
);

export const bloodlineRelations = relations(bloodline, ({ many }) => ({
  users: many(userData),
}));

export const bloodlineRolls = mysqlTable(
  "BloodlineRolls",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 }).notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    bloodlineId: varchar("bloodlineId", { length: 191 }),
    used: tinyint("used").default(0).notNull(),
  },
  (table) => {
    return {
      userIdKey: uniqueIndex("BloodlineRolls_userId_key").on(table.userId),
      bloodlineIdIdx: index("BloodlineRolls_bloodlineId_idx").on(table.bloodlineId),
      userIdIdx: index("BloodlineRolls_userId_idx").on(table.userId),
    };
  }
);

export const bugReport = mysqlTable(
  "BugReport",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    title: varchar("title", { length: 191 }).notNull(),
    content: text("content").notNull(),
    summary: varchar("summary", { length: 191 })
      .default("No summary provided")
      .notNull(),
    system: varchar("system", { length: 191 }).notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    isResolved: tinyint("is_resolved").default(0).notNull(),
    popularity: int("popularity").default(0).notNull(),
    conversationId: varchar("conversationId", { length: 191 }).notNull(),
  },
  (table) => {
    return {
      conversationIdKey: uniqueIndex("BugReport_conversationId_key").on(
        table.conversationId
      ),
      userIdIdx: index("BugReport_userId_idx").on(table.userId),
    };
  }
);

export const bugVotes = mysqlTable(
  "BugVotes",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    value: tinyint("value").notNull(),
    bugId: varchar("bugId", { length: 191 }).notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
  },
  (table) => {
    return {
      bugIdUserIdKey: uniqueIndex("BugVotes_bugId_userId_key").on(
        table.bugId,
        table.userId
      ),
      userIdIdx: index("BugVotes_userId_idx").on(table.userId),
    };
  }
);

export const conversation = mysqlTable(
  "Conversation",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    title: varchar("title", { length: 191 }),
    createdById: varchar("createdById", { length: 191 }),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 }).notNull(),
    isLocked: tinyint("isLocked").default(0).notNull(),
    isPublic: tinyint("isPublic").default(1).notNull(),
  },
  (table) => {
    return {
      titleKey: uniqueIndex("Conversation_title_key").on(table.title),
      createdByIdIdx: index("Conversation_createdById_idx").on(table.createdById),
    };
  }
);

export const conversationComment = mysqlTable(
  "ConversationComment",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    content: text("content").notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    conversationId: varchar("conversationId", { length: 191 }),
    isPinned: tinyint("isPinned").default(0).notNull(),
  },
  (table) => {
    return {
      userIdIdx: index("ConversationComment_userId_idx").on(table.userId),
      conversationIdIdx: index("ConversationComment_conversationId_idx").on(
        table.conversationId
      ),
    };
  }
);

export const forumBoard = mysqlTable(
  "ForumBoard",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    summary: text("summary").notNull(),
    group: varchar("group", { length: 191 }).notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 }).notNull(),
    nPosts: int("nPosts").default(0).notNull(),
    nThreads: int("nThreads").default(0).notNull(),
  },
  (table) => {
    return {
      nameKey: uniqueIndex("ForumBoard_name_key").on(table.name),
    };
  }
);

export const forumPost = mysqlTable(
  "ForumPost",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    content: text("content").notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    threadId: varchar("threadId", { length: 191 }).notNull(),
  },
  (table) => {
    return {
      userIdIdx: index("ForumPost_userId_idx").on(table.userId),
      threadIdIdx: index("ForumPost_threadId_idx").on(table.threadId),
    };
  }
);

export const forumThread = mysqlTable(
  "ForumThread",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    title: varchar("title", { length: 191 }).notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 }).notNull(),
    boardId: varchar("boardId", { length: 191 }).notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    nPosts: int("nPosts").default(0).notNull(),
    isPinned: tinyint("isPinned").default(0).notNull(),
    isLocked: tinyint("isLocked").default(0).notNull(),
  },
  (table) => {
    return {
      boardIdIdx: index("ForumThread_boardId_idx").on(table.boardId),
      userIdIdx: index("ForumThread_userId_idx").on(table.userId),
    };
  }
);

export const historicalAvatar = mysqlTable(
  "HistoricalAvatar",
  {
    id: int("id").autoincrement().primaryKey().notNull(),
    avatar: varchar("avatar", { length: 191 }),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    replicateId: varchar("replicateId", { length: 191 }),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    status: varchar("status", { length: 191 }).default("started").notNull(),
    done: tinyint("done").default(0).notNull(),
  },
  (table) => {
    return {
      replicateIdKey: uniqueIndex("HistoricalAvatar_replicateId_key").on(
        table.replicateId
      ),
      avatarKey: uniqueIndex("HistoricalAvatar_avatar_key").on(table.avatar),
      userIdIdx: index("HistoricalAvatar_userId_idx").on(table.userId),
      replicateIdIdx: index("HistoricalAvatar_replicateId_idx").on(table.replicateId),
      avatarIdx: index("HistoricalAvatar_avatar_idx").on(table.avatar),
    };
  }
);

export const item = mysqlTable(
  "Item",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    description: text("description").notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 }).notNull(),
    effects: json("effects").notNull(),
    itemType: mysqlEnum("itemType", [
      "WEAPON",
      "CONSUMABLE",
      "ARMOR",
      "ACCESSORY",
      "MATERIAL",
      "EVENT",
      "OTHER",
    ]).notNull(),
    rarity: mysqlEnum("rarity", ["COMMON", "RARE", "EPIC", "LEGENDARY"]).notNull(),
    slot: mysqlEnum("slot", [
      "HEAD",
      "CHEST",
      "LEGS",
      "FEET",
      "HAND",
      "ITEM",
    ]).notNull(),
    cost: int("cost").default(1).notNull(),
    weaponType: mysqlEnum("weaponType", [
      "STAFF",
      "AXE",
      "FIST_WEAPON",
      "SHURIKEN",
      "SICKLE",
      "DAGGER",
      "SWORD",
      "POLEARM",
      "FLAIL",
      "CHAIN",
      "FAN",
      "BOW",
      "HAMMER",
    ]),
    canStack: tinyint("canStack").default(0).notNull(),
    stackSize: int("stackSize").default(1).notNull(),
    target: mysqlEnum("target", [
      "SELF",
      "OTHER_USER",
      "OPPONENT",
      "ALLY",
      "CHARACTER",
      "GROUND",
      "EMPTY_GROUND",
    ]).notNull(),
    chakraCostPerc: double("chakraCostPerc").notNull(),
    image: varchar("image", { length: 191 }).notNull(),
    staminaCostPerc: double("staminaCostPerc").notNull(),
    destroyOnUse: tinyint("destroyOnUse").default(0).notNull(),
    range: int("range").default(0).notNull(),
    method: mysqlEnum("method", [
      "SINGLE",
      "ALL",
      "AOE_CIRCLE_SPAWN",
      "AOE_LINE_SHOOT",
      "AOE_CIRCLE_SHOOT",
      "AOE_SPIRAL_SHOOT",
    ])
      .default("SINGLE")
      .notNull(),
    actionCostPerc: double("actionCostPerc").default(60).notNull(),
    healthCostPerc: double("healthCostPerc").notNull(),
    battleDescription: text("battleDescription")
      .default(sql`('')`)
      .notNull(),
  },
  (table) => {
    return {
      nameKey: uniqueIndex("Item_name_key").on(table.name),
      imageKey: uniqueIndex("Item_image_key").on(table.image),
    };
  }
);

export const jutsu = mysqlTable(
  "Jutsu",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    description: text("description").notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 }).notNull(),
    effects: json("effects").notNull(),
    target: mysqlEnum("target", [
      "SELF",
      "OTHER_USER",
      "OPPONENT",
      "ALLY",
      "CHARACTER",
      "GROUND",
      "EMPTY_GROUND",
    ]).notNull(),
    range: int("range").notNull(),
    cooldown: int("cooldown").default(0).notNull(),
    bloodlineId: varchar("bloodlineId", { length: 191 }),
    requiredRank: mysqlEnum("requiredRank", [
      "STUDENT",
      "GENIN",
      "CHUNIN",
      "JONIN",
      "COMMANDER",
      "ELDER",
      "NONE",
    ]).notNull(),
    jutsuType: mysqlEnum("jutsuType", [
      "NORMAL",
      "SPECIAL",
      "BLOODLINE",
      "FORBIDDEN",
      "LOYALTY",
      "CLAN",
      "EVENT",
      "AI",
    ]).notNull(),
    image: varchar("image", { length: 191 }).notNull(),
    jutsuWeapon: mysqlEnum("jutsuWeapon", [
      "STAFF",
      "AXE",
      "FIST_WEAPON",
      "SHURIKEN",
      "SICKLE",
      "DAGGER",
      "SWORD",
      "POLEARM",
      "FLAIL",
      "CHAIN",
      "FAN",
      "BOW",
      "HAMMER",
    ]),
    battleDescription: text("battleDescription").notNull(),
    chakraCostPerc: double("chakraCostPerc").default(0.05).notNull(),
    healthCostPerc: double("healthCostPerc").notNull(),
    jutsuRank: mysqlEnum("jutsuRank", ["D", "C", "B", "A", "S"]).default("D").notNull(),
    staminaCostPerc: double("staminaCostPerc").notNull(),
    villageId: varchar("villageId", { length: 191 }),
    method: mysqlEnum("method", [
      "SINGLE",
      "ALL",
      "AOE_CIRCLE_SPAWN",
      "AOE_LINE_SHOOT",
      "AOE_CIRCLE_SHOOT",
      "AOE_SPIRAL_SHOOT",
    ])
      .default("SINGLE")
      .notNull(),
    actionCostPerc: double("actionCostPerc").default(80).notNull(),
  },
  (table) => {
    return {
      nameKey: uniqueIndex("Jutsu_name_key").on(table.name),
      imageKey: uniqueIndex("Jutsu_image_key").on(table.image),
      bloodlineIdIdx: index("Jutsu_bloodlineId_idx").on(table.bloodlineId),
      villageIdIdx: index("Jutsu_villageId_idx").on(table.villageId),
    };
  }
);

export const paypalSubscription = mysqlTable(
  "PaypalSubscription",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    createdById: varchar("createdById", { length: 191 }).notNull(),
    affectedUserId: varchar("affectedUserId", { length: 191 }).notNull(),
    status: varchar("status", { length: 191 }).notNull(),
    federalStatus: mysqlEnum("federalStatus", [
      "NONE",
      "NORMAL",
      "SILVER",
      "GOLD",
    ]).notNull(),
    orderId: varchar("orderId", { length: 191 }),
    subscriptionId: varchar("subscriptionId", { length: 191 }).notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 }).notNull(),
  },
  (table) => {
    return {
      subscriptionIdKey: uniqueIndex("PaypalSubscription_subscriptionId_key").on(
        table.subscriptionId
      ),
      orderIdKey: uniqueIndex("PaypalSubscription_orderId_key").on(table.orderId),
      createdByIdIdx: index("PaypalSubscription_createdById_idx").on(table.createdById),
      affectedUserIdIdx: index("PaypalSubscription_affectedUserId_idx").on(
        table.affectedUserId
      ),
    };
  }
);

export const paypalTransaction = mysqlTable(
  "PaypalTransaction",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    createdById: varchar("createdById", { length: 191 }).notNull(),
    affectedUserId: varchar("affectedUserId", { length: 191 }).notNull(),
    transactionId: varchar("transactionId", { length: 191 }).notNull(),
    transactionUpdatedDate: varchar("transactionUpdatedDate", {
      length: 191,
    }).notNull(),
    orderId: varchar("orderId", { length: 191 }),
    invoiceId: varchar("invoiceId", { length: 191 }),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 }).notNull(),
    amount: double("amount").notNull(),
    reputationPoints: int("reputationPoints").default(0).notNull(),
    currency: varchar("currency", { length: 191 }).default("USD").notNull(),
    status: varchar("status", { length: 191 }).notNull(),
    rawData: json("rawData").notNull(),
  },
  (table) => {
    return {
      orderIdKey: uniqueIndex("PaypalTransaction_orderId_key").on(table.orderId),
      createdByIdIdx: index("PaypalTransaction_createdById_idx").on(table.createdById),
      affectedUserIdIdx: index("PaypalTransaction_affectedUserId_idx").on(
        table.affectedUserId
      ),
    };
  }
);

export const paypalWebhookMessage = mysqlTable("PaypalWebhookMessage", {
  id: varchar("id", { length: 191 }).primaryKey().notNull(),
  createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
    .default(sql`(CURRENT_TIMESTAMP(3))`)
    .notNull(),
  updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 }).notNull(),
  eventType: varchar("eventType", { length: 191 }).notNull(),
  rawData: json("rawData").notNull(),
  handled: tinyint("handled").default(0).notNull(),
});

export const reportLog = mysqlTable(
  "ReportLog",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    targetUserId: varchar("targetUserId", { length: 191 }),
    staffUserId: varchar("staffUserId", { length: 191 }),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    action: varchar("action", { length: 191 }).notNull(),
  },
  (table) => {
    return {
      targetUserIdIdx: index("ReportLog_targetUserId_idx").on(table.targetUserId),
      staffUserIdIdx: index("ReportLog_staffUserId_idx").on(table.staffUserId),
    };
  }
);

export const userAttribute = mysqlTable(
  "UserAttribute",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    attribute: varchar("attribute", { length: 191 }).notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
  },
  (table) => {
    return {
      attributeUserIdKey: uniqueIndex("UserAttribute_attribute_userId_key").on(
        table.attribute,
        table.userId
      ),
      userIdIdx: index("UserAttribute_userId_idx").on(table.userId),
    };
  }
);

export const userData = mysqlTable(
  "UserData",
  {
    userId: varchar("userId", { length: 191 }).primaryKey().notNull(),
    username: varchar("username", { length: 191 }).notNull(),
    gender: varchar("gender", { length: 191 }).notNull(),
    curHealth: int("cur_health").default(100).notNull(),
    maxHealth: int("max_health").default(100).notNull(),
    curChakra: int("cur_chakra").default(100).notNull(),
    maxChakra: int("max_chakra").default(100).notNull(),
    curStamina: int("cur_stamina").default(100).notNull(),
    maxStamina: int("max_stamina").default(100).notNull(),
    regeneration: int("regeneration").default(1).notNull(),
    money: int("money").default(100).notNull(),
    bank: int("bank").default(100).notNull(),
    experience: int("experience").default(0).notNull(),
    rank: mysqlEnum("rank", [
      "STUDENT",
      "GENIN",
      "CHUNIN",
      "JONIN",
      "COMMANDER",
      "ELDER",
      "NONE",
    ])
      .default("STUDENT")
      .notNull(),
    level: int("level").default(1).notNull(),
    villageId: varchar("villageId", { length: 191 }),
    bloodlineId: varchar("bloodlineId", { length: 191 }),
    status: mysqlEnum("status", ["AWAKE", "HOSPITALIZED", "TRAVEL", "BATTLE"])
      .default("AWAKE")
      .notNull(),
    strength: double("strength").default(10).notNull(),
    intelligence: double("intelligence").default(10).notNull(),
    willpower: double("willpower").default(10).notNull(),
    speed: double("speed").default(10).notNull(),
    ninjutsuOffence: double("ninjutsu_offence").default(10).notNull(),
    ninjutsuDefence: double("ninjutsu_defence").default(10).notNull(),
    genjutsuOffence: double("genjutsu_offence").default(10).notNull(),
    genjutsuDefence: double("genjutsu_defence").default(10).notNull(),
    taijutsuOffence: double("taijutsu_offence").default(10).notNull(),
    taijutsuDefence: double("taijutsu_defence").default(10).notNull(),
    reputationPoints: int("reputation_points").default(0).notNull(),
    reputationPointsTotal: int("reputation_points_total").default(0).notNull(),
    popularityPoints: int("popularity_points").default(6).notNull(),
    popularityPointsTotal: int("popularity_points_total").default(6).notNull(),
    federalStatus: mysqlEnum("federalStatus", ["NONE", "NORMAL", "SILVER", "GOLD"])
      .default("NONE")
      .notNull(),
    approvedTos: tinyint("approved_tos").default(0).notNull(),
    avatar: varchar("avatar", { length: 191 }),
    sector: int("sector").default(0).notNull(),
    longitude: int("longitude").default(10).notNull(),
    latitude: int("latitude").default(7).notNull(),
    location: varchar("location", { length: 191 }).default("").notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    deletionAt: datetime("deletionAt", { mode: "date", fsp: 3 }),
    travelFinishAt: datetime("travelFinishAt", { mode: "date", fsp: 3 }),
    isBanned: tinyint("isBanned").default(0).notNull(),
    role: mysqlEnum("role", ["USER", "MODERATOR", "ADMIN"]).default("USER").notNull(),
    battleId: varchar("battleId", { length: 191 }),
    isAi: tinyint("isAI").default(0).notNull(),
    bukijutsuDefence: double("bukijutsu_defence").default(10).notNull(),
    bukijutsuOffence: double("bukijutsu_offence").default(10).notNull(),
    eloPve: int("elo_pve").default(1).notNull(),
    eloPvp: int("elo_pvp").default(1).notNull(),
    regenAt: datetime("regenAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
  },
  (table) => {
    return {
      userIdKey: uniqueIndex("UserData_userId_key").on(table.userId),
      usernameKey: uniqueIndex("UserData_username_key").on(table.username),
      bloodlineIdIdx: index("UserData_bloodlineId_idx").on(table.bloodlineId),
      villageIdIdx: index("UserData_villageId_idx").on(table.villageId),
      battleIdIdx: index("UserData_battleId_idx").on(table.battleId),
      userIdIdx: index("UserData_userId_idx").on(table.userId),
    };
  }
);
export type UserData = InferModel<typeof userData>;

export const userDataRelations = relations(userData, ({ one }) => ({
  bloodline: one(bloodline, {
    fields: [userData.bloodlineId],
    references: [bloodline.id],
  }),
  village: one(village, {
    fields: [userData.villageId],
    references: [village.id],
  }),
}));

export const userItem = mysqlTable(
  "UserItem",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 }).notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    itemId: varchar("itemId", { length: 191 }).notNull(),
    quantity: int("quantity").default(1).notNull(),
    equipped: mysqlEnum("equipped", [
      "HEAD",
      "CHEST",
      "LEGS",
      "FEET",
      "HAND_1",
      "HAND_2",
      "ITEM_1",
      "ITEM_2",
      "ITEM_3",
      "ITEM_4",
      "ITEM_5",
      "ITEM_6",
      "ITEM_7",
    ]),
  },
  (table) => {
    return {
      userIdIdx: index("UserItem_userId_idx").on(table.userId),
      itemIdIdx: index("UserItem_itemId_idx").on(table.itemId),
    };
  }
);

export const userJutsu = mysqlTable(
  "UserJutsu",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    jutsuId: varchar("jutsuId", { length: 191 }).notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 }).notNull(),
    level: int("level").default(1).notNull(),
    equipped: tinyint("equipped").default(0).notNull(),
    finishTraining: datetime("finishTraining", { mode: "date", fsp: 3 }),
  },
  (table) => {
    return {
      userIdJutsuIdKey: uniqueIndex("UserJutsu_userId_jutsuId_key").on(
        table.userId,
        table.jutsuId
      ),
      userIdIdx: index("UserJutsu_userId_idx").on(table.userId),
      jutsuIdIdx: index("UserJutsu_jutsuId_idx").on(table.jutsuId),
    };
  }
);

export const userReport = mysqlTable(
  "UserReport",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    reporterUserId: varchar("reporterUserId", { length: 191 }),
    reportedUserId: varchar("reportedUserId", { length: 191 }),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    system: varchar("system", { length: 191 }).notNull(),
    infraction: json("infraction").notNull(),
    reason: varchar("reason", { length: 191 }).notNull(),
    banEnd: datetime("banEnd", { mode: "date", fsp: 3 }),
    adminResolved: tinyint("adminResolved").default(0).notNull(),
    status: mysqlEnum("status", [
      "UNVIEWED",
      "REPORT_CLEARED",
      "BAN_ACTIVATED",
      "BAN_ESCALATED",
    ])
      .default("UNVIEWED")
      .notNull(),
  },
  (table) => {
    return {
      reporterUserIdIdx: index("UserReport_reporterUserId_idx").on(
        table.reporterUserId
      ),
      reportedUserIdIdx: index("UserReport_reportedUserId_idx").on(
        table.reportedUserId
      ),
    };
  }
);

export const userReportComment = mysqlTable(
  "UserReportComment",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    content: varchar("content", { length: 191 }).notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    reportId: varchar("reportId", { length: 191 }).notNull(),
    decision: mysqlEnum("decision", [
      "UNVIEWED",
      "REPORT_CLEARED",
      "BAN_ACTIVATED",
      "BAN_ESCALATED",
    ]),
  },
  (table) => {
    return {
      userIdIdx: index("UserReportComment_userId_idx").on(table.userId),
      reportIdIdx: index("UserReportComment_reportId_idx").on(table.reportId),
    };
  }
);

export const usersInConversation = mysqlTable(
  "UsersInConversation",
  {
    conversationId: varchar("conversationId", { length: 191 }).notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    assignedAt: datetime("assignedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
  },
  (table) => {
    return {
      userIdIdx: index("UsersInConversation_userId_idx").on(table.userId),
      conversationIdIdx: index("UsersInConversation_conversationId_idx").on(
        table.conversationId
      ),
      usersInConversationConversationIdUserId: primaryKey(
        table.conversationId,
        table.userId
      ),
    };
  }
);

export const village = mysqlTable(
  "Village",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    sector: int("sector").default(1).notNull(),
    hexColor: varchar("hexColor", { length: 191 }).default("#000000").notNull(),
  },
  (table) => {
    return {
      nameKey: uniqueIndex("Village_name_key").on(table.name),
      sectorKey: uniqueIndex("Village_sector_key").on(table.sector),
    };
  }
);

export const villageStructure = mysqlTable(
  "VillageStructure",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    image: varchar("image", { length: 191 }).notNull(),
    villageId: varchar("villageId", { length: 191 }).notNull(),
    level: int("level").default(1).notNull(),
    maxLevel: int("max_level").default(10).notNull(),
    curSp: int("cur_sp").default(100).notNull(),
    maxSp: int("max_sp").default(100).notNull(),
  },
  (table) => {
    return {
      nameVillageIdKey: uniqueIndex("VillageStructure_name_villageId_key").on(
        table.name,
        table.villageId
      ),
      villageIdIdx: index("VillageStructure_villageId_idx").on(table.villageId),
    };
  }
);
