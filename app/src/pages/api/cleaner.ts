import { TRPCError } from "@trpc/server";
import { lte, sql } from "drizzle-orm";
import { drizzleDB } from "@/server/db";
import { userData, battle, battleAction, dataBattleAction } from "@/drizzle/schema";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import type { NextApiRequest, NextApiResponse } from "next";

const cleanDatabase = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    // Step 1: Delete from battle table where updatedAt is older than 1 day
    await drizzleDB
      .delete(battle)
      .where(lte(battle.updatedAt, new Date(Date.now() - 1000 * 60 * 60 * 24)));

    // Step 2: Update users who are in battle where the battle no longer exists to be awake and not in battle
    await drizzleDB.execute(
      sql`UPDATE ${userData} a SET a.battleId=NULL, a.status="AWAKE", a.travelFinishAt=NULL WHERE NOT EXISTS (SELECT id FROM ${battle} b WHERE b.id = a.battleId)`
    );

    // Step 3: Delete from battle action where battles have been deleted
    await drizzleDB.execute(
      sql`DELETE FROM ${battleAction} a WHERE NOT EXISTS (SELECT id FROM ${battle} b WHERE b.id = a.battleId)`
    );

    // Step 4: Delete battle actions older than 7 days
    await drizzleDB
      .delete(dataBattleAction)
      .where(
        lte(dataBattleAction.createdAt, new Date(Date.now() - 1000 * 60 * 60 * 24 * 7))
      );

    res.status(200).json("OK");
  } catch (cause) {
    if (cause instanceof TRPCError) {
      // An error from tRPC occured
      const httpCode = getHTTPStatusCodeFromError(cause);
      return res.status(httpCode).json(cause);
    }
    // Another error occured
    console.error(cause);
    res.status(500).json({ message: "Internal server error" });
  }
};

export default cleanDatabase;
