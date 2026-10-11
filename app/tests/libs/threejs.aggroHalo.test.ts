import { describe, expect, it } from "bun:test";
import type { Mesh, RingGeometry } from "three";
import { createAggroHalo, updateAggroHalo } from "@/libs/threejs/aggroHalo";

describe("aggro halo updates", () => {
  it("keeps geometry on unchanged frames and disposes it when the ratio changes", () => {
    const halo = createAggroHalo(20, 20, true);
    const fill = halo.getObjectByName("aggro_fill") as Mesh<RingGeometry>;
    const initial = fill.geometry;
    let disposed = false;
    initial.addEventListener("dispose", () => { disposed = true; });
    updateAggroHalo(halo, 1);
    expect(fill.geometry).toBe(initial);
    updateAggroHalo(halo, 0.5);
    expect(disposed).toBe(true);
    expect(fill.geometry.parameters.thetaLength).toBe(-Math.PI);
    const half = fill.geometry;
    updateAggroHalo(halo, 0.5);
    expect(fill.geometry).toBe(half);
  });

  it("hides the fill for zero aggro and the whole halo when disabled", () => {
    const halo = createAggroHalo(20, 20, true);
    const fill = halo.getObjectByName("aggro_fill") as Mesh<RingGeometry>;
    updateAggroHalo(halo, 0);
    expect(halo.visible).toBe(true);
    expect(fill.visible).toBe(false);
    updateAggroHalo(halo, undefined);
    expect(halo.visible).toBe(false);
    updateAggroHalo(halo, 0.5);
    expect(halo.visible).toBe(true);
    expect(fill.visible).toBe(true);
  });
});
