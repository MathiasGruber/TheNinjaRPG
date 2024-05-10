import { z } from "zod";
import {
  mysqlTable,
  boolean,
  uniqueIndex,
  varchar,
  datetime,
  date,
  mysqlEnum,
  json,
  int,
  bigint,
  smallint,
  index,
  float,
  text,
  tinyint,
  double,
  primaryKey,
  unique,
} from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { QuestContentType } from "@/validators/objectives";
import type { QuestTrackerType } from "@/validators/objectives";
import * as consts from "@/drizzle/constants";
import type { ZodAllTags } from "@/libs/combat/types";

export const anbuSquad = mysqlTable(
  "AnbuSquad",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    image: varchar("image", { length: 191 }).notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    leaderId: varchar("leaderId", { length: 191 }),
    villageId: varchar("villageId", { length: 191 }).notNull(),
    pvpActivity: int("pvpActivity").default(0).notNull(),
    kageOrderId: varchar("kageOrderId", { length: 191 }).notNull(),
    leaderOrderId: varchar("leaderOrderId", { length: 191 }).notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
  },
  (table) => {
    return {
      nameKey: uniqueIndex("AnbuSquad_name_key").on(table.name),
      leaderIdIdx: index("AnbuSquad_leaderId_idx").on(table.leaderId),
      villageIdIdx: index("AnbuSquad_villageId_idx").on(table.villageId),
    };
  },
);
export type AnbuSquad = InferSelectModel<typeof anbuSquad>;

export const anbuSquadRelations = relations(anbuSquad, ({ one, many }) => ({
  leader: one(userData, {
    fields: [anbuSquad.leaderId],
    references: [userData.userId],
  }),
  members: many(userData),
  kageOrder: one(userNindo, {
    fields: [anbuSquad.kageOrderId],
    references: [userNindo.userId],
  }),
  leaderOrder: one(userNindo, {
    fields: [anbuSquad.leaderOrderId],
    references: [userNindo.userId],
  }),
}));

export const battle = mysqlTable(
  "Battle",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    roundStartAt: datetime("roundStartAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    background: varchar("background", { length: 191 }).notNull(),
    battleType: mysqlEnum("battleType", consts.BattleTypes).notNull(),
    usersState: json("usersState").notNull(),
    usersEffects: json("usersEffects").notNull(),
    groundEffects: json("groundEffects").notNull(),
    rewardScaling: double("rewardScaling").default(1).notNull(),
    version: int("version").default(1).notNull(),
    round: int("round").default(1).notNull(),
    activeUserId: varchar("activeUserId", { length: 191 }),
  },
  (table) => {
    return {
      idVersionKey: uniqueIndex("Battle_id_version_key").on(table.id, table.version),
    };
  },
);
export type Battle = InferSelectModel<typeof battle>;

export const battleAction = mysqlTable(
  "BattleAction",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    battleId: varchar("battleId", { length: 191 }).notNull(),
    battleVersion: int("battleVersion").notNull(),
    battleRound: int("battleRound").default(0).notNull(),
    description: text("description").notNull(),
    appliedEffects: json("appliedEffects").notNull(),
  },
  (table) => {
    return {
      round: uniqueIndex("BattleAction_round_key").on(
        table.battleId,
        table.battleVersion,
        table.battleRound,
      ),
    };
  },
);

export const battleActionRelations = relations(battleAction, ({ one }) => ({
  battle: one(battle, {
    fields: [battleAction.battleId, battleAction.battleVersion],
    references: [battle.id, battle.version],
  }),
  historyEntry: one(battleHistory, {
    fields: [battleAction.battleId],
    references: [battleHistory.battleId],
  }),
}));

export const battleHistory = mysqlTable(
  "BattleHistory",
  {
    id: int("id").autoincrement().primaryKey().notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    battleId: varchar("battleId", { length: 191 }).notNull(),
    attackedId: varchar("attackedId", { length: 191 }).notNull(),
    defenderId: varchar("defenderId", { length: 191 }).notNull(),
  },
  (table) => {
    return {
      battleIdIdx: index("BattleHistory_battleId_idx").on(table.battleId),
      battleWinnerIdx: index("BattleHistory_attackedId_idx").on(table.attackedId),
      battleLoserIdx: index("BattleHistory_defenderId_idx").on(table.defenderId),
    };
  },
);

export const battleHistoryRelations = relations(battleHistory, ({ one, many }) => ({
  battle: one(battle, {
    fields: [battleHistory.battleId],
    references: [battle.id],
  }),
  actions: many(battleAction),
  attacker: one(userData, {
    fields: [battleHistory.attackedId],
    references: [userData.userId],
  }),
  defender: one(userData, {
    fields: [battleHistory.defenderId],
    references: [userData.userId],
  }),
}));

export const bloodline = mysqlTable(
  "Bloodline",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    image: varchar("image", { length: 191 }).notNull(),
    description: text("description").notNull(),
    effects: json("effects").$type<ZodAllTags[]>().notNull(),
    regenIncrease: int("regenIncrease").default(0).notNull(),
    village: varchar("village", { length: 191 }).notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    rank: mysqlEnum("rank", consts.LetterRanks).notNull(),
    hidden: tinyint("hidden").default(0).notNull(),
  },
  (table) => {
    return {
      nameKey: uniqueIndex("Bloodline_name_key").on(table.name),
      imageKey: uniqueIndex("Bloodline_image_key").on(table.image),
      villageIdx: index("Bloodline_village_idx").on(table.village),
      rankIdx: index("Bloodline_rank_idx").on(table.rank),
    };
  },
);
export type Bloodline = InferSelectModel<typeof bloodline>;
export type BloodlineRank = Bloodline["rank"];

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
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    bloodlineId: varchar("bloodlineId", { length: 191 }),
    used: tinyint("used").default(0).notNull(),
  },
  (table) => {
    return {
      userIdKey: uniqueIndex("BloodlineRolls_userId_key").on(table.userId),
      bloodlineIdIdx: index("BloodlineRolls_bloodlineId_idx").on(table.bloodlineId),
    };
  },
);

