import React, { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Confirm from "@/layout/Confirm";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import Accordion from "@/layout/Accordion";
import RichInput from "@/layout/RichInput";
import AvatarImage from "@/layout/Avatar";
import Modal from "@/layout/Modal";
import ItemWithEffects from "@/layout/ItemWithEffects";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getUserFederalStatus } from "@/utils/paypal";
import { ActionSelector } from "@/layout/CombatActions";
import { ChevronsRight, ChevronsLeft } from "lucide-react";
import { attributes } from "@/validators/register";
import { colors, skin_colors } from "@/validators/register";
import { mutateContentSchema } from "@/validators/comments";
import { useRequiredUserData } from "@/utils/UserContext";
import { api } from "@/utils/api";
import { useUserSearch } from "@/utils/search";
import { showMutationToast } from "@/libs/toast";
import { COST_CHANGE_USERNAME } from "@/libs/profile";
import { COST_RESET_STATS } from "@/libs/profile";
import { COST_SWAP_BLOODLINE } from "@/libs/profile";
import { COST_SWAP_VILLAGE } from "@/libs/profile";
import { round } from "@/utils/math";
import { UploadButton } from "@/utils/uploadthing";
import { statSchema } from "@/libs/combat/types";
import type { Bloodline, Village } from "@/drizzle/schema";
import type { z } from "zod";
import type { NextPage } from "next";
import type { MutateContentSchema } from "@/validators/comments";

const EditProfile: NextPage = () => {
  // State
  const { data: userData } = useRequiredUserData();
  const [activeElement, setActiveElement] = useState("Nindo");

  if (!userData) {
    return <Loader explanation="Loading profile page..." />;
  }

  return (
    <ContentBox
      title="Edit Profile"
      subtitle="Customize Character"
      back_href="/profile"
      padding={false}
    >
      <div className="grid grid-cols-1">
        <Accordion
          title="Nindo"
          selectedTitle={activeElement}
          unselectedSubtitle="Your personal way of the ninja"
          onClick={setActiveElement}
        >
          <NindoChange />
        </Accordion>
        <Accordion
          title="Name Change"
          selectedTitle={activeElement}
          unselectedSubtitle="Change your username"
          selectedSubtitle={`You can change your username for ${COST_CHANGE_USERNAME} reputation points. You
          have ${userData.reputationPoints} reputation points.`}
          onClick={setActiveElement}
        >
          <NameChange />
        </Accordion>
        <Accordion
          title="Custom Avatar"
          selectedTitle={activeElement}
          unselectedSubtitle="Upload a custom avatar"
          selectedSubtitle={`Avatar size is limited based on federal support status`}
          onClick={setActiveElement}
        >
          <AvatarChange />
        </Accordion>
        <Accordion
          title="Attribute Management"
          selectedTitle={activeElement}
          unselectedSubtitle="Change character attributes"
          selectedSubtitle={`You can select a total of 5 attributes!`}
          onClick={setActiveElement}
        >
          <AttributeChange />
        </Accordion>
        <Accordion
          title="Reset Stats"
          selectedTitle={activeElement}
          unselectedSubtitle="Redistribute your experience points"
          selectedSubtitle={`You can redistribute your stats for ${COST_RESET_STATS} reputation points. You
          have ${userData.reputationPoints} reputation points. You have ${
            userData.experience + 120
          } experience points to distribute.`}
          onClick={setActiveElement}
        >
          <ResetStats />
        </Accordion>
        <Accordion
          title="Swap Bloodline"
          selectedTitle={activeElement}
          unselectedSubtitle="Change your bloodline of choice"
          selectedSubtitle={`You can swap your current bloodline for another of similar rank for ${COST_SWAP_BLOODLINE} reputation points. You have ${userData.reputationPoints} reputation points.`}
          onClick={setActiveElement}
        >
          <SwapBloodline />
        </Accordion>
        <Accordion
          title="Swap Village"
          selectedTitle={activeElement}
          unselectedSubtitle="Change your village of choice"
          selectedSubtitle={`You can swap your current village for another for ${COST_SWAP_VILLAGE} reputation points. You have ${userData.reputationPoints} reputation points.`}
          onClick={setActiveElement}
        >
          <SwapVillage />
        </Accordion>
      </div>
    </ContentBox>
  );
};

