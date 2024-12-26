"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import ContentBox from "@/layout/ContentBox";
import ConceptImage from "@/layout/ConceptImage";
import Confirm from "@/layout/Confirm";
import {
  Form,
  FormControl,
  FormLabel,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { api } from "@/app/_trpc/client";
import { conceptArtPromptSchema, conceptArtFilterSchema } from "@/validators/art";
import { sortOptions, timeFrame } from "@/validators/art";
import { User, Sparkles } from "lucide-react";
import { useUserData } from "@/utils/UserContext";
import { showMutationToast } from "@/libs/toast";
import { useInfinitePagination } from "@/libs/pagination";
import type { ConceptPromptType, ConceptFilterType } from "@/validators/art";

export default function ConceptArt() {
  // State
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const { data: userData } = useUserData();

  // Routing
  const router = useRouter();

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
  const { mutate: create, isPending } = api.conceptart.create.useMutation({
    onSuccess: async (result) => {
      showMutationToast(result);
      if (result.success && result.imageId) {
        promptForm.setValue("prompt", "");
        promptForm.setValue("negative_prompt", "");
        filterForm?.setValue("only_own", true);
        filterForm?.setValue("sort", "Most Recent");
        router.push(`/conceptart/${result.imageId}`);
        await utils.conceptart.getAll.refetch();
        await utils.profile.getUser.refetch();
      }
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
      placeholderData: (previousData) => previousData,
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
          if (!isPending) create(data);
        } else {
          showMutationToast({ success: false, message: "No reputation points left." });
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
        <div className="flex flex-row items-center gap-1">
          <div>
            <User
              className={`h-6 w-6 hover:cursor-pointer ${only_own ? "text-orange-500" : ""}`}
              onClick={() => filterForm.setValue("only_own", !only_own)}
            />
          </div>
          <Select
            onValueChange={(e) =>
              filterForm.setValue("sort", e as (typeof sortOptions)[number])
            }
            defaultValue={sort}
            value={sort}
          >
            <SelectTrigger>
              <SelectValue placeholder={`None`} />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            onValueChange={(e) =>
              filterForm.setValue("time_frame", e as (typeof timeFrame)[number])
            }
            defaultValue={time_frame}
            value={time_frame}
          >
            <SelectTrigger>
              <SelectValue placeholder={`None`} />
            </SelectTrigger>
            <SelectContent>
              {timeFrame.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {userData && (
            <Confirm
              title="Create New"
              button={
                <Button id="new-art">
                  <Sparkles className="mr-2 h-6 w-6" />
                  New
                </Button>
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
                <Form {...promptForm}>
                  <FormField
                    control={promptForm.control}
                    name="prompt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prompt</FormLabel>
                        <FormControl>
                          <Input placeholder="Prompt" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={promptForm.control}
                    name="negative_prompt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Negative Prompt</FormLabel>
                        <FormControl>
                          <Input placeholder="Negative Prompt" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <FormField
                      control={promptForm.control}
                      name="guidance_scale"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Guidance scale</FormLabel>
                          <FormControl>
                            <Input placeholder="Adherance" type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={promptForm.control}
                      name="seed"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Seed value</FormLabel>
                          <FormControl>
                            <Input placeholder="Seed value" type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </Form>
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
              <Link href={`/conceptart/${image.id}`} aria-label={`Image ${image.id}`}>
                <ConceptImage image={image} />
              </Link>
            </div>
          );
        })}
      </div>
    </ContentBox>
  );
}