export const bloodlineRollsRelations = relations(bloodlineRolls, ({ one }) => ({
  bloodline: one(bloodline, {
    fields: [bloodlineRolls.bloodlineId],
    references: [bloodline.id],
  }),
}));

export const conversation = mysqlTable(
  "Conversation",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    title: varchar("title", { length: 191 }),
    createdById: varchar("createdById", { length: 191 }),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    isLocked: tinyint("isLocked").default(0).notNull(),
    isPublic: tinyint("isPublic").default(1).notNull(),
  },
  (table) => {
    return {
      titleKey: index("Conversation_title_key").on(table.title),
      createdByIdIdx: index("Conversation_createdById_idx").on(table.createdById),
    };
  },
);

export const conversationRelations = relations(conversation, ({ many }) => ({
  users: many(user2conversation),
  comments: many(conversationComment),
}));

export const user2conversation = mysqlTable(
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
      usersInConversationConversationIdUserId: primaryKey(
        table.conversationId,
        table.userId,
      ),
    };
  },
);

export const user2conversationRelations = relations(user2conversation, ({ one }) => ({
  userData: one(userData, {
    fields: [user2conversation.userId],
    references: [userData.userId],
  }),
  conversation: one(conversation, {
    fields: [user2conversation.conversationId],
    references: [conversation.id],
  }),
}));

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
      createdAtIdx: index("ConversationComment_createdAt_idx").on(table.createdAt),
      conversationIdIdx: index("ConversationComment_conversationId_idx").on(
        table.conversationId,
      ),
    };
  },
);
export type ConversationComment = InferSelectModel<typeof conversationComment>;

export const conversationCommentRelations = relations(
  conversationComment,
  ({ one }) => ({
    user: one(userData, {
      fields: [conversationComment.userId],
      references: [userData.userId],
    }),
    conversation: one(conversation, {
      fields: [conversationComment.conversationId],
      references: [conversation.id],
    }),
  }),
);

export const damageSimulation = mysqlTable(
  "DamageCalculation",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    state: json("state").notNull(),
    active: tinyint("active").default(1).notNull(),
  },
  (table) => {
    return {
      userIdIdx: index("DamageCalculation_userId_idx").on(table.userId),
      createdAtIdx: index("DamageCalculation_createdAt_idx").on(table.createdAt),
    };
  },
);
export type DamageSimulation = InferSelectModel<typeof damageSimulation>;

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
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    nPosts: int("nPosts").default(0).notNull(),
    nThreads: int("nThreads").default(0).notNull(),
  },
  (table) => {
    return {
      nameKey: uniqueIndex("ForumBoard_name_key").on(table.name),
    };
  },
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
  },
);
export type ForumPost = InferSelectModel<typeof forumPost>;

export const forumPostRelations = relations(forumPost, ({ one }) => ({
  user: one(userData, {
    fields: [forumPost.userId],
    references: [userData.userId],
  }),
  thread: one(forumThread, {
    fields: [forumPost.threadId],
    references: [forumThread.id],
  }),
}));

export const forumThread = mysqlTable(
  "ForumThread",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    title: varchar("title", { length: 191 }).notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
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
  },
);

export const forumThreadRelations = relations(forumThread, ({ one, many }) => ({
  user: one(userData, {
    fields: [forumThread.userId],
    references: [userData.userId],
  }),
  posts: many(forumPost),
}));

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
        table.replicateId,
      ),
      avatarKey: uniqueIndex("HistoricalAvatar_avatar_key").on(table.avatar),
      doneIdx: index("HistoricalAvatar_done_idx").on(table.done),
      userIdIdx: index("HistoricalAvatar_userId_idx").on(table.userId),
    };
  },
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
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    effects: json("effects").$type<ZodAllTags[]>().notNull(),
    itemType: mysqlEnum("itemType", consts.ItemTypes).notNull(),
    rarity: mysqlEnum("rarity", consts.ItemRarities).notNull(),
    slot: mysqlEnum("slot", consts.ItemSlotTypes).notNull(),
    cooldown: int("cooldown").default(0).notNull(),
    weaponType: mysqlEnum("weaponType", consts.WeaponTypes).default("NONE").notNull(),
    target: mysqlEnum("target", consts.AttackTargets).notNull(),
    method: mysqlEnum("method", consts.AttackMethods).default("SINGLE").notNull(),
    cost: int("cost").default(1).notNull(),
    repsCost: int("reputationCost").default(0).notNull(),
    canStack: tinyint("canStack").default(0).notNull(),
    stackSize: int("stackSize").default(1).notNull(),
    image: varchar("image", { length: 191 }).notNull(),
    destroyOnUse: tinyint("destroyOnUse").default(0).notNull(),
    range: int("range").default(0).notNull(),
    chakraCost: double("chakraCost").default(0).notNull(),
    staminaCost: double("staminaCost").default(0).notNull(),
    healthCost: double("healthCost").default(0).notNull(),
    actionCostPerc: double("actionCostPerc").default(60).notNull(),
    battleDescription: text("battleDescription")
      .default(sql`('')`)
      .notNull(),
    hidden: tinyint("hidden").default(0).notNull(),
  },
  (table) => {
    return {
      nameKey: uniqueIndex("Item_name_key").on(table.name),
      imageKey: uniqueIndex("Item_image_key").on(table.image),
    };
  },
);
export type Item = InferSelectModel<typeof item>;
export type ItemType = Item["itemType"];
export type ItemSlotType = Item["slot"];
export type ItemRarity = Item["rarity"];