export default EditProfile;

/**
 * Swap village
 */
const SwapVillage: React.FC = () => {
  // State
  const { data: userData, refetch: refetchUser } = useRequiredUserData();
  const [village, setVillage] = useState<Village | undefined>(undefined);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  // Fetch data
  const { data, isFetching } = api.village.getAll.useQuery(undefined, {
    enabled: !!userData,
    keepPreviousData: true,
    staleTime: Infinity,
  });
  const villages = data?.map((village) => ({
    ...village,
    image: `/villages/${village.name}.png`,
  }));

  // Mutations
  const { mutate: swap, isLoading: isSwapping } = api.village.swapVillage.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await refetchUser();
      }
    },
    onSettled: () => {
      document.body.style.cursor = "default";
      setIsOpen(false);
    },
  });

  // Only show if we have userData
  if (!userData) {
    return <Loader explanation="Loading profile page..." />;
  }

  // Derived data
  const canAfford = userData && userData.reputationPoints >= COST_SWAP_BLOODLINE;

  // Show component
  return (
    <div className="mt-2">
      {!isFetching && (
        <ActionSelector
          items={villages}
          showBgColor={false}
          showLabels={true}
          onClick={(id) => {
            if (id == village?.id) {
              setVillage(undefined);
              setIsOpen(false);
            } else {
              setVillage(villages?.find((village) => village.id === id));
              setIsOpen(true);
            }
          }}
        />
      )}
      {isFetching && <Loader explanation="Loading villages" />}
      {isOpen && userData && village && (
        <Modal
          title="Confirm Purchase"
          proceed_label={
            isSwapping
              ? undefined
              : canAfford
                ? `Swap for ${COST_SWAP_VILLAGE} reps`
                : `Need ${COST_SWAP_VILLAGE - userData.reputationPoints} reps`
          }
          setIsOpen={setIsOpen}
          isValid={false}
          onAccept={() => {
            if (canAfford) {
              swap({ villageId: village.id });
            } else {
              setIsOpen(false);
            }
          }}
          confirmClassName={
            canAfford
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-red-600 text-white hover:bg-red-700"
          }
        >
          {!isSwapping && <ItemWithEffects item={village} key={village.id} />}
          {isSwapping && <Loader explanation={`Purchasing ${village.name}`} />}
        </Modal>
      )}
    </div>
  );
};

/**
 * Swap bloodline
 */
