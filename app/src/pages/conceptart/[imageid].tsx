import { useRouter } from "next/router";
import { api } from "@/utils/api";
import { useUserData } from "@/utils/UserContext";
import Link from "next/link";
import AvatarImage from "@/layout/Avatar";
import ConceptImage from "@/layout/ConceptImage";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";

import type { NextPage } from "next";

const ConceptArtImage: NextPage = () => {
  // State
  const { data: userData } = useUserData();

  // Any specific image in router?
  const router = useRouter();
  const imageId = router.query.imageid as string | undefined;

  // Fetch data
  const { data: image, isFetching } = api.conceptart.get.useQuery(
    { id: imageId ?? "" },
    { staleTime: Infinity, enabled: !!imageId }
  );

  if (!userData) return <Loader explanation="Loading userdata" />;
  if (isFetching || !image) return <Loader explanation="Fetching image" />;

  return (
    <ContentBox
      title="Concept Art"
      subtitle={`Created by ${image.user.username}`}
      back_href="/conceptart"
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

export default ConceptArtImage;