export const jutsu = mysqlTable(
  "Jutsu",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    description: text("description").notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    effects: json("effects").$type<ZodAllTags[]>().notNull(),
    target: mysqlEnum("target", consts.AttackTargets).notNull(),
    range: int("range").notNull(),
    cooldown: int("cooldown").default(0).notNull(),
    bloodlineId: varchar("bloodlineId", { length: 191 }),
    requiredRank: mysqlEnum("requiredRank", consts.UserRanks).notNull(),
    jutsuType: mysqlEnum("jutsuType", consts.JutsuTypes).notNull(),
    image: varchar("image", { length: 191 }).notNull(),
    jutsuWeapon: mysqlEnum("jutsuWeapon", consts.WeaponTypes).default("NONE").notNull(),
    statClassification: mysqlEnum("statClassification", consts.StatTypes),
    battleDescription: text("battleDescription").notNull(),
    jutsuRank: mysqlEnum("jutsuRank", consts.LetterRanks).default("D").notNull(),
    actionCostPerc: double("actionCostPerc").default(80).notNull(),
    staminaCost: double("staminaCost").default(0.05).notNull(),
    chakraCost: double("chakraCost").default(0.05).notNull(),
    healthCost: double("healthCost").default(0).notNull(),
    villageId: varchar("villageId", { length: 191 }),
    method: mysqlEnum("method", consts.AttackMethods).default("SINGLE").notNull(),
    hidden: tinyint("hidden").default(0).notNull(),
  },
  (table) => {
    return {
      nameKey: uniqueIndex("Jutsu_name_key").on(table.name),
      imageKey: uniqueIndex("Jutsu_image_key").on(table.image),
      bloodlineIdIdx: index("Jutsu_bloodlineId_idx").on(table.bloodlineId),
      villageIdIdx: index("Jutsu_villageId_idx").on(table.villageId),
    };
  },
);

export const jutsuRelations = relations(jutsu, ({ one }) => ({
  bloodline: one(bloodline, {
    fields: [jutsu.bloodlineId],
    references: [bloodline.id],
  }),
}));

export type Jutsu = InferSelectModel<typeof jutsu>;
export type JutsuRank = Jutsu["jutsuRank"];

export const jutsuLoadout = mysqlTable(
  "JutsuLoadout",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    jutsuIds: json("content").$type<string[]>().notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
  },
  (table) => {
    return {
      userIdIdx: index("JutsuLoadout_userId_idx").on(table.userId),
    };
  },
);

export const notification = mysqlTable(
  "Notification",
  {
    id: int("id").autoincrement().primaryKey().notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    content: text("content").notNull(),
  },
  (table) => {
    return {
      createdAtIdx: index("Notification_createdAt_idx").on(table.createdAt),
    };
  },
);

export const notificationRelations = relations(notification, ({ one }) => ({
  user: one(userData, {
    fields: [notification.userId],
    references: [userData.userId],
  }),
}));

export const paypalSubscription = mysqlTable(
  "PaypalSubscription",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    createdById: varchar("createdById", { length: 191 }).notNull(),
    affectedUserId: varchar("affectedUserId", { length: 191 }).notNull(),
    status: varchar("status", { length: 191 }).notNull(),
    federalStatus: mysqlEnum("federalStatus", consts.FederalStatuses).notNull(),
    orderId: varchar("orderId", { length: 191 }),
    subscriptionId: varchar("subscriptionId", { length: 191 }).notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
  },
  (table) => {
    return {
      subscriptionIdKey: uniqueIndex("PaypalSubscription_subscriptionId_key").on(
        table.subscriptionId,
      ),
      orderIdKey: uniqueIndex("PaypalSubscription_orderId_key").on(table.orderId),
      createdByIdIdx: index("PaypalSubscription_createdById_idx").on(table.createdById),
      affectedUserIdIdx: index("PaypalSubscription_affectedUserId_idx").on(
        table.affectedUserId,
      ),
    };
  },
);

export const paypalSubscriptionRelations = relations(paypalSubscription, ({ one }) => ({
  affectedUser: one(userData, {
    fields: [paypalSubscription.affectedUserId],
    references: [userData.userId],
  }),
  createdBy: one(userData, {
    fields: [paypalSubscription.createdById],
    references: [userData.userId],
  }),
}));

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
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
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
        table.affectedUserId,
      ),
    };
  },
);

export const paypalTransactionRelations = relations(paypalTransaction, ({ one }) => ({
  affectedUser: one(userData, {
    fields: [paypalTransaction.affectedUserId],
    references: [userData.userId],
  }),
  createdBy: one(userData, {
    fields: [paypalTransaction.createdById],
    references: [userData.userId],
  }),
}));

export const paypalWebhookMessage = mysqlTable("PaypalWebhookMessage", {
  id: varchar("id", { length: 191 }).primaryKey().notNull(),
  createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
    .default(sql`(CURRENT_TIMESTAMP(3))`)
    .notNull(),
  updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
    .default(sql`(CURRENT_TIMESTAMP(3))`)
    .notNull(),
  eventType: varchar("eventType", { length: 191 }).notNull(),
  rawData: json("rawData").notNull(),
  handled: tinyint("handled").default(0).notNull(),
});

export const ryoTrade = mysqlTable(
  "RyoTrade",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    creatorUserId: varchar("creatorUserId", { length: 191 }).notNull(),
    repsForSale: int("repsForSale").notNull(),
    requestedRyo: bigint("requestedRyo", { mode: "number" }).notNull(),
    ryoPerRep: double("ryoPerRep").notNull(),
    purchaserUserId: varchar("purchaserUserId", { length: 191 }),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
  },
  (table) => {
    return {
      creatorUserIdIdx: index("RyoTrade_creatorUserId_idx").on(table.creatorUserId),
    };
  },
);

export const ryoTradeRelations = relations(ryoTrade, ({ one }) => ({
  creator: one(userData, {
    fields: [ryoTrade.creatorUserId],
    references: [userData.userId],
  }),
}));

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
  },
);

export const actionLog = mysqlTable(
  "ActionLog",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    userId: varchar("userId", { length: 191 }),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    tableName: varchar("tableName", { length: 191 }),
    changes: json("changes").notNull(),
    relatedId: varchar("relatedId", { length: 191 }),
    relatedMsg: varchar("relatedText", { length: 191 }),
    relatedImage: varchar("relatedImage", { length: 191 }),
  },
  (table) => {
    return { userId: index("ActionLog_userId_idx").on(table.userId) };
  },
);

