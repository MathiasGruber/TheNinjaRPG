import ConceptBox_ConceptImage from "./conceptimage";
import type { Metadata } from "next";

type Props = { params: { imageid: string } };

export function generateMetadata({ params }: Props): Metadata {
  // read route params
  const id = params.imageid;

  return {
    title: "TheNinja-RPG Concept Art",
    openGraph: {
      title: "TheNinja-RPG",
      description:
        "A free browser based game set in the ninja world of the Seichi. A multiplayer game with 2D travel and combat system",
      url: "https://www.theninja-rpg.com",
      siteName: "TheNinja-RPG",
      images: [
        {
          url: `https://www.theninja-rpg.com/api/og?imageid=${id}`,
          width: 512,
          height: 768,
          alt: "AI generated image",
        },
      ],
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "The Ninja-RPG.com - a free browser based mmorpg",
      description:
        "A free browser based game set in the ninja world of the Seichi. A multiplayer game with 2D travel and combat system",
      siteId: "137431404",
      creator: "@user",
      creatorId: "137431404",
      images: [`https://www.theninja-rpg.com/api/og?imageid=${id}`],
    },
  };
}

export default function ConceptArtImage({ params }: Props) {
  return <ConceptBox_ConceptImage imageid={params.imageid} back_href="/conceptart" />;
}
