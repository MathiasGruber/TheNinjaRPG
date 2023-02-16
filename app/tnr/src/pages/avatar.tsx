import { useEffect } from "react";
import { useRef, useCallback } from "react";
import { type NextPage } from "next";
import { useState } from "react";
import ContentBox from "../layout/ContentBox";
import Button from "../layout/Button";
import AvatarImage from "../layout/Avatar";
import Loader from "../layout/Loader";
import Modal from "../layout/Modal";
import { api } from "../utils/api";
import { show_toast } from "../libs/toast";
import { useRequiredUser } from "../utils/UserContext";

const Avatar: NextPage = () => {
  // Queries & mutations
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const [page, setPage] = useState(0);
  const [showModel, setShowModel] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const { data: userData, refetch: refetchUserData } = useRequiredUser();
  // Fetch historical avatars query
  const avatarLimit = 10;
  const {
    data: historicalAvatars,
    fetchNextPage,
    hasNextPage,
  } = api.avatar.getHistoricalAvatars.useInfiniteQuery(
    {
      limit: avatarLimit,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
    }
  );
  const pageAvatars = historicalAvatars?.pages.map((page) => page.data).flat();
  // Infinite scroll for fetching avatars
  // Setup observer with intersectionobsever initially
  const observer = useRef<IntersectionObserver | null>();
  useEffect(() => {
    observer.current = new IntersectionObserver((entries) => {
      const first = entries[0];
      if (first && first.isIntersecting) {
        setPage((prev) => prev + 1);
      }
    });
  }, []); // do this only once, on mount

  useEffect(() => {
    const fetchData = async () => {
      await fetchNextPage();
    };
    if (hasNextPage) {
      fetchData().catch(() => {
        show_toast(
          "Error fetching avatars",
          "Error fetching next batch of avatars",
          "error"
        );
      });
    }
  }, [page, hasNextPage, fetchNextPage]);
  useEffect(() => {
    if (lastElement && observer.current) {
      observer.current.observe(lastElement);
    }
    return () => {
      if (lastElement && observer.current) {
        observer.current.unobserve(lastElement);
      }
    };
  }, [lastElement]);
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
    },
    onError: (error) => {
      show_toast("Error creating avatar", error.message, "error");
    },
    onSettled: () => {
      setLoading(false);
    },
  });
  const userAttributes = api.profile.getUserAttributes.useQuery();
  if (!userData || loading) {
    return <Loader explanation="Creating avatar..." />;
  }
  return (
    <>
      <ContentBox
        title="Change Avatar"
        subtitle="AI generates the avatar for your character. "
      >
        {showModel && (
          <Modal
            title="Confirm Avatar Change"
            message="Changing your avatar will cost 1 popularity point. We would love to enable unlimited re-creations, but the model generating the avatars runs on NVidia A100 GPU cluster, and each generation costs a little bit of money. We are working on a solution to make this free, but for now, we need to charge a small fee to cover the cost of the GPU cluster."
            onAccept={() => {
              createAvatar.mutate();
              setShowModel(false);
            }}
            setIsOpen={setShowModel}
            buttons={
              <Button
                id="create"
                label="New Avatar (1 popularity point)"
                onClick={() => {
                  createAvatar.mutate();
                }}
              />
            }
          />
        )}
        <div className="flex">
          <div className="basis-1/2">
            {userData && (
              <AvatarImage
                href={userData?.avatar}
                alt={userData?.username}
                size={512}
                priority
              />
            )}
          </div>
          <div className="basis-1/2">
            <h2 className="font-bold">Current Attributes</h2>
            <ul className="ml-5 list-disc">
              <li key="rank">{userData?.rank}</li>
              {userAttributes.data?.map((attribute) => (
                <li key={attribute.id}>{attribute.attribute}</li>
              ))}
            </ul>
            <h2 className="mt-5 font-bold">Create a new avatar</h2>

            {userData?.popularity_points > 0 ? (
              <>
                <p className="italic">- Costs 1 popularity point</p>
                <Button
                  id="create"
                  label="New Avatar"
                  onClick={() => {
                    setShowModel(true);
                  }}
                />
              </>
            ) : (
              <p className="text-red-500">Requires 1 popularity point</p>
            )}
          </div>
        </div>
      </ContentBox>
      {pageAvatars && (
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
                  alt={userData?.username}
                  size={200}
                />
              </div>
            ))}
          </div>
        </ContentBox>
      )}
    </>
  );
};

export default Avatar;
