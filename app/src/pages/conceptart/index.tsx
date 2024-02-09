import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import ContentBox from "@/layout/ContentBox";
import SelectField from "@/layout/SelectField";
import ConceptImage from "@/layout/ConceptImage";
import Confirm from "@/layout/Confirm";
import Button from "@/layout/Button";
import InputField from "@/layout/InputField";
import { useSafePush } from "@/utils/routing";
import { api } from "@/utils/api";
import { conceptArtPromptSchema, conceptArtFilterSchema } from "@/validators/art";
import { sortOptions, timeFrame } from "@/validators/art";
import { SparklesIcon, UserIcon } from "@heroicons/react/24/solid";
import { useUserData } from "@/utils/UserContext";
import { show_toast } from "@/libs/toast";
import { useInfinitePagination } from "@/libs/pagination";
import type { NextPage } from "next";
import type { ConceptPromptType, ConceptFilterType } from "@/validators/art";

const ConceptArt: NextPage = () => {
  // State
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const { data: userData } = useUserData();

  // Routing
  const router = useSafePush();

  // tRPC Utility
  const utils = api.useUtils();

  // Form handling - filter
  const filterForm = useForm<ConceptFilterType>({
    defaultValues: conceptArtFilterSchema.parse({}),
    resolver: zodResolver(conceptArtFilterSchema),
  });

  // Form handling - prompt
  const promptForm = useForm<ConceptPromptType>({
    defaultValues: conceptArtPromptSchema.parse({}),
    resolver: zodResolver(conceptArtPromptSchema),
  });

  // Create a new image
  const { mutate: create, isLoading } = api.conceptart.create.useMutation({
    onSuccess: async (id) => {
      promptForm.setValue("prompt", "");
      promptForm.setValue("negative_prompt", "");
      filterForm?.setValue("only_own", true);
      filterForm?.setValue("sort", "Most Recent");
      await router.push(`/conceptart/${id}`);
      await utils.conceptart.getAll.refetch();
      await utils.profile.getUser.refetch();
    },
    onError: (error) => {
      console.log(error);
    },
  });

  // Filters
  const only_own = filterForm.watch("only_own");
  const sort = filterForm.watch("sort");
  const time_frame = filterForm.watch("time_frame");

  // Fetch data
  const { data, fetchNextPage, hasNextPage } = api.conceptart.getAll.useInfiniteQuery(
    { only_own, sort, time_frame, limit: 50 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
      staleTime: Infinity,
    },
  );
  const allImage = data?.pages
    .map((page) => page.data)
    .flat()
    .sort((a, b) => {
      if (sort === "Most Recent") {
        return b.createdAt.getTime() - a.createdAt.getTime();
      } else if (sort === "Most Liked") {
        return b.sumReaction - a.sumReaction;
      }
      return 1;
    });
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  // Handle form submit
  const handleCreateNew = promptForm.handleSubmit(
    (data) => {
      if (userData) {
        if (userData.reputationPoints > 0) {
          if (!isLoading) create(data);
        } else {
          show_toast("ConceptArt Error", "No reputation points left.", "error");
        }
      }
    },
    (errors) => console.log(errors),
  );

  return (
    <ContentBox
      title="Concept Art"
      subtitle="Create AI art"
      topRightCorntentBreakpoint="sm"
      topRightContent={
        <div className="flex flex-row items-center">
          <UserIcon
            className={`h-8 w-8 mr-1 ${only_own ? "fill-orange-500" : ""}`}
            onClick={() => filterForm.setValue("only_own", !only_own)}
          />
          <SelectField
            id="filter"
            onChange={(e) =>
              filterForm.setValue(
                "sort",
                e.target.value as (typeof sortOptions)[number],
              )
            }
          >
            {sortOptions.map((value) => {
              return (
                <option key={value} value={value}>
                  {value}
                </option>
              );
            })}
          </SelectField>
          <SelectField
            id="filter"
            onChange={(e) =>
              filterForm.setValue(
                "time_frame",
                e.target.value as (typeof timeFrame)[number],
              )
            }
          >
            {timeFrame.map((value) => {
              return (
                <option key={value} value={value}>
                  {value}
                </option>
              );
            })}
          </SelectField>
          {userData && (
            <Confirm
              title="Create New"
              button={
                <Button
                  id="new-art"
                  label="New"
                  paddingClass="p-2"
                  image={<SparklesIcon className="mr-2 h-6 w-6" />}
                />
              }
              proceed_label="Create"
              onAccept={handleCreateNew}
            >
              <div className="flex flex-col gap-1">
                <p className="pb-3 italic">
                  Input the prompt you want to use for your creation. Note that each
                  submission costs 1 reputation point! You currently have{" "}
                  {userData.reputationPoints} reputation points.
                </p>
                <InputField
                  id="prompt"
                  label="Prompt"
                  register={promptForm.register}
                  error={promptForm.formState.errors.prompt?.message}
                />
                <InputField
                  id="negative_prompt"
                  label="Negative Prompt"
                  register={promptForm.register}
                  error={promptForm.formState.errors.negative_prompt?.message}
                />
                <div className="flex flex-row">
                  <InputField
                    id="guidance_scale"
                    type="number"
                    label="Guidance Scale"
                    register={promptForm.register}
                    error={promptForm.formState.errors.guidance_scale?.message}
                  />
                  <InputField
                    id="seed"
                    type="number"
                    label="Seed Value"
                    register={promptForm.register}
                    error={promptForm.formState.errors.seed?.message}
                  />
                </div>
              </div>
            </Confirm>
          )}
        </div>
      }
    >
      <div className="relative grid w-full grow grid-cols-2 sm:grid-cols-3 md:grid-cols-4 ">
        {allImage?.map((image, i) => {
          return (
            <div
              key={image.id}
              ref={i === allImage.length - 1 ? setLastElement : null}
              className="p-2 text-white"
            >
              <Link href={`/conceptart/${image.id}`}>
                <ConceptImage image={image} />
              </Link>
            </div>
          );
        })}
      </div>
    </ContentBox>
  );
};

export default ConceptArt;
