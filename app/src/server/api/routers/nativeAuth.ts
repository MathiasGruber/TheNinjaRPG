import { clerkClient } from "@clerk/nextjs/server";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { nativeAuthStore } from "@/server/utils/nativeAuth";
import {
  nativeAuthExchangeSchema,
  nativeAuthFlowSchema,
  nativeAuthStartSchema,
} from "@/validators/nativeAuth";

const expired = () =>
  new TRPCError({
    code: "BAD_REQUEST",
    message: "Sign-in expired or was already used. Return to the app and try again.",
  });

export const nativeAuthRouter = createTRPCRouter({
  start: publicProcedure.input(nativeAuthStartSchema).mutation(async ({ input }) => ({
    flowId: await nativeAuthStore().start(input.provider, input.challenge),
  })),
  describe: publicProcedure.input(nativeAuthFlowSchema).query(async ({ input }) => {
    const flow = await nativeAuthStore().describe(input.flowId);
    if (!flow) throw expired();
    return flow;
  }),
  // Use the rate-limited procedure here as well: issuing app sessions is not a game action.
  approve: publicProcedure
    .input(nativeAuthFlowSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId)
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in first." });
      const code = await nativeAuthStore().approve(input.flowId, ctx.userId);
      if (!code) throw expired();
      return { callbackUrl: `tnr://oauth-callback?flow=${input.flowId}&code=${code}` };
    }),
  exchange: publicProcedure
    .input(nativeAuthExchangeSchema)
    .mutation(async ({ input }) => {
      const userId = await nativeAuthStore().redeem(
        input.flowId,
        input.verifier,
        input.code,
      );
      if (!userId) throw expired();
      // No ticket crosses the browser/deep-link boundary. Only the initiating shell can
      // redeem the proof, and Clerk's short-lived ticket can be consumed only once.
      const clerk = await clerkClient();
      const token = await clerk.signInTokens.createSignInToken({
        userId,
        expiresInSeconds: 60,
      });
      return { ticket: token.token };
    }),
});
