import { TextureLoader, Texture, sRGBEncoding } from "three";

/**
 * Load texture from file
 */
export const loadTexture = (path: string) => {
  const texture = new TextureLoader().load(path);
  texture.encoding = sRGBEncoding;
  return texture;
};

/**
 * Create texture from canvas
 */
export const createTexture = (canvas: HTMLCanvasElement) => {
  const texture = new Texture(canvas);
  texture.encoding = sRGBEncoding;
  return texture;
};