export const actionLogRelations = relations(actionLog, ({ one }) => ({
  user: one(userData, {
    fields: [actionLog.userId],
    references: [userData.userId],
  }),
}));

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
        table.userId,
      ),
      userIdIdx: index("UserAttribute_userId_idx").on(table.userId),
    };
  },
);

export const userData = mysqlTable(
  "UserData",
  {
    userId: varchar("userId", { length: 191 }).primaryKey().notNull(),
    recruiterId: varchar("recruiterId", { length: 191 }),
    anbuId: varchar("anbuId", { length: 191 }),
    jutsuLoadout: varchar("jutsuLoadout", { length: 191 }),
    nRecruited: int("nRecruited").default(0).notNull(),
    lastIp: varchar("lastIp", { length: 191 }),
    username: varchar("username", { length: 191 }).notNull(),
    gender: varchar("gender", { length: 191 }).notNull(),
    curHealth: smallint("curHealth", { unsigned: true }).default(100).notNull(),
    maxHealth: smallint("maxHealth", { unsigned: true }).default(100).notNull(),
    curChakra: smallint("curChakra", { unsigned: true }).default(100).notNull(),
    maxChakra: smallint("maxChakra", { unsigned: true }).default(100).notNull(),
    curStamina: smallint("curStamina", { unsigned: true }).default(100).notNull(),
    maxStamina: smallint("maxStamina", { unsigned: true }).default(100).notNull(),
    regeneration: tinyint("regeneration").default(1).notNull(),
    money: bigint("money", { mode: "number" }).default(100).notNull(),
    bank: bigint("bank", { mode: "number" }).default(100).notNull(),
    experience: int("experience").default(0).notNull(),
    earnedExperience: int("earnedExperience").default(0).notNull(),
    rank: mysqlEnum("rank", consts.UserRanks).default("STUDENT").notNull(),
    isOutlaw: boolean("isOutlaw").default(false).notNull(),
    level: tinyint("level").default(1).notNull(),
    villageId: varchar("villageId", { length: 191 }),
    bloodlineId: varchar("bloodlineId", { length: 191 }),
    status: mysqlEnum("status", consts.UserStatuses).default("AWAKE").notNull(),
    strength: double("strength").default(10).notNull(),
    intelligence: double("intelligence").default(10).notNull(),
    willpower: double("willpower").default(10).notNull(),
    speed: double("speed").default(10).notNull(),
    ninjutsuOffence: double("ninjutsuOffence").default(10).notNull(),
    ninjutsuDefence: double("ninjutsuDefence").default(10).notNull(),
    genjutsuOffence: double("genjutsuOffence").default(10).notNull(),
    genjutsuDefence: double("genjutsuDefence").default(10).notNull(),
    taijutsuOffence: double("taijutsuOffence").default(10).notNull(),
    taijutsuDefence: double("taijutsuDefence").default(10).notNull(),
    bukijutsuDefence: double("bukijutsuDefence").default(10).notNull(),
    bukijutsuOffence: double("bukijutsuOffence").default(10).notNull(),
    reputationPoints: float("reputationPoints").default(5).notNull(),
    primaryElement: mysqlEnum("primaryElement", consts.ElementNames),
    secondaryElement: mysqlEnum("secondaryElement", consts.ElementNames),
    reputationPointsTotal: float("reputationPointsTotal").default(5).notNull(),
    villagePrestige: float("villagePrestige").default(0).notNull(),
    federalStatus: mysqlEnum("federalStatus", consts.FederalStatuses)
      .default("NONE")
      .notNull(),
    approvedTos: tinyint("approvedTos").default(0).notNull(),
    avatar: varchar("avatar", { length: 191 }),
    sector: smallint("sector", { unsigned: true }).default(0).notNull(),
    longitude: tinyint("longitude").default(10).notNull(),
    latitude: tinyint("latitude").default(7).notNull(),
    location: varchar("location", { length: 191 }).default(""),
    joinedVillageAt: datetime("joinedVillageAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    questFinishAt: datetime("questFinishAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    activityStreak: int("activityStreak").default(0).notNull(),
    deletionAt: datetime("deletionAt", { mode: "date", fsp: 3 }),
    travelFinishAt: datetime("travelFinishAt", { mode: "date", fsp: 3 }),
    isBanned: tinyint("isBanned").default(0).notNull(),
    role: mysqlEnum("role", consts.UserRoles).default("USER").notNull(),
    battleId: varchar("battleId", { length: 191 }),
    isAi: tinyint("isAI").default(0).notNull(),
    isSummon: tinyint("isSummon").default(0).notNull(),
    inboxNews: int("inboxNews").default(0).notNull(),
    regenAt: datetime("regenAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    immunityUntil: datetime("immunityUntil", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    curEnergy: tinyint("curEnergy").default(100).notNull(),
    maxEnergy: tinyint("maxEnergy").default(100).notNull(),
    trainingStartedAt: datetime("trainingStartedAt", { mode: "date", fsp: 3 }),
    trainingSpeed: mysqlEnum("trainingSpeed", consts.TrainingSpeeds)
      .default("15min")
      .notNull(),
    currentlyTraining: mysqlEnum("currentlyTraining", consts.UserStatNames),
    unreadNotifications: smallint("unreadNotifications").default(0).notNull(),
    unreadNews: tinyint("unreadNews").default(0).notNull(),
    questData: json("questData").$type<QuestTrackerType[]>(),
    senseiId: varchar("senseiId", { length: 191 }),
    medicalExperience: int("medicalExperience").default(0).notNull(),
    // Statistics
    pvpFights: int("pvpFights").default(0).notNull(),
    pveFights: int("pveFights").default(0).notNull(),
    pvpActivity: int("pvpActivity").default(0).notNull(),
    pvpStreak: smallint("pvpStreak", { unsigned: true }).default(0).notNull(),
    errands: smallint("errands", { unsigned: true }).default(0).notNull(),
    missionsD: smallint("missionsD", { unsigned: true }).default(0).notNull(),
    missionsC: smallint("missionsC", { unsigned: true }).default(0).notNull(),
    missionsB: smallint("missionsB", { unsigned: true }).default(0).notNull(),
    missionsA: smallint("missionsA", { unsigned: true }).default(0).notNull(),
    missionsS: smallint("missionsS", { unsigned: true }).default(0).notNull(),
    crimesD: smallint("crimesD", { unsigned: true }).default(0).notNull(),
    crimesC: smallint("crimesC", { unsigned: true }).default(0).notNull(),
    crimesB: smallint("crimesB", { unsigned: true }).default(0).notNull(),
    crimesA: smallint("crimesA", { unsigned: true }).default(0).notNull(),
    crimesS: smallint("crimesS", { unsigned: true }).default(0).notNull(),
    dailyArenaFights: smallint("dailyArenaFights", { unsigned: true })
      .default(0)
      .notNull(),
    dailyMissions: smallint("dailyMissions", { unsigned: true }).default(0).notNull(),
    movedTooFastCount: int("movedTooFastCount").default(0).notNull(),
    extraItemSlots: smallint("extraItemSlots", { unsigned: true }).default(0).notNull(),
    customTitle: varchar("customTitle", { length: 191 }),
  },
  (table) => {
    return {
      userIdKey: uniqueIndex("UserData_userId_key").on(table.userId),
      usernameKey: uniqueIndex("UserData_username_key").on(table.username),
      bloodlineIdIdx: index("UserData_bloodlineId_idx").on(table.bloodlineId),
      villageIdIdx: index("UserData_villageId_idx").on(table.villageId),
      battleIdIdx: index("UserData_battleId_idx").on(table.battleId),
      statusIdx: index("UserData_status_idx").on(table.status),
      sectorIdx: index("UserData_sector_idx").on(table.sector),
      senseiIdx: index("UserData_senseiId_idx").on(table.senseiId),
      latitudeIdx: index("UserData_latitude_idx").on(table.latitude),
      longitudeIdx: index("UserData_longitude_idx").on(table.longitude),
    };
  },
);
export const insertUserDataSchema = createInsertSchema(userData)
  .omit({
    trainingStartedAt: true,
    currentlyTraining: true,
    deletionAt: true,
    travelFinishAt: true,
    questTier: true,
    questDaily: true,
    questMission: true,
    questData: true,
  })
  .merge(
    z.object({
      jutsus: z.array(z.string()).optional(),
      primaryElement: z.enum([...consts.ElementNames, ""]).nullish(),
      secondaryElement: z.enum([...consts.ElementNames, ""]).nullish(),
      level: z.coerce.number().min(1).max(200),
      regeneration: z.coerce.number().min(1).max(100),
      ninjutsuOffence: z.coerce.number().min(10).max(consts.STATS_CAP),
      ninjutsuDefence: z.coerce.number().min(10).max(consts.STATS_CAP),
      genjutsuOffence: z.coerce.number().min(10).max(consts.STATS_CAP),
      genjutsuDefence: z.coerce.number().min(10).max(consts.STATS_CAP),
      taijutsuOffence: z.coerce.number().min(10).max(consts.STATS_CAP),
      taijutsuDefence: z.coerce.number().min(10).max(consts.STATS_CAP),
      bukijutsuOffence: z.coerce.number().min(10).max(consts.STATS_CAP),
      bukijutsuDefence: z.coerce.number().min(10).max(consts.STATS_CAP),
      strength: z.coerce.number().min(10).max(consts.GENS_CAP),
      intelligence: z.coerce.number().min(10).max(consts.GENS_CAP),
      willpower: z.coerce.number().min(10).max(consts.GENS_CAP),
      speed: z.coerce.number().min(10).max(consts.GENS_CAP),
      isSummon: z.coerce.number().min(0).max(1),
    }),
  );
export type InsertUserDataSchema = z.infer<typeof insertUserDataSchema>;
export type UserData = InferSelectModel<typeof userData>;
export type UserRank = UserData["rank"];
export type UserStatus = UserData["status"];
export type FederalStatus = UserData["federalStatus"];

export const userDataRelations = relations(userData, ({ one, many }) => ({
  bloodline: one(bloodline, {
    fields: [userData.bloodlineId],
    references: [bloodline.id],
  }),
  village: one(village, {
    fields: [userData.villageId],
    references: [village.id],
  }),
  nindo: one(userNindo, {
    fields: [userData.userId],
    references: [userNindo.userId],
  }),
  userQuests: many(questHistory),
  conversations: many(user2conversation),
  items: many(userItem),
  jutsus: many(userJutsu),
  badges: many(userBadge),
  recruitedUsers: many(userData, { relationName: "recruiter" }),
  recruiter: one(userData, {
    fields: [userData.recruiterId],
    references: [userData.userId],
    relationName: "recruiter",
  }),
  students: many(userData, { relationName: "sensei" }),
  sensei: one(userData, {
    fields: [userData.senseiId],
    references: [userData.userId],
    relationName: "sensei",
  }),
  anbuSquad: one(anbuSquad, {
    fields: [userData.anbuId],
    references: [anbuSquad.id],
  }),
  loadout: one(jutsuLoadout, {
    fields: [userData.jutsuLoadout],
    references: [jutsuLoadout.id],
  }),
}));

export const userNindo = mysqlTable(
  "UserNindo",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    content: text("content").notNull(),
  },
  (table) => {
    return { userIdIdx: index("UserNindo_userId_idx").on(table.userId) };
  },
);
export type UserNindo = InferSelectModel<typeof userNindo>;

export const userItem = mysqlTable(
  "UserItem",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    itemId: varchar("itemId", { length: 191 }).notNull(),
    quantity: int("quantity").default(1).notNull(),
    equipped: mysqlEnum("equipped", consts.ItemSlots).default("NONE").notNull(),
  },
  (table) => {
    return {
      userIdIdx: index("UserItem_userId_idx").on(table.userId),
      itemIdIdx: index("UserItem_itemId_idx").on(table.itemId),
      quantityIdx: index("UserItem_quantity_idx").on(table.quantity),
      equippedIdx: index("UserItem_equipped_idx").on(table.equipped),
    };
  },
);
export type UserItem = InferSelectModel<typeof userItem>;
export type ItemSlot = UserItem["equipped"];

