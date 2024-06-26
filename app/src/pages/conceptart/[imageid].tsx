import { api } from "@/utils/api";
import Link from "next/link";
import AvatarImage from "@/layout/Avatar";
import ConceptImage from "@/layout/ConceptImage";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import Head from "next/head";
import type { NextPage } from "next";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";

// eslint-disable-next-line @typescript-eslint/require-await
export const getServerSideProps: GetServerSideProps = async (context) => {
  return { props: { imageid: context.query.imageid } };
};

const ConceptArtImage: NextPage = ({
  imageid,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  // Cast imageid to string
  const imageId = imageid ? (imageid as string) : undefined;

  // Fetch data
  const { data: image, isFetching } = api.conceptart.get.useQuery(
    { id: imageId ?? "" },
    { staleTime: Infinity, enabled: !!imageId },
  );

  if (isFetching || !image) return <Loader explanation="Fetching image" />;

  return (
    <>
      <Head>
        <meta
          property="og:image"
          content={`https://www.theninja-rpg.com/api/og?imageid=${imageId}`}
        ></meta>
        <meta name="twitter:card" content="concept art generated by AI"></meta>
        <meta name="twitter:image:alt" content="TheNinja-RPG Concept Art"></meta>
        <meta
          name="twitter:image"
          content={`https://www.theninja-rpg.com/api/og?imageid=${imageId}`}
        ></meta>
      </Head>
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
    </>
  );
};

export default ConceptArtImage;
