import { createHash, randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";
import type { NativeAuthProvider } from "@/validators/nativeAuth";

const FLOW_TTL_SECONDS = 600;
const key = (flowId: string) => `native-auth:${flowId}`;
type Flow = {
  provider: NativeAuthProvider;
  challenge: string;
  userId?: string;
  code?: string;
};

/** Browser cookies stay in the browser; the shell proves ownership with PKCE. */
export const nativeAuthChallenge = (verifier: string) =>
  createHash("sha256").update(verifier).digest("base64url");

// Approval cannot replace a different approved identity or extend the flow's lifetime.
const APPROVE = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local flow = cjson.decode(raw)
if flow.userId and flow.userId ~= ARGV[1] then return nil end
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then return nil end
flow.userId = ARGV[1]
flow.code = flow.code or ARGV[2]
redis.call('SET', KEYS[1], cjson.encode(flow), 'PX', ttl)
return flow.code
`;

// A wrong proof must not consume somebody else's flow. Valid redemption is atomic.
const REDEEM = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local flow = cjson.decode(raw)
if flow.challenge ~= ARGV[1] or flow.code ~= ARGV[2] or not flow.userId then return nil end
redis.call('DEL', KEYS[1])
return flow.userId
`;

export const createNativeAuthStore = (redis: Redis) => ({
  async start(provider: NativeAuthProvider, challenge: string) {
    const flowId = randomBytes(32).toString("base64url");
    const saved = await redis.set(
      key(flowId),
      { provider, challenge },
      {
        nx: true,
        ex: FLOW_TTL_SECONDS,
      },
    );
    if (!saved) throw new Error("Unable to start sign-in. Please try again.");
    return flowId;
  },
  async describe(flowId: string) {
    const flow = await redis.get<Flow>(key(flowId));
    return flow ? { provider: flow.provider } : null;
  },
  async approve(flowId: string, userId: string) {
    // The starter knows the flow and verifier, so approval must issue a NEW code
    // delivered only through the browser callback. Otherwise a starter could trick
    // another browser into approval and poll exchange before its app receives a link.
    const code = randomBytes(32).toString("base64url");
    return redis.eval<[string, string], string | null>(
      APPROVE,
      [key(flowId)],
      [userId, code],
    );
  },
  async redeem(flowId: string, verifier: string, code: string) {
    return redis.eval<[string, string], string | null>(
      REDEEM,
      [key(flowId)],
      [nativeAuthChallenge(verifier), code],
    );
  },
});

let store: ReturnType<typeof createNativeAuthStore> | undefined;
export const nativeAuthStore = () => (store ??= createNativeAuthStore(Redis.fromEnv()));
