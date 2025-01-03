import { createAppTRPCContext } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { drizzleDB } from "@/server/db";

// Mock environment variables
process.env.NEXT_PUBLIC_PUSHER_APP_KEY = "test-key";
process.env.NEXT_PUBLIC_PUSHER_APP_CLUSTER = "test-cluster";
process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_NODE_ENV = "test";
process.env.NODE_ENV = "test";
process.env.PUSHER_APP_ID = "test-id";
process.env.PUSHER_APP_SECRET = "test-secret";
process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
process.env.CAPTCHA_SALT = "test-salt";

export async function createTestContext() {
  const ctx = await createAppTRPCContext({
    req: new Request("http://localhost:3000"),
    readHeaders: new Headers(),
    readCookies: {
      get: () => undefined,
      getAll: () => [],
    },
  });

  return {
    drizzle: ctx.drizzle,
    caller: appRouter.createCaller(ctx),
  };
}
