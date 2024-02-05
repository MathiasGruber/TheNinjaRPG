import { TextureLoader, Texture, sRGBEncoding, SRGBColorSpace } from "three";

/**
 * Load texture from file
 */
export const loadTexture = (path: string) => {
  const texture = new TextureLoader().load(path);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

/**
 * Create texture from canvas
 */
export const createTexture = (canvas: HTMLCanvasElement) => {
  const texture = new Texture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};
