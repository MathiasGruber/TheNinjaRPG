"use client";

import React, { useEffect } from "react";
import Image from "next/image";
import { Trash2, Flag, Info } from "lucide-react";
import { api } from "@/app/_trpc/client";
import { useUserData } from "@/utils/UserContext";
import { secondsPassed } from "@/utils/time";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ReportUser from "@/layout/Report";
import {
  IMG_ICON_FACEBOOK,
  IMG_ICON_REDDIT,
  IMG_ICON_TWITTER,
} from "@/drizzle/constants";
import { showMutationToast } from "@/libs/toast";
import type { ImageWithRelations } from "@/routers/conceptart";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  image: ImageWithRelations | undefined | null;
  showDetails?: boolean;
}

const ConceptImage: React.FC<InputProps> = (props) => {
  // Destructure props & state
  const { image, showDetails } = props;
  const { data: user } = useUserData();

  // tRPC Utility
  const utils = api.useUtils();

  // Convenience function for refetching data
  const refetch = () => {
    if (image) {
      void utils.conceptart.get.invalidate({ id: image.id });
    }
    void utils.conceptart.getAll.invalidate();
  };

  // Create a new image
  const { mutate: check, isPending: isChecking } = api.conceptart.check.useMutation({
    onSuccess: (data, variables) => {
      if (data && ["starting", "processing"].includes(data.status)) {
        setTimeout(() => {
          check({ id: variables.id });
        }, 3000);
      } else {
        refetch();
      }
    },
    onError: (error) => {
      console.error(error);
    },
  });

  // Toggle emotion a new image
  const { mutate: emotion } = api.conceptart.toggleEmotion.useMutation({
    onSuccess: (result) => {
      showMutationToast(result);
      refetch();
    },
  });

  // Delete image
  const { mutate: remove } = api.conceptart.delete.useMutation({
    onSuccess: (result) => {
      showMutationToast(result);
      refetch();
    },
  });

  // If the image is not loaded, check the status on the server
  useEffect(() => {
    if (!isChecking && image?.id && image.done === 0) {
      check({ id: image.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image?.id, image?.done]);

  // Return skeleton
  if (!image?.image || image.done === 0) {
    const secs = secondsPassed(image?.createdAt || new Date());
    if (image && secs > 20 && image.status === "starting") {
      image.status = "Starting cluster, this may take up to 1-5 minutes";
    }

    return (
      <div className="aspect-[256/345] w-full rounded-xl p-2 flex animate-pulse flex-row items-center justify-center bg-amber-500 text-center text-black">
        {image?.status}
      </div>
    );
  }

  // Show image
  const hasLike = image?.likes?.find(
    (like) => like.userId === user?.userId && like.type === "like",
  );
  const hasLove = image?.likes?.find(
    (like) => like.userId === user?.userId && like.type === "love",
  );
  const hasLaugh = image?.likes?.find(
    (like) => like.userId === user?.userId && like.type === "laugh",
  );

  // Social sharing
  const shareLink = `https://www.theninja-rpg.com/conceptart/${image.id}`;
  const shareTitle = "My%20Ninja%20Concept%20Art";

  return (
    <div>
      <div className="relative">
        <Image
          src={image.image}
          width={512}
          height={768}
          quality={100}
          unoptimized={true}
          placeholder="blur"
          blurDataURL="data:text/plain;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mPU0Mg4AwACvgGGUxJrcQAAAABJRU5ErkJggg=="
          alt={image.prompt || image.id}
          className="w-full cursor-pointer rounded-md"
        />
        <div className="absolute right-2 top-2">
          {image.userId === user?.userId && (
            <Trash2
              className={` cursor-pointer hover:fill-red-500 text-white ${
                showDetails ? "h-6 w-6" : "h-4 w-4"
              }`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                remove({ id: image.id });
              }}
            />
          )}
          {image.image && showDetails && (
            <ReportUser
              user={image.user}
              content={{
                id: image.id,
                title: "Purposefully inappropriate image",
                content: '<img src="' + image.image + '" width="200" />',
              }}
              system="concept_art"
              button={<Flag className="h-6 w-6 hover:text-orange-500 text-white" />}
            />
          )}
        </div>
        <div
          className={`absolute bottom-1 left-1 right-1 flex ${
            showDetails ? "h-12 text-lg" : "h-6 text-xs"
          } flex-row items-center rounded-md border border-slate-700 bg-slate-800 opacity-90 text-white`}
        >
          <div
            className={`flex cursor-pointer flex-row ml-1 px-1 ${
              hasLike ? "bg-slate-700" : ""
            }`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (user) emotion({ imageId: image.id, type: "like" });
            }}
          >
            ❤️ {image.n_likes}
          </div>
          <div
            className={`flex cursor-pointer flex-row px-1 ${
              hasLove ? "bg-slate-700" : ""
            }`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (user) emotion({ imageId: image.id, type: "love" });
            }}
          >
            👍 {image.n_loves}
          </div>
          <div
            className={`flex cursor-pointer flex-row px-1 ${
              hasLaugh ? "bg-slate-700" : ""
            }`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (user) emotion({ imageId: image.id, type: "laugh" });
            }}
          >
            🤣 {image.n_laugh}
          </div>
          <div className="grow"></div>
          {showDetails && (
            <>
              <a
                rel="nofollow"
                target="_blank"
                href={`https://www.facebook.com/dialog/share?app_id=327306013991565&href=${shareLink}&display=popup`}
              >
                <Image
                  className="hover:opacity-70"
                  src={IMG_ICON_FACEBOOK}
                  width={28}
                  height={28}
                  alt={"FacebookShare"}
                ></Image>
              </a>
              <a
                rel="nofollow"
                target="_blank"
                href={`https://www.reddit.com/submit?url=${shareLink}&title=${shareTitle}`}
              >
                <Image
                  className="hover:opacity-70"
                  src={IMG_ICON_REDDIT}
                  width={28}
                  height={28}
                  alt={"RedditShare"}
                ></Image>
              </a>
              <a
                rel="nofollow"
                target="_blank"
                href={`https://twitter.com/intent/tweet?url=${shareLink}&text=${shareTitle}&via=TheNinjaRPG&related=TNR&hashtags=TheNinjaRPG`}
              >
                <Image
                  className="hover:opacity-70"
                  src={IMG_ICON_TWITTER}
                  width={28}
                  height={28}
                  alt={"TwitterShare"}
                ></Image>
              </a>

              <TooltipProvider delayDuration={50}>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-8 w-8 mr-2 cursor-pointer hover:text-orange-500" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      <b>Created by: </b>
                      {image.user?.username}
                    </p>
                    <p className="mt-2">
                      <b>Prompt: </b>
                      {image.prompt}
                    </p>
                    {image.negative_prompt && (
                      <p>
                        <b>Negative Prompt: </b>
                        {image.negative_prompt}
                      </p>
                    )}
                    <p className="mt-2">
                      <b>Seed: </b>
                      {image.seed}
                    </p>
                    <p>
                      <b>CFG: </b>
                      {image.guidance_scale}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* <div className="group">
                <Info className="h-8 w-8 mr-2 cursor-pointer hover:text-orange-500" />
                <span className="absolute bottom-8 right-0 z-50 rounded-md bg-gray-800 p-2 text-sm text-gray-100 opacity-0 transition-opacity group-hover:opacity-100">
                  <p>
                    <b>Created by: </b>
                    {image.user?.username}
                  </p>
                  <p className="mt-2">
                    <b>Prompt: </b>
                    {image.prompt}
                  </p>
                  {image.negative_prompt && (
                    <p>
                      <b>Negative Prompt: </b>
                      {image.negative_prompt}
                    </p>
                  )}
                  <p className="mt-2">
                    <b>Seed: </b>
                    {image.seed}
                  </p>
                  <p>
                    <b>CFG: </b>
                    {image.guidance_scale}
                  </p>
                </span>
              </div> */}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConceptImage;
