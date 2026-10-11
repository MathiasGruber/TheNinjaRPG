import { DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry } from "three";
import { STATUS_LAYER } from "@/drizzle/constants";

export const createAggroHalo = (
  width: number,
  height: number,
  hasPortrait: boolean,
) => {
  const halo = new Group();
  halo.name = "aggro_halo";
  const size = height * (hasPortrait ? 1.08 : 1.75);
  halo.scale.set(size, size, 1);
  halo.position.set(width / 2, height * (hasPortrait ? 1 : 0.9), STATUS_LAYER);
  halo.visible = false;
  const track = new Mesh(
    ringGeometry(1),
    new MeshBasicMaterial({
      color: 0x252b26,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  const fill = new Mesh(
    ringGeometry(1),
    new MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  fill.name = "aggro_fill";
  track.renderOrder = 1;
  fill.renderOrder = 2;
  fill.position.z = 0.01;
  fill.userData.ratio = 1;
  halo.add(track, fill);
  return halo;
};

/** Replace the arc only when battle data changes, never on an unchanged render frame. */
export const updateAggroHalo = (halo: Group, ratio: number | undefined) => {
  // Nested groups otherwise reset transparent sorting ahead of their AI artwork.
  halo.renderOrder = halo.parent?.renderOrder ?? 0;
  halo.visible = ratio !== undefined;
  if (ratio === undefined) return;
  const fill = halo.getObjectByName("aggro_fill") as Mesh<RingGeometry>;
  const fraction = Math.max(0, Math.min(1, ratio));
  fill.visible = fraction > 0;
  if (fill.userData.ratio === fraction) return;
  fill.geometry.dispose();
  fill.geometry = ringGeometry(fraction);
  fill.userData.ratio = fraction;
};

const ringGeometry = (fraction: number) =>
  new RingGeometry(0.455, 0.5, 64, 1, Math.PI / 2, -Math.PI * 2 * fraction);