export const userItemRelations = relations(userItem, ({ one }) => ({
  item: one(item, {
    fields: [userItem.itemId],
    references: [item.id],
  }),
  user: one(userData, {
    fields: [userItem.userId],
    references: [userData.userId],
  }),
}));

export const userJutsu = mysqlTable(
  "UserJutsu",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    jutsuId: varchar("jutsuId", { length: 191 }).notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    level: int("level").default(1).notNull(),
    experience: int("experience").default(0).notNull(),
    equipped: tinyint("equipped").default(0).notNull(),
    finishTraining: datetime("finishTraining", { mode: "date", fsp: 3 }),
  },
  (table) => {
    return {
      userIdJutsuIdKey: uniqueIndex("UserJutsu_userId_jutsuId_key").on(
        table.userId,
        table.jutsuId,
      ),
      jutsuIdIdx: index("UserJutsu_jutsuId_idx").on(table.jutsuId),
      equippedIdx: index("Jutsu_equipped_idx").on(table.equipped),
    };
  },
);
export type UserJutsu = InferSelectModel<typeof userJutsu>;

export const userJutsuRelations = relations(userJutsu, ({ one }) => ({
  jutsu: one(jutsu, {
    fields: [userJutsu.jutsuId],
    references: [jutsu.id],
  }),
  user: one(userData, {
    fields: [userJutsu.userId],
    references: [userData.userId],
  }),
}));

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
    reason: text("reason").notNull(),
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
        table.reporterUserId,
      ),
      reportedUserIdIdx: index("UserReport_reportedUserId_idx").on(
        table.reportedUserId,
      ),
    };
  },
);
export type UserReport = InferSelectModel<typeof userReport>;
export type ReportAction = UserReport["status"];

