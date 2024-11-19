"use client";

import { api } from "@/app/_trpc/client";
import Link from "next/link";
import AvatarImage from "@/layout/Avatar";
import ConceptImage from "@/layout/ConceptImage";
import ContentBox, { type ContentBoxProps } from "@/layout/ContentBox";
import Loader from "@/layout/Loader";

interface ConceptBox_ConceptImageProps
  extends Omit<ContentBoxProps, "title" | "subtitle" | "children"> {
  imageid?: string;
}

const ConceptBox_ConceptImage: React.FC<ConceptBox_ConceptImageProps> = (props) => {
  // Fetch data
  const { data: image, isFetching } = api.conceptart.get.useQuery(
    { id: props.imageid ?? "" },
    { enabled: !!props.imageid },
  );

  // Guard
  if (isFetching || !image) return <Loader explanation="Fetching image" />;

  // Render
  return (
    <ContentBox
      {...props}
      title="Concept Art"
      subtitle={`Created by ${image.user.username}`}
      topRightContent={
        image && (
          <div className="w-14">
            <Link href={`/users/${image.userId}`}>
              <AvatarImage
                href={image.user.avatar}
                alt={image.userId}
                size={100}
                hover_effect={true}
                priority
              />
            </Link>
          </div>
        )
      }
    >
      {image && <ConceptImage image={image} showDetails={true} />}
    </ContentBox>
  );
};

export default ConceptBox_ConceptImage;
