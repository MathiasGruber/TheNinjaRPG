import { TRPCError } from "@trpc/server";
import { eq, and, lte, sql } from "drizzle-orm";
import { createTRPCContext } from "../../server/api/trpc";
import { userData, battle, battleAction } from "../../../drizzle/schema";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import type { NextApiRequest, NextApiResponse } from "next";

const cleanDatabase = async (req: NextApiRequest, res: NextApiResponse) => {
  // Create context and caller
  const ctx = createTRPCContext({ req, res });
  try {
    // Step 1: Delete from battle table where updatedAt is older than 1 day
    await ctx.drizzle
      .delete(battle)
      .where(lte(battle.updatedAt, new Date(Date.now() - 1000 * 60 * 60 * 24)));

    // Step 2: Update users who are in battle where the battle no longer exists to be awake and not in battle
    await ctx.drizzle.execute(
      sql`UPDATE ${userData} a SET a.battleId=NULL, a.status="AWAKE", a.travelFinishAt=NULL WHERE NOT EXISTS (SELECT id FROM ${battle} b WHERE b.id = a.battleId)`
    );

    // Step 3: Delete from battle action where battles have been deleted
    await ctx.drizzle.execute(
      sql`DELETE FROM ${battleAction} a WHERE NOT EXISTS (SELECT id FROM ${battle} b WHERE b.id = a.battleId)`
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
