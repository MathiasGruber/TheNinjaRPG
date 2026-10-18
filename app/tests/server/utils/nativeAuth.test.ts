import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { delimiter, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Redis } from "@upstash/redis";
import { createNativeAuthStore, nativeAuthChallenge } from "@/server/utils/nativeAuth";
import { nativeAuthExchangeSchema, nativeAuthStartSchema } from "@/validators/nativeAuth";

const which = (name: string) => process.env.PATH?.split(delimiter).map(dir => join(dir, name)).find(existsSync);
const binary = which("redis-server");
const cli = which("redis-cli");
const integration = binary && cli ? describe : describe.skip;

// This local adapter forwards the Upstash REST command format to an isolated real
// Redis process. The production Lua executes unchanged, including concurrent claims.
integration("native auth one-use PKCE store (real Redis)", () => {
  const socket = `/tmp/tnr-auth-${process.pid}.sock`;
  let processHandle: ChildProcess;
  let server: Server;
  let redis: Redis;
  let store: ReturnType<typeof createNativeAuthStore>;
  const command = (...args: string[]) => JSON.parse(execFileSync(cli!, ["-s", socket, "--json", ...args], { encoding: "utf8" }));

  beforeAll(async () => {
    processHandle = spawn(binary!, ["--port", "0", "--unixsocket", socket, "--save", "", "--appendonly", "no"], { stdio: "ignore" });
    const deadline = Date.now() + 3000;
    while (!existsSync(socket) && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
    if (!existsSync(socket)) throw new Error("Isolated Redis did not start");
    server = createServer((request, response) => {
      let body = "";
      request.on("data", chunk => { body += chunk; });
      request.on("end", () => {
        try {
          const args = JSON.parse(body) as unknown[];
          const raw = command(...args.map(String));
          const encode = (value: unknown): unknown => typeof value === "string"
            ? Buffer.from(value).toString("base64")
            : Array.isArray(value) ? value.map(encode) : value;
          const result = request.headers["upstash-encoding"] === "base64" && raw !== "OK" ? encode(raw) : raw;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ result }));
        } catch {
          response.writeHead(500, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "Local Redis command failed" }));
        }
      });
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    redis = new Redis({ url: `http://127.0.0.1:${port}`, token: "local-test-only", enableAutoPipelining: false });
    store = createNativeAuthStore(redis);
  });
  afterAll(() => { server?.closeAllConnections();
    server?.close(); processHandle?.kill(); });

  it("binds a flow to its proof, keeps the identity private, and preserves its expiry", async () => {
    const verifier = "v".repeat(43);
    const flow = await store.start("google", nativeAuthChallenge(verifier));
    expect(await store.describe(flow)).toEqual({ provider: "google" });
    expect(await store.redeem(flow, verifier, "z".repeat(43))).toBeNull();
    const code = await store.approve(flow, "user-one");
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await store.approve(flow, "user-one")).toBe(code);
    expect(await store.approve(flow, "user-two")).toBeNull();
    // Knowing the initiating flow and proof is insufficient: approval issues a new code.
    expect(await store.redeem(flow, verifier, "z".repeat(43))).toBeNull();
    const ttl = await redis.ttl(`native-auth:${flow}`);
    expect(ttl).toBeGreaterThan(590);
    expect(ttl).toBeLessThanOrEqual(600);
    expect(await store.redeem(flow, "x".repeat(43), code!)).toBeNull();
    expect(await store.redeem(flow, verifier, code!)).toBe("user-one");
    expect(await store.describe(flow)).toBeNull();
    expect(await store.redeem(flow, verifier, code!)).toBeNull();
  });

  it("allows exactly one of two concurrent redemptions", async () => {
    const verifier = "s".repeat(43);
    const flow = await store.start("discord", nativeAuthChallenge(verifier));
    const code = await store.approve(flow, "user-race");
    const results = await Promise.all([store.redeem(flow, verifier, code!), store.redeem(flow, verifier, code!)]);
    expect(results.filter(Boolean)).toEqual(["user-race"]);
    expect(results.filter(value => value === null)).toHaveLength(1);
  });

  it("does not revive an expired flow through approval or exchange", async () => {
    const verifier = "e".repeat(43);
    const flow = await store.start("facebook", nativeAuthChallenge(verifier));
    const code = await store.approve(flow, "user-expired");
    await redis.del(`native-auth:${flow}`);
    expect(await store.approve(flow, "user-expired")).toBeNull();
    expect(await store.redeem(flow, verifier, code!)).toBeNull();
  });
});

it("rejects unsupported providers, malformed proofs and extra credential fields", () => {
  expect(nativeAuthStartSchema.safeParse({ provider: "google", challenge: "a".repeat(43) }).success).toBe(true);
  expect(nativeAuthStartSchema.safeParse({ provider: "unknown", challenge: "a".repeat(43) }).success).toBe(false);
  expect(nativeAuthExchangeSchema.safeParse({ flowId: "a".repeat(43), verifier: "bad" }).success).toBe(false);
  expect(nativeAuthExchangeSchema.safeParse({ flowId: "a".repeat(43), verifier: "v".repeat(43), userId: "attacker" }).success).toBe(false);
});
