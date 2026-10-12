import { describe, expect, it, mock } from "bun:test";
import { launchCoopEncounter } from "@/server/utils/coop";

describe("shared co-op encounter launch", () => {
  it("starts only the winner of concurrent reservations", async () => {
    let reserved = false;
    const initiate = mock(async () => ({ success: true, message: "Started", battleId: "battle" }));
    const recover = mock(async () => {});
    const reserve = async () => { if (reserved) return false; reserved = true; return true; };
    const results = await Promise.all([1, 2].map(() => launchCoopEncounter({ reserve, initiate, recover })));
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(initiate).toHaveBeenCalledTimes(1);
    expect(recover).not.toHaveBeenCalled();
  });
  it("recovers a rejected initiation using its own reservation and preserves user feedback", async () => {
    let claim = "";
    const recover = mock(async (_id: string) => {});
    const rejection = { success: false, message: "A member moved" };
    const result = await launchCoopEncounter({ reserve: async (id) => { claim = id; return true; }, initiate: async () => rejection, recover });
    expect(result).toEqual(rejection);
    expect(recover).toHaveBeenCalledWith(claim);
  });
  it.each(["initiate", "publish"] as const)("compensates a failure during %s", async (stage) => {
    const recover = mock(async (_id: string) => {});
    const options = {
      reserve: async () => true,
      initiate: async () => { if (stage === "initiate") throw new Error("Injected failure"); return { success: true, message: "Started", battleId: "battle" }; },
      publish: async () => { if (stage === "publish") throw new Error("Injected failure"); },
      recover,
    };
    await expect(launchCoopEncounter(options)).rejects.toThrow("Injected failure");
    expect(recover).toHaveBeenCalledTimes(1);
  });
});