const SwapBloodline: React.FC = () => {
  // State
  const { data: userData, refetch: refetchUser } = useRequiredUserData();
  const [bloodline, setBloodline] = useState<Bloodline | undefined>(undefined);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  // Fetch data
  const { data: bloodlines, isFetching } = api.bloodline.getAll.useInfiniteQuery(
    { rank: userData?.bloodline?.rank ?? "D", limit: 50 },
    {
      enabled: !!userData,
      keepPreviousData: true,
      staleTime: Infinity,
    },
  );
  const allBloodlines = bloodlines?.pages.map((page) => page.data).flat();

  // Mutations
  const { mutate: swap, isLoading: isSwapping } =
    api.bloodline.swapBloodline.useMutation({
      onSuccess: async () => {
        await refetchUser();
      },
      onSettled: () => {
        document.body.style.cursor = "default";
        setIsOpen(false);
      },
    });

  // Only show if we have userData
  if (!userData) {
    return <Loader explanation="Loading profile page..." />;
  }

  // Derived data
  const isDisabled = userData.bloodline ? false : true;
  const canAfford = userData && userData.reputationPoints >= COST_SWAP_BLOODLINE;

  // Show component
  return (
    <div className="mt-2">
      {!isDisabled && !isFetching && (
        <ActionSelector
          items={allBloodlines}
          showBgColor={false}
          showLabels={true}
          onClick={(id) => {
            if (id == bloodline?.id) {
              setBloodline(undefined);
              setIsOpen(false);
            } else {
              setBloodline(allBloodlines?.find((b) => b.id === id));
              setIsOpen(true);
            }
          }}
        />
      )}
      {isFetching && <Loader explanation="Loading bloodlines" />}
      {isDisabled && (
        <div>
          You do not have a bloodline currently. Go to{" "}
          <Link className="font-bold" href="/hospital">
            the hospital
          </Link>{" "}
          to get one.
        </div>
      )}
      {isOpen && userData && bloodline && (
        <Modal
          title="Confirm Purchase"
          proceed_label={
            isSwapping
              ? undefined
              : canAfford
                ? `Swap for ${COST_SWAP_BLOODLINE} reps`
                : `Need ${COST_SWAP_BLOODLINE - userData.reputationPoints} reps`
          }
          setIsOpen={setIsOpen}
          isValid={false}
          onAccept={() => {
            if (canAfford) {
              swap({ bloodlineId: bloodline.id });
            } else {
              setIsOpen(false);
            }
          }}
          confirmClassName={
            canAfford
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-red-600 text-white hover:bg-red-700"
          }
        >
          {!isSwapping && <ItemWithEffects item={bloodline} key={bloodline.id} />}
          {isSwapping && <Loader explanation={`Purchasing ${bloodline.name}`} />}
        </Modal>
      )}
    </div>
  );
};

/**
 * Reset stats component
 */
