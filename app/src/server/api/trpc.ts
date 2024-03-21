/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1)
 * 2. You want to create a new middleware or type of procedure (see Part 3)
 *
 * tl;dr - this is where all the tRPC server stuff is created and plugged in.
 * The pieces you will need to use are documented accordingly near the end
 */

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API
 *
 * These allow you to access things like the database, the session, etc, when
 * processing a request
 *
 */
import { drizzleDB } from "@/server/db";
import type { CreateNextContextOptions } from "@trpc/server/adapters/next";

/**
 * This is the actual context you will use in your router. It will be used to process every request
 * that goes through your tRPC endpoint.
 *
 * @see https://trpc.io/docs/context
 */
export const createTRPCContext = (opts: CreateNextContextOptions) => {
  const { req } = opts;
  const sesh = getAuth(req);
  const userId = sesh.userId;
  // Get IP
  const ip = req.headers["x-forwarded-for"];
  const userIp = typeof ip === "string" ? ip.split(/, /)[0] : req.socket.remoteAddress;
  // Get agent
  const userAgent = req.headers["user-agent"];
  return {
    drizzle: drizzleDB,
    userIp,
    userId,
    userAgent,
  };
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { type TRPC_ERROR_CODE_KEY } from "@trpc/server/rpc";
import { getAuth } from "@clerk/nextjs/server";
import { z } from "zod";
import { ZodError } from "zod";

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { eq, sql } from "drizzle-orm";
import { userData } from "@/drizzle/schema";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(1, "10 s"),
  analytics: true,
  prefix: "trpc-ratelimit",
});

export const ratelimitMiddleware = t.middleware(async ({ ctx, path, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      message: `No user ID found for rate limit middleware`,
      code: "UNAUTHORIZED",
    });
  }
  const identifier = `${path}-${ctx.userId}`;
  const { success } = await ratelimit.limit(identifier);
  if (!success) {
    await ctx.drizzle
      .update(userData)
      .set({
        movedTooFastCount: sql`${userData.movedTooFastCount} + 1`,
        money: sql`${userData.money} * 0.99`,
        bank: sql`${userData.bank} * 0.99`,
      })
      .where(eq(userData.userId, ctx.userId));
    throw serverError(
      "TOO_MANY_REQUESTS",
      "You are acting too fast. Incident logged for review. 1% money reduced.",
    );
  }
  return next({ ctx: { userId: ctx.userId } });
});

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure;

const enforceUserIsAuthed = t.middleware(async ({ ctx, path, getRawInput, next }) => {
  if (!ctx.userId) {
    const rawInput = await getRawInput();
    throw new TRPCError({
      message: `Path: ${path}. Data: ${JSON.stringify(rawInput)}`,
      code: "UNAUTHORIZED",
      cause: rawInput,
    });
  }
  return next({ ctx: { userId: ctx.userId } });
});

export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);

/**
 * 4. EXPORTS
 */
export const serverError = (code: TRPC_ERROR_CODE_KEY, message: string) => {
  return new TRPCError({
    code,
    message,
  });
};

export const baseServerResponse = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type BaseServerResponse = z.infer<typeof baseServerResponse>;

export const errorResponse = (msg: string) => {
  return { success: false, message: msg };
};
