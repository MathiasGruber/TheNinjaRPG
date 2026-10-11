import { scrypt as deriveKey, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { inArray, sql } from "drizzle-orm";
import { parentalControl } from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";

const scrypt = promisify(deriveKey);
export const hashParentalPin = async (pin: string) => {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(pin, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
};
export const verifyParentalPin = async (pin: string, stored: string) => {
  const [salt, encoded] = stored.split(":");
  if (!salt || !encoded) return false;
  const hash = (await scrypt(pin, salt, 64)) as Buffer;
  const expected = Buffer.from(encoded, "hex");
  return expected.length === hash.length && timingSafeEqual(expected, hash);
};
export const fetchCommunicationPolicies = (client: DrizzleClient, ids: string[]) =>
  client.query.parentalControl.findMany({
    where: inArray(parentalControl.userId, [...new Set(ids)]),
    columns: {
      userId: true,
      enabled: true,
      tavernDisabled: true,
      privateMessages: true,
      approvedUserIds: true,
    },
  });

/** Replace complete JSON string tokens so administrative identity moves retain approvals. */
export const renameParentalContact = (
  client: DrizzleClient,
  oldId: string,
  newId: string,
) =>
  client
    .update(parentalControl)
    .set({
      approvedUserIds: sql`CAST(REPLACE(CAST(${parentalControl.approvedUserIds} AS CHAR), ${JSON.stringify(oldId)}, ${JSON.stringify(newId)}) AS JSON)`,
      version: sql`${parentalControl.version} + 1`,
    })
    .where(
      sql`JSON_CONTAINS(${parentalControl.approvedUserIds}, ${JSON.stringify(oldId)})`,
    );