export const userReportRelations = relations(userReport, ({ one }) => ({
  reportedUser: one(userData, {
    fields: [userReport.reportedUserId],
    references: [userData.userId],
  }),
  reporterUser: one(userData, {
    fields: [userReport.reporterUserId],
    references: [userData.userId],
  }),
}));

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
  },
);
export type UserReportComment = InferSelectModel<typeof userReportComment>;

export const userReportCommentRelations = relations(userReportComment, ({ one }) => ({
  user: one(userData, {
    fields: [userReportComment.userId],
    references: [userData.userId],
  }),
}));

export const village = mysqlTable(
  "Village",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    sector: int("sector").default(1).notNull(),
    description: varchar("description", { length: 512 }).default("").notNull(),
    kageId: varchar("kageId", { length: 191 }).notNull(),
    tokens: int("tokens").default(0).notNull(),
    isOutlawFaction: boolean("isOutlawFaction").default(false).notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    hexColor: varchar("hexColor", { length: 191 }).default("#000000").notNull(),
  },
  (table) => {
    return {
      nameKey: uniqueIndex("Village_name_key").on(table.name),
      sectorKey: uniqueIndex("Village_sector_key").on(table.sector),
    };
  },
);
export type Village = InferSelectModel<typeof village>;

export const villageRelations = relations(village, ({ many, one }) => ({
  structures: many(villageStructure),
  relationshipA: many(villageAlliance, { relationName: "villageA" }),
  relationshipB: many(villageAlliance, { relationName: "villageB" }),
  kage: one(userData, {
    fields: [village.kageId],
    references: [userData.userId],
  }),
  notice: one(userNindo, {
    fields: [village.id],
    references: [userNindo.userId],
  }),
}));

export const villageStructure = mysqlTable(
  "VillageStructure",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    route: varchar("route", { length: 191 }).default("").notNull(),
    image: varchar("image", { length: 191 }).notNull(),
    villageId: varchar("villageId", { length: 191 }).notNull(),
    longitude: tinyint("longitude").default(10).notNull(),
    latitude: tinyint("latitude").default(10).notNull(),
    hasPage: tinyint("hasPage").default(0).notNull(),
    curSp: int("curSp").default(100).notNull(),
    maxSp: int("maxSp").default(100).notNull(),
    allyAccess: tinyint("allyAccess").default(1).notNull(),
    // upgrade cust & current level
    baseCost: int("baseCost").default(3000).notNull(),
    level: int("level").default(1).notNull(),
    maxLevel: int("maxLevel").default(10).notNull(),
    // Per level advantages
    anbuSquadsPerLvl: tinyint("anbuSquadsPerLvl").default(0).notNull(),
    arenaRewardPerLvl: tinyint("arenaRewardPerLvl").default(0).notNull(),
    bankInterestPerLvl: tinyint("bankInterestPerLvl").default(0).notNull(),
    blackDiscountPerLvl: tinyint("blackDiscountPerLvl").default(0).notNull(),
    clansPerLvl: tinyint("clansPerLvl").default(0).notNull(),
    hospitalSpeedupPerLvl: tinyint("hospitalSpeedupPerLvl").default(0).notNull(),
    itemDiscountPerLvl: tinyint("itemDiscountPerLvl").default(0).notNull(),
    patrolsPerLvl: tinyint("patrolsPerLvl").default(0).notNull(),
    ramenDiscountPerLvl: tinyint("ramenDiscountPerLvl").default(0).notNull(),
    regenIncreasePerLvl: tinyint("regenIncreasePerLvl").default(0).notNull(),
    sleepRegenPerLvl: tinyint("sleepRegenPerLvl").default(0).notNull(),
    structureDiscountPerLvl: tinyint("structureDiscountPerLvl").default(0).notNull(),
    trainBoostPerLvl: tinyint("trainBoostPerLvl").default(0).notNull(),
    villageDefencePerLvl: tinyint("villageDefencePerLvl").default(0).notNull(),
  },
  (table) => {
    return {
      nameVillageIdKey: uniqueIndex("VillageStructure_name_villageId_key").on(
        table.name,
        table.villageId,
      ),
      villageIdIdx: index("VillageStructure_villageId_idx").on(table.villageId),
    };
  },
);
export type VillageStructure = InferSelectModel<typeof villageStructure>;
export type VillageStructureInsert = InferInsertModel<typeof villageStructure>;