const ResetStats: React.FC = () => {
  // State
  const { data: userData, refetch: refetchUser } = useRequiredUserData();

  // Stats Schema
  type StatSchema = z.infer<typeof statSchema>;
  const defaultValues = statSchema.parse(userData);
  const statNames = Object.keys(defaultValues) as (keyof typeof defaultValues)[];

  // Form setup
  const form = useForm<StatSchema>({
    defaultValues,
    mode: "all",
    resolver: zodResolver(statSchema),
  });
  const formValues = form.watch();
  const formSum = Object.values(formValues)
    .map((v) => Number(v))
    .reduce((a, b) => a + b, 0);

  // Is the form the same as the default values
  const isDefault = Object.keys(formValues).every((key) => {
    return (
      formValues[key as keyof typeof formValues] ===
      defaultValues[key as keyof typeof defaultValues]
    );
  });

  // Mutations
  const { mutate: updateStats } = api.profile.updateStats.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await refetchUser();
      }
    },
  });

  // Only show if we have userData
  if (!userData) {
    return <Loader explanation="Loading profile page..." />;
  }

  // Derived data
  const availableStats = round(userData.experience + 120);
  const misalignment = round(formSum - availableStats);
  const canBuy = userData.reputationPoints >= COST_RESET_STATS;

  // Figure out what to show on button, and whether it is disabled or not
  const isDisabled = !canBuy || misalignment !== 0 || isDefault;
  const buttonText = isDefault
    ? "Nothing changed"
    : canBuy
      ? misalignment === 0
        ? "Reset Stats"
        : misalignment > 0
          ? `Remove ${misalignment} points`
          : `Place ${-misalignment} more points`
      : "Not enough points";

  // Submit handler
  const onSubmit = form.handleSubmit((data) => {
    updateStats(data);
  });

  // Show component
  return (
    <>
      <Form {...form}>
        <form className="grid grid-cols-2 gap-2" onSubmit={onSubmit}>
          {statNames.map((stat, i) => (
            <FormField
              key={i}
              control={form.control}
              name={stat}
              render={({ field }) => (
                <FormItem className="pt-1">
                  <FormLabel>{stat}</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder={stat} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          <Button
            id="create"
            className="w-full col-span-2 my-1"
            type="submit"
            disabled={isDisabled}
          >
            {buttonText}
          </Button>
        </form>
      </Form>
    </>
  );
};

/**
 * Avatar change component
 */
const AvatarChange: React.FC = () => {
  // State
  const { data: userData, refetch: refetchUser } = useRequiredUserData();
  console.log(userData);

  // Only show if we have userData
  if (!userData) return <Loader explanation="Loading profile page..." />;

  // Get user status
  const userstatus = getUserFederalStatus(userData);

  // If we have federal support
  if (userstatus !== "NONE") {
    return (
      <div className="grid grid-cols-2 pt-2">
        <AvatarImage
          href={userData.avatar}
          alt={userData.userId}
          size={100}
          hover_effect={true}
          priority
        />
        <UploadButton
          endpoint={
            userstatus === "NORMAL"
              ? "avatarNormalUploader"
              : userstatus === "SILVER"
                ? "avatarSilverUploader"
                : "avatarGoldUploader"
          }
          onClientUploadComplete={(res) => {
            if (res?.[0]?.url) {
              setTimeout(() => void refetchUser(), 1000);
            }
          }}
          onUploadError={(error: Error) => {
            showMutationToast({ success: false, message: error.message });
          }}
        />
      </div>
    );
  } else {
    return (
      <Link href="/points">
        <Button id="create" className="w-full my-3">
          Purchase Federal Support
        </Button>
      </Link>
    );
  }
};

/**
 * Attribute change component
 */
const AttributeChange: React.FC = () => {
  // State
  const [hairColor, setHairColor] = useState<(typeof colors)[number]>("Black");
  const [eyeColor, setEyeColor] = useState<(typeof colors)[number]>("Black");
  const [skinColor, setSkinColor] = useState<(typeof skin_colors)[number]>("Light");

  // Queries
  const { data, refetch } = api.profile.getUserAttributes.useQuery(undefined, {
    staleTime: Infinity,
  });
  const selectedAttributes = data
    ? data.map((a) => a.attribute as (typeof attributes)[number])
    : [];

  // Mutations
  const { mutate: insertAttr } = api.profile.insertAttribute.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await refetch();
      }
    },
  });

  const { mutate: deleteAttr } = api.profile.deleteAttribute.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await refetch();
      }
    },
  });

  return (
    <div className="grid grid-cols-2 pt-2">
      <div className="bg-slate-200 m-3 rounded-md p-3">
        <p className="font-bold">Current </p>
        {selectedAttributes.map((attribute, i) => (
          <div
            key={i}
            className="flex flex-row items-center hover:text-orange-500 hover:cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              deleteAttr({ attribute });
            }}
          >
            <p> - {attribute}</p> <ChevronsRight className="h-5 w-5 ml-1" />
          </div>
        ))}
      </div>
      <div className="bg-slate-200 m-3 rounded-md p-3">
        <p className="font-bold">Available </p>
        {attributes
          .filter((a) => !selectedAttributes.includes(a))
          .map((attribute, i) => (
            <div
              key={i}
              className="flex flex-row items-center hover:text-orange-500 hover:cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                insertAttr({ attribute });
              }}
            >
              <ChevronsLeft className="h-5 w-5 mr-1" />
              <p> {attribute} </p>
            </div>
          ))}
        <div className="mt-3 relative">
          <Select
            onValueChange={(e) => setEyeColor(e as (typeof colors)[number])}
            defaultValue={eyeColor}
            value={eyeColor}
          >
            <Label htmlFor="eye_color">Eye color</Label>
            <SelectTrigger>
              <SelectValue placeholder={`None`} />
            </SelectTrigger>
            <SelectContent id="eye_color">
              {colors.map((color, i) => (
                <SelectItem key={i} value={color}>
                  {color}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => insertAttr({ attribute: "Eyes", color: eyeColor })}
            className="absolute right-0 bottom-0"
          >
            <ChevronsLeft className="h-5 w-5 mr-1" />
          </Button>
        </div>
        <div className="mt-3 relative">
          <Select
            onValueChange={(e) => setSkinColor(e as (typeof skin_colors)[number])}
            defaultValue={skinColor}
            value={skinColor}
          >
            <Label htmlFor="skin_color">Skin color</Label>
            <SelectTrigger>
              <SelectValue placeholder={`None`} />
            </SelectTrigger>
            <SelectContent id="skin_color">
              {skin_colors.map((color, i) => (
                <SelectItem key={i} value={color}>
                  {color}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => insertAttr({ attribute: "Skin", color: skinColor })}
            className="absolute right-0 bottom-0"
          >
            <ChevronsLeft className="h-5 w-5 mr-1" />
          </Button>
        </div>
        <div className="mt-3 relative">
          <Select
            onValueChange={(e) => setHairColor(e as (typeof colors)[number])}
            defaultValue={hairColor}
            value={hairColor}
          >
            <Label htmlFor="hair_color">Hair color</Label>
            <SelectTrigger>
              <SelectValue placeholder={`None`} />
            </SelectTrigger>
            <SelectContent id="hair_color">
              {colors.map((color, i) => (
                <SelectItem key={i} value={color}>
                  {color}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => insertAttr({ attribute: "Hair", color: hairColor })}
            className="absolute right-0 bottom-0"
          >
            <ChevronsLeft className="h-5 w-5 mr-1" />
          </Button>
        </div>
      </div>
    </div>
  );
};

/**
 * Nindo change component
 */
const NindoChange: React.FC = () => {
  // State
  const { data: userData } = useRequiredUserData();

  // Queries
  const { data, refetch, isLoading } = api.profile.getNindo.useQuery(
    { userId: userData?.userId as string },
    { enabled: !!userData, staleTime: Infinity },
  );

  // Mutations
  const { mutate, isLoading: isUpdating } = api.profile.updateNindo.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await refetch();
      }
    },
  });

  // Form control
  const {
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<MutateContentSchema>({
    defaultValues: { content: data },
    resolver: zodResolver(mutateContentSchema),
  });

  // Handling submit
  const onSubmit = handleSubmit((data) => {
    mutate(data);
    reset();
  });

  if (isLoading || isUpdating) {
    return <Loader explanation="Loading nindo..." />;
  }

  return (
    <form onSubmit={onSubmit}>
      <RichInput
        id="content"
        height="200"
        placeholder={data}
        control={control}
        onSubmit={onSubmit}
        error={errors.content?.message}
      />
    </form>
  );
};

/**
 * Namechange component
 */
const NameChange: React.FC = () => {
  // State
  const { data: userData, refetch: refetchUser } = useRequiredUserData();

  // Username search
  const { form, searchTerm } = useUserSearch();

  // Queries
  const { data: databaseUsername } = api.profile.getUsername.useQuery(
    { username: searchTerm },
    { staleTime: Infinity },
  );

  // Mutations
  const { mutate: updateUsername } = api.profile.updateUsername.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await refetchUser();
      }
    },
  });

  // Only show if we have userData
  if (!userData) {
    return <Loader explanation="Loading profile page..." />;
  }

  // Derived data
  const errors = form.formState.errors;
  const canBuyUsername = userData.reputationPoints >= COST_CHANGE_USERNAME;
  const error = databaseUsername?.username
    ? `${databaseUsername?.username} already exists`
    : errors.username?.message;

  return (
    <div className="grid grid-cols-1">
      <Form {...form}>
        <form>
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input id="username" placeholder="Search user" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Confirm
            title="Confirm New Username"
            button={
              <Button
                id="create"
                type="submit"
                className="w-full my-3"
                disabled={!canBuyUsername || searchTerm === "" || error !== undefined}
              >
                {canBuyUsername ? "Update Username" : "Not enough points"}
              </Button>
            }
            onAccept={(e) => {
              e.preventDefault();
              updateUsername({ username: searchTerm });
            }}
          >
            Changing your username costs {COST_CHANGE_USERNAME} reputation points, and
            can only be reverted by purchasing another name change. Are you sure you
            want to change your username to {searchTerm}?
          </Confirm>
        </form>
      </Form>
    </div>
  );
};
