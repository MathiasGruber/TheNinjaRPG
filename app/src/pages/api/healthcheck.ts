import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { drizzleDB } from "@/server/db";
import type { NextApiRequest, NextApiResponse } from "next";

const getFirstUser = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const user = await drizzleDB.query.userData.findFirst({
      columns: { username: true },
    });
    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }
    res.status(200).json(user);
  } catch (cause) {
    if (cause instanceof TRPCError) {
      const httpCode = getHTTPStatusCodeFromError(cause);
      return res.status(httpCode).json(cause);
    }
    console.error(cause);
    res.status(500).json({ message: "Internal server error" });
  }
};

export default getFirstUser;