export const villageStructureRelations = relations(villageStructure, ({ one }) => ({
  village: one(village, {
    fields: [villageStructure.villageId],
    references: [village.id],
  }),
}));

export const villageAlliance = mysqlTable(
  "VillageAlliance",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    villageIdA: varchar("villageIdA", { length: 191 }).notNull(),
    villageIdB: varchar("villageIdB", { length: 191 }).notNull(),
    status: mysqlEnum("status", consts.AllianceStates).notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 }),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 }),
  },
  (table) => {
    return {
      villageIdAIdx: index("VillageAlliance_villageIdA_idx").on(table.villageIdA),
      villageIdBIdx: index("VillageAlliance_villageIdB_idx").on(table.villageIdB),
      statusIdx: index("VillageAlliance_status_idx").on(table.status),
    };
  },
);
export type VillageAlliance = InferSelectModel<typeof villageAlliance>;

export const villageAllianceRelations = relations(villageAlliance, ({ one }) => ({
  villageA: one(village, {
    fields: [villageAlliance.villageIdA],
    references: [village.id],
    relationName: "villageA",
  }),
  villageB: one(village, {
    fields: [villageAlliance.villageIdB],
    references: [village.id],
    relationName: "villageB",
  }),
}));

export const kageDefendedChallenges = mysqlTable(
  "KageDefendedChallenges",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    villageId: varchar("villageId", { length: 191 }).notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    kageId: varchar("kageId", { length: 191 }).notNull(),
    didWin: tinyint("didWin").default(0).notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    rounds: int("rounds").notNull(),
  },
  (table) => {
    return {
      villageIdIdx: index("VillageKageChallenges_villageId_idx").on(table.villageId),
      userIdIdx: index("VillageKageChallenges_userId_idx").on(table.userId),
      kageIDIdx: index("VillageKageChallenges_kageID_idx").on(table.kageId),
    };
  },
);

export const kageDefendedChallengesRelations = relations(
  kageDefendedChallenges,
  ({ one }) => ({
    user: one(userData, {
      fields: [kageDefendedChallenges.userId],
      references: [userData.userId],
    }),
    kage: one(userData, {
      fields: [kageDefendedChallenges.kageId],
      references: [userData.userId],
    }),
  }),
);

export const dataBattleAction = mysqlTable(
  "DataBattleAction",
  {
    id: int("id").autoincrement().primaryKey().notNull(),
    type: mysqlEnum("type", consts.BattleDataEntryType).notNull(),
    contentId: varchar("contentId", { length: 191 }).notNull(),
    battleType: mysqlEnum("battleType", consts.BattleTypes).notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    battleWon: tinyint("battleWon").notNull(),
  },
  (table) => {
    return {
      contentIdIdx: index("DataBattleActions_contentId_idx").on(table.contentId),
      typeIdx: index("DataBattleActions_type").on(table.type),
      battleWonIdx: index("DataBattleActions_battleWon").on(table.battleWon),
    };
  },
);

export const quest = mysqlTable(
  "Quest",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    image: varchar("image", { length: 191 }),
    description: varchar("description", { length: 512 }),
    successDescription: varchar("successDescription", { length: 512 }),
    requiredRank: mysqlEnum("requiredRank", consts.LetterRanks).default("D").notNull(),
    requiredLevel: int("requiredLevel").default(1).notNull(),
    requiredVillage: varchar("requiredVillage", { length: 191 }),
    tierLevel: int("tierLevel"),
    timeFrame: mysqlEnum("timeFrame", consts.TimeFrames).notNull(),
    questType: mysqlEnum("questType", consts.QuestTypes).notNull(),
    content: json("content").$type<QuestContentType>().notNull(),
    hidden: tinyint("hidden").notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    expiresAt: date("expiresAt", { mode: "string" }),
  },
  (table) => {
    return {
      tierLevel: unique("tierLevel").on(table.tierLevel),
      questTypeIdx: index("Quest_questType_idx").on(table.questType),
      requiredRankIdx: index("Quest_requiredRank_idx").on(table.requiredRank),
      requiredLevelIdx: index("Quest_requiredLevel_idx").on(table.requiredLevel),
      requiredVillageIdx: index("Quest_requiredVillage_idx").on(table.requiredVillage),
    };
  },
);
export type Quest = InferSelectModel<typeof quest>;

export const questRelations = relations(quest, ({ one }) => ({
  village: one(village, {
    fields: [quest.requiredVillage],
    references: [village.id],
  }),
}));

export const questHistory = mysqlTable(
  "QuestHistory",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    questId: varchar("questId", { length: 191 }).notNull(),
    questType: mysqlEnum("questType", consts.QuestTypes).notNull(),
    startedAt: datetime("startedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    endAt: datetime("endedAt", { mode: "date", fsp: 3 }),
    completed: tinyint("completed").default(0).notNull(),
    previousCompletes: int("previousCompletes").default(0).notNull(),
  },
  (table) => {
    return {
      userIdIdx: index("QuestHistory_userId_idx").on(table.userId),
      questIdIdx: index("QuestHistory_questId_idx").on(table.questId),
      completedIdx: index("QuestHistory_completed_idx").on(table.completed),
    };
  },
);
export type QuestHistory = InferInsertModel<typeof questHistory>;
export type UserQuest = QuestHistory & { quest: Quest };

export const questHistoryRelations = relations(questHistory, ({ one }) => ({
  user: one(userData, {
    fields: [questHistory.userId],
    references: [userData.userId],
  }),
  quest: one(quest, {
    fields: [questHistory.questId],
    references: [quest.id],
  }),
}));

export const gameTimers = mysqlTable(
  "GameTimers",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    time: datetime("time", { mode: "date", fsp: 3 }).notNull(),
  },
  (table) => {
    return { name: index("name").on(table.name) };
  },
);

