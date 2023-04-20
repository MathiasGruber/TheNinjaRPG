import { TextureLoader, type Scene, Group, SpriteMaterial, Sprite } from "three";

/**
 * Creates heaxognal grid & draw it using js. Return groups of objects drawn
 */
export const drawActionTimer = (screenWidth: number) => {
  const group = new Group();
  // Set scene background
  const bg_texture = new TextureLoader().load(`/combat/actionTimer/background.webp`);
  const bg_material = new SpriteMaterial({ map: bg_texture });
  const bg_sprite = new Sprite(bg_material);
  bg_sprite.scale.set(768, 62, 1);
  bg_sprite.position.set(screenWidth / 2, 10, -1);
  group.add(bg_sprite);
  return group;
};
