/**
 * Registered via bunfig.toml: brings the shared test database up once per `bun test` run.
 * No-ops when TEST_MYSQL_URL is unset.
 *
 * The schema is left in place afterwards. `prepareTestDatabase` reconciles it on the next run
 * and truncates every table, so a leftover database makes the next run cheaper without letting
 * its rows leak into it.
 */
import { afterAll, beforeAll } from "bun:test";
import * as dialog from "@/components/ui/dialog";
import Modal from "@/layout/Modal";
import ItemWithEffects from "@/layout/ItemWithEffects";
import {
  closeTestDatabase,
  hasTestDatabase,
  prepareTestDatabase,
} from "./testDatabase";
// Bun preserves loaded exports when a suite supplies a partial module mock.
// Load the toast module before any suite can hide exports needed by another suite.
import "@/libs/toast";

// UI suites can restore real components after another suite mocks their module.
export const actualDialog = { ...dialog };
export const actualModal = Modal;
export const actualItemWithEffects = ItemWithEffects;

if (hasTestDatabase) {
  // Reconciling the schema is slower than a unit test's default budget.
  beforeAll(async () => {
    await prepareTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await closeTestDatabase();
  }, 60_000);
}