export const userLikes = mysqlTable(
  "UserLikes",
  {
    type: mysqlEnum("type", consts.SmileyEmotions).notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    imageId: varchar("imageId", { length: 191 }).notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
  },
  (table) => {
    return {
      userIdIdx: index("userLikes_userId_idx").on(table.userId),
      imageIdIdx: index("userLikes_imageId_idx").on(table.imageId),
    };
  },
);

export const conceptImage = mysqlTable(
  "ConceptImage",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    image: varchar("image", { length: 191 }),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    status: varchar("status", { length: 191 }).default("started").notNull(),
    hidden: tinyint("hidden").default(0).notNull(),
    // prompt schema
    prompt: varchar("prompt", { length: 5000 }).notNull(),
    negative_prompt: varchar("negative_prompt", { length: 5000 }).default("").notNull(),
    seed: int("seed").notNull().default(42),
    guidance_scale: int("guidance_scale").notNull().default(4),
    // References
    n_likes: int("n_likes").default(0).notNull(),
    n_loves: int("n_loves").default(0).notNull(),
    n_laugh: int("n_laugh").default(0).notNull(),
    n_comments: int("n_comments").default(0).notNull(),
    description: varchar("description", { length: 255 }),
    done: tinyint("done").default(0).notNull(),
  },
  (table) => {
    return {
      avatarKey: uniqueIndex("image_avatar_key").on(table.image),
      doneIdx: index("image_done_idx").on(table.done),
      userIdIdx: index("image_userId_idx").on(table.userId),
    };
  },
);
export type ContentImage = InferSelectModel<typeof conceptImage>;

export const likeRelations = relations(userLikes, ({ one }) => ({
  likes: one(conceptImage, {
    fields: [userLikes.imageId],
    references: [conceptImage.id],
  }),
}));

export const imageRelations = relations(conceptImage, ({ many, one }) => ({
  likes: many(userLikes),
  user: one(userData, {
    fields: [conceptImage.userId],
    references: [userData.userId],
  }),
}));

export const bankTransfers = mysqlTable(
  "BankTransfers",
  {
    senderId: varchar("senderId", { length: 191 }).notNull(),
    receiverId: varchar("receiverId", { length: 191 }).notNull(),
    amount: int("amount").notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
  },
  (table) => {
    return {
      senderIdIdx: index("BankTransfers_senderId_idx").on(table.senderId),
      receiverIdIdx: index("BankTransfers_receiverId_idx").on(table.receiverId),
    };
  },
);

export const bankTransferRelations = relations(bankTransfers, ({ one }) => ({
  sender: one(userData, {
    fields: [bankTransfers.senderId],
    references: [userData.userId],
  }),
  receiver: one(userData, {
    fields: [bankTransfers.receiverId],
    references: [userData.userId],
  }),
}));

export const badge = mysqlTable(
  "Badge",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    image: varchar("image", { length: 191 }).notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    description: varchar("description", { length: 500 }).notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
  },
  (table) => {
    return {
      nameKey: uniqueIndex("Badge_name_key").on(table.name),
    };
  },
);
export type Badge = InferSelectModel<typeof badge>;

export const userBadge = mysqlTable(
  "UserBadge",
  {
    userId: varchar("userId", { length: 191 }).notNull(),
    badgeId: varchar("badgeId", { length: 191 }).notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
  },
  (table) => {
    return {
      userIdIdx: index("UserBadge_userId_idx").on(table.userId),
      badgeIdIdx: index("UserBadge_badgeId_idx").on(table.badgeId),
    };
  },
);
export type UserBadge = InferSelectModel<typeof userBadge>;

export const userBadgeRelations = relations(userBadge, ({ one }) => ({
  badge: one(badge, {
    fields: [userBadge.badgeId],
    references: [badge.id],
  }),
  user: one(userData, {
    fields: [userBadge.userId],
    references: [userData.userId],
  }),
}));

export const userRequest = mysqlTable(
  "UserRequest",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    senderId: varchar("senderId", { length: 191 }).notNull(),
    receiverId: varchar("receiverId", { length: 191 }).notNull(),
    status: mysqlEnum("status", consts.UserRequestStates).notNull(),
    type: mysqlEnum("type", consts.UserRequestTypes).notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 })
      .default(sql`(CURRENT_TIMESTAMP(3))`)
      .notNull(),
  },
  (table) => {
    return {
      createdAtIdx: index("UserRequest_createdAt_idx").on(table.createdAt),
      challengerIdIdx: index("UserRequest_senderId_idx").on(table.senderId),
      challengedIdIdx: index("UserRequest_receiverId_idx").on(table.receiverId),
      typeIdx: index("UserRequest_type_idx").on(table.type),
    };
  },
);
export type UserRequest = InferSelectModel<typeof userRequest>;

export const userRequestRelations = relations(userRequest, ({ one }) => ({
  sender: one(userData, {
    fields: [userRequest.senderId],
    references: [userData.userId],
  }),
  receiver: one(userData, {
    fields: [userRequest.receiverId],
    references: [userData.userId],
  }),
}));

export const cpaLeadConversion = mysqlTable(
  "CpaLeadConversion",
  {
    id: varchar("id", { length: 191 }).primaryKey().notNull(),
    userId: varchar("userId", { length: 191 }).notNull(),
    campaignId: varchar("campaignId", { length: 191 }).notNull(),
    campaignName: varchar("campaignName", { length: 191 }).notNull(),
    payout: int("payout").notNull(),
    ipAddress: varchar("ipAddress", { length: 191 }).notNull(),
    gatewayId: varchar("gatewayId", { length: 191 }).notNull(),
    leadId: varchar("leadId", { length: 191 }).notNull(),
    countryIso: varchar("countryIso", { length: 10 }).notNull(),
    virtualCurrency: int("virtualCurrency").notNull(),
  },
  (table) => {
    return {
      userIdIdx: index("CpaLeadConversion_userId_idx").on(table.userId),
      campaignIdIdx: index("CpaLeadConversion_campaignId_idx").on(table.campaignId),
      leadIdIdx: index("CpaLeadConversion_leadId_idx").on(table.leadId),
    };
  },
);
