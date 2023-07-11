import { type NextPage } from "next";
import { useState } from "react";
import ContentBox from "../layout/ContentBox";
import Button from "../layout/Button";
import AvatarImage from "../layout/Avatar";
import Loader from "../layout/Loader";
import Confirm from "../layout/Confirm";
import { api } from "../utils/api";
import { show_toast } from "../libs/toast";
import { useRequiredUserData } from "../utils/UserContext";
import { useInfinitePagination } from "../libs/pagination";
import { capitalizeFirstLetter } from "../utils/sanitize";

const Avatar: NextPage = () => {
  // Queries & mutations
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const { data: userData, refetch: refetchUserData } = useRequiredUserData();
  // Fetch historical avatars query
  const {
    data: historicalAvatars,
    refetch: refetchHistoricalAvatars,
    fetchNextPage,
    hasNextPage,
  } = api.avatar.getHistoricalAvatars.useInfiniteQuery(
    {
      limit: 20,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
      staleTime: Infinity,
    }
  );
  const pageAvatars = historicalAvatars?.pages.map((page) => page.data).flat();

  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  // Update avatar mutation
  const updateAvatar = api.avatar.updateAvatar.useMutation({
    onMutate: () => {
      setLoading(true);
    },
    onSuccess: async () => {
      await refetchUserData();
    },
    onError: (error) => {
      show_toast("Error changing avatar", error.message, "error");
    },
    onSettled: () => {
      setLoading(false);
    },
  });
  // Create new avatar mutation
  const createAvatar = api.avatar.createAvatar.useMutation({
    onMutate: () => {
      setLoading(true);
    },
    onSuccess: async () => {
      await refetchUserData();
      await refetchHistoricalAvatars();
    },
    onError: (error) => {
      show_toast("Error creating avatar", error.message, "error");
    },
    onSettled: () => {
      setLoading(false);
    },
  });
  const userAttributes = api.profile.getUserAttributes.useQuery(undefined, {
    staleTime: Infinity,
  });
  if (!userData || loading) {
    return <Loader explanation="Creating avatar..." />;
  }
  return (
    <>
      <ContentBox
        title="Change Avatar"
        subtitle="AI generates the avatar for your character. "
      >
        <div className="flex">
          <div className="basis-1/2">
            {userData && (
              <AvatarImage
                href={userData.avatar}
                alt={userData.username}
                refetchUserData={refetchUserData}
                size={512}
                priority
              />
            )}
          </div>
          <div className="basis-1/2">
            <h2 className="font-bold">Current Attributes</h2>
            <ul className="ml-5 list-disc">
              <li key="rank">
                {userData?.rank ? capitalizeFirstLetter(userData.rank) : ""}
              </li>
              {userAttributes.data?.map((attribute) => (
                <li key={attribute.id}>{attribute.attribute}</li>
              ))}
            </ul>
            <h2 className="mt-5 font-bold">Create a new avatar</h2>

            {userData?.reputationPoints > 0 ? (
              <>
                <p className="italic">- Costs 1 reputation point</p>
                <Confirm
                  title="Confirm Avatar Change"
                  button={<Button id="create" label="New Avatar" />}
                  onAccept={(e) => {
                    e.preventDefault();
                    createAvatar.mutate();
                  }}
                >
                  Changing your avatar will cost 1 reputation point. We would love to
                  enable unlimited re-creations, but the model generating the avatars
                  runs on NVidia A100 GPU cluster, and each generation costs a little
                  bit of money. We are working on a solution to make this free, but for
                  now, we need to charge a small fee to cover the cost of the GPU
                  cluster.
                </Confirm>
              </>
            ) : (
              <p className="text-red-500">Requires 1 reputation point</p>
            )}
          </div>
        </div>
      </ContentBox>
      {pageAvatars && (
        <>
          <br />
          <ContentBox
            title="Previous Avatars"
            subtitle="You can revert to previous avatars if you don't like the current one."
          >
            <div className="flex flex-wrap">
              {pageAvatars.map((avatar, i) => (
                <div
                  key={avatar.id}
                  className=" my-2 basis-1/4"
                  onClick={() => updateAvatar.mutate({ avatar: avatar.id })}
                  ref={i === pageAvatars.length - 1 ? setLastElement : null}
                >
                  <AvatarImage
                    href={avatar.avatar}
                    alt={userData.username}
                    hover_effect={true}
                    size={200}
                  />
                </div>
              ))}
            </div>
          </ContentBox>
        </>
      )}
    </>
  );
};

export default Avatar;
