import { and, eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { conceptImage } from "@/drizzle/schema";
import { indexableConceptArt } from "@/libs/conceptart";
import { drizzleDB } from "@/server/db";

// Route segment config
export const runtime = "nodejs";

// Image metadata
export const alt = "TheNinja-RPG Concept Art";

export const contentType = "image/png";

/**
 * Keep a fixed 1200x630 canvas to match the page's `summary_large_image` card,
 * with portrait artwork inside it, so social platforms do not crop or letterbox
 * the card to accommodate the source image's dimensions.
 */
export const size = { width: 1200, height: 630 };

const ARTWORK = { width: 394, height: 525 } as const;
const FALLBACK_LOGO =
  "https://uploadthing.b-cdn.net/f/10b0df72-5e27-4785-92ad-a63996127c85-hzez4j.png";

// Image generation
export default async function Image({
  params,
}: {
  params: Promise<{ imageid: string }>;
}) {
  // Await params as per Next.js 16 requirements
  const { imageid } = await params;

  // Get the image
  const image = await drizzleDB.query.conceptImage.findFirst({
    where: and(eq(conceptImage.id, imageid || ""), indexableConceptArt),
  });
  // Non-indexable artwork falls back to the logo card rather than exposing incomplete
  // or withdrawn media through a social preview.
  const source = image?.image;
  const url = source ? await loadArtwork(source) : null;

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        gap: 56,
        padding: 52,
        background: "linear-gradient(135deg, #1a1206 0%, #3b2607 55%, #ce7e00 100%)",
      }}
    >
      {url ? (
        <>
          {/* biome-ignore lint/performance/noImgElement: img is required for OpenGraph image generation */}
          <img
            width={ARTWORK.width}
            height={ARTWORK.height}
            src={url}
            alt=""
            style={{ borderRadius: 12, objectFit: "cover" }}
          />
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 580 }}>
            <div style={{ fontSize: 30, color: "#f7e2bd" }}>Concept Art</div>
            <div
              style={{
                fontSize: 62,
                fontWeight: 700,
                color: "#ffffff",
                marginTop: 12,
                lineHeight: 1.15,
              }}
            >
              TheNinja-RPG
            </div>
            <div style={{ fontSize: 27, color: "#f7e2bd", marginTop: 20 }}>
              AI generated art from the ninja world of Seichi
            </div>
          </div>
        </>
      ) : (
        // biome-ignore lint/performance/noImgElement: img is required for OpenGraph image generation
        <img width={512} height={130} src={FALLBACK_LOGO} alt="" />
      )}
    </div>,
    size,
  );
}

/**
 * Concept art is stored as WebP, which satori cannot decode reliably. Decode the
 * bytes here and hand satori a PNG data URI regardless of the stored URL's extension
 * or CDN optimizer configuration.
 *
 * Returns null on any failure so a broken source degrades to the branded card rather
 * than failing the whole image response.
 */
const loadArtwork = async (url: string) => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const png = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(ARTWORK.width, ARTWORK.height, { fit: "cover" })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
};
