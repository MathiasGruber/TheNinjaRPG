import { afterEach, expect, it, vi } from "bun:test";
import type { DrizzleClient } from "@/server/db";
import { fetchPublicQuestLocations } from "@/server/utils/mapLocations";
import { MoveToObjective } from "@/validators/objectives";

afterEach(() => vi.restoreAllMocks());

it("refetches when a remote edit happened during the cached read", async () => {
  let now = 1000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const findMany = vi.fn().mockImplementationOnce(async () => {
    // The snapshot predates the remote edit at 2000, but its response arrives later.
    now = 3000;
    return [{
      id: "public", hidden: false, startsAt: null, endsAt: null,
      content: { objectives: [MoveToObjective.parse({
        id: "tower", task: "move_to_location", sector: 724, longitude: 3, latitude: 4,
        structureAssetId: "asset", locationName: "Tower", locationDescription: "An old tower.",
      })] },
    }];
  }).mockResolvedValue([]);
  const client = { query: { quest: { findMany } } } as unknown as DrizzleClient;

  expect(await fetchPublicQuestLocations(client)).toHaveLength(1);
  expect(await fetchPublicQuestLocations(client, { revision: 2000 })).toEqual([]);
  expect(findMany).toHaveBeenCalledTimes(2);
});
