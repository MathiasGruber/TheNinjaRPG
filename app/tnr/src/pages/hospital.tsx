import { useState } from "react";
import Image from "next/image";
import { LetterRank } from "@prisma/client/edge";
import { type NextPage } from "next";
import { BeakerIcon } from "@heroicons/react/24/solid";

import Confirm from "../layout/Confirm";
import Button from "../layout/Button";
import Loader from "../layout/Loader";
import ContentBox from "../layout/ContentBox";

import { useRequiredUserData } from "../utils/UserContext";
import { ROLL_CHANCE } from "../libs/bloodline";
import { api } from "../utils/api";
import { useInfinitePagination } from "../libs/pagination";
import { show_toast } from "../libs/toast";

const Hospital: NextPage = () => {
  // Settings
  const { data: userData, refetch: refetchUser } = useRequiredUserData();
  const [rank, setRank] = useState<LetterRank>(LetterRank.D);
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // Get data from DB
  const { data: prevRoll, isFetching, refetch } = api.bloodline.getRolls.useQuery();
  const {
    data: bloodlines,
    isFetching: isFetchingBloodlines,
    fetchNextPage,
    hasNextPage,
  } = api.bloodline.getAll.useInfiniteQuery(
    { rank: rank, limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
      staleTime: Infinity,
    }
  );
  const allBloodlines = bloodlines?.pages.map((page) => page.data).flat();
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  // Mutations
  const { mutate: roll, isLoading: isRolling } = api.bloodline.roll.useMutation({
    onSuccess: (data) => {
      if (data.bloodlineId) {
        show_toast(
          "Bloodline confirmed!",
          "After thorough examination a bloodline was detected",
          "success"
        );
      } else {
        show_toast(
          "No bloodline found",
          "After thorough examination the doctors conclude you have no bloodline",
          "error"
        );
      }
    },
    onError: (error) => {
      show_toast("Error rolling", error.message, "error");
    },
    onSettled: () => {},
  });
  const { mutate: remove, isLoading: isRemovingBloodline } =
    api.bloodline.removeBloodline.useMutation({
      onSuccess: () => {},
      onError: (error) => {
        show_toast("Error purchasing", error.message, "error");
      },
      onSettled: () => {},
    });
  const { mutate: purchase, isLoading: isPurchasing } =
    api.bloodline.purchaseBloodline.useMutation({
      onSuccess: () => {},
      onError: (error) => {
        show_toast("Error rolling", error.message, "error");
      },
      onSettled: () => {},
    });

  // Derived calculations
  const hasRolled = !!prevRoll;

  console.log(prevRoll);

  return (
    <>
      <ContentBox
        title="Hospital"
        subtitle="All your medical needs"
        back_href="/village"
      >
        WIP
      </ContentBox>
      <br />
      <ContentBox
        title="Bloodline"
        subtitle={hasRolled ? "Graft Bloodline" : "Check your genetics"}
      >
        <div className="flex flex-row">
          <div className="hidden sm:block sm:basis-1/3">
            <Image
              className="rounded-2xl border-2"
              alt="Bloodline"
              src="/bloodlines/hospital.png"
              width={256}
              height={256}
            ></Image>
          </div>
          <div className="pl-0 sm:basis-2/3 sm:pl-5">
            At the hospital, skilled doctors and geneticists use advanced technology to
            analyze the DNA of each patient. They search for specific genetic markers
            that indicate the presence of a rare and powerful bloodline, known only to a
            select few ninja clans. If the patient's DNA contains these markers, they
            are deemed to possess the unique bloodline and granted special abilities
            that can be honed through training and practice. However, the process is not
            without risks, and some patients may experience side effects or
            complications as a result of their newfound powers - the hospital therefore
            offers removal of native bloodlines free of charge.
            <Confirm
              title="Confirm Roll"
              proceed_label="Roll"
              button={
                <Button
                  id="check"
                  label="Check Genetics"
                  image={<BeakerIcon className="mr-3 h-6 w-6" />}
                  onClick={() => refetch()}
                />
              }
              onAccept={(e) => {
                e.preventDefault();
                roll();
              }}
            >
              {!isRolling && (
                <>
                  <p>
                    You are about to get your genetics checked to see if you have a
                    bloodline. Statistically, the chances for the different ranks of
                    bloodlines are:
                  </p>
                  <ul className="pl-5 pt-3">
                    <li>S-Ranked: {ROLL_CHANCE[LetterRank.S] * 100}%</li>
                    <li>A-Ranked: {ROLL_CHANCE[LetterRank.A] * 100}%</li>
                    <li>B-Ranked: {ROLL_CHANCE[LetterRank.B] * 100}%</li>
                    <li>C-Ranked: {ROLL_CHANCE[LetterRank.C] * 100}%</li>
                    <li>D-Ranked: {ROLL_CHANCE[LetterRank.D] * 100}%</li>
                  </ul>
                </>
              )}
              {isRolling && <Loader explanation="Rolling bloodline" />}
            </Confirm>
          </div>
        </div>
      </ContentBox>
    </>
  );
};

export default Hospital;
