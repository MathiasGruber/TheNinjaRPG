import React, { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Confirm from "../../layout/Confirm";
import ContentBox from "../../layout/ContentBox";
import Loader from "../../layout/Loader";
import Accordion from "../../layout/Accordion";
import RichInput from "../../layout/RichInput";
import SelectField from "../../layout/SelectField";
import Button from "../../layout/Button";
import AvatarImage from "../../layout/Avatar";
import InputField from "../../layout/InputField";
import { ChevronDoubleRightIcon } from "@heroicons/react/24/solid";
import { ChevronDoubleLeftIcon } from "@heroicons/react/24/solid";
import { attributes } from "../../validators/register";
import { colors, skin_colors } from "../../validators/register";
import { mutateContentSchema } from "../../validators/comments";
import { useRequiredUserData } from "../../utils/UserContext";
import { api } from "../../utils/api";
import { useUserSearch } from "../../utils/search";
import { show_toast } from "../../libs/toast";
import { COST_CHANGE_USERNAME } from "../../libs/profile";
import { UploadButton } from "../../utils/uploadthing";
import type { NextPage } from "next";
import type { MutateContentSchema } from "../../validators/comments";
import "@uploadthing/react/styles.css";

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
      </div>
    </ContentBox>
  );
};

export default EditProfile;

/**
 * Avatar change component
 */
const AvatarChange: React.FC = () => {
  // State
  const { data: userData, refetch: refetchUser } = useRequiredUserData();
  console.log(userData);

  // Only show if we have userData
  if (!userData) {
    return <Loader explanation="Loading profile page..." />;
  }

  // If we have federal support
  if (userData.federalStatus !== "NONE") {
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
            userData.federalStatus === "NORMAL"
              ? "avatarNormalUploader"
              : userData.federalStatus === "SILVER"
              ? "avatarSilverUploader"
              : "avatarGoldUploader"
          }
          onClientUploadComplete={(res) => {
            if (res?.[0]?.fileUrl) {
              setTimeout(() => void refetchUser(), 1000);
            }
          }}
          onUploadError={(error: Error) => {
            show_toast("Error uploading", error.message, "error");
          }}
        />
      </div>
    );
  } else {
    return (
      <Link href="/points">
        <Button id="create" label="Purchase Federal Support" />
      </Link>
    );
  }
};

/**
 * Nindo change component
 */
const AttributeChange: React.FC = () => {
  // State
  const [hairColor, setHairColor] = useState<typeof colors[number]>("Black");
  const [eyeColor, setEyeColor] = useState<typeof colors[number]>("Black");
  const [skinColor, setSkinColor] = useState<typeof skin_colors[number]>("Light");

  console.log(eyeColor);

  // Queries
  const { data, refetch, isLoading } = api.profile.getUserAttributes.useQuery(
    undefined,
    { staleTime: Infinity }
  );
  const selectedAttributes = data
    ? data.map((a) => a.attribute as typeof attributes[number])
    : [];

  // Mutations
  const { mutate: insertAttr, isLoading: isInserting } =
    api.profile.insertAttribute.useMutation({
      onSuccess: async (data) => {
        if (data.success) {
          show_toast("Success", "Attribute inserted", "success");
          await refetch();
        } else {
          show_toast("Error on insert", data.message, "error");
        }
      },
      onError: (error) => show_toast("Error on insert", error.message, "error"),
    });

  const { mutate: deleteAttr, isLoading: isDeleting } =
    api.profile.deleteAttribute.useMutation({
      onSuccess: async (data) => {
        if (data.success) {
          show_toast("Success", "Attribute deleted", "success");
          await refetch();
        } else {
          show_toast("Error on delete", data.message, "error");
        }
      },
      onError: (error) => show_toast("Error on delete", error.message, "error"),
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
            <p> - {attribute}</p> <ChevronDoubleRightIcon className="h-5 w-5 ml-1" />
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
              <ChevronDoubleLeftIcon className="h-5 w-5 mr-1" />
              <p> {attribute} </p>
            </div>
          ))}
        <div className="mt-3">
          <SelectField
            id="eyecolor"
            label="Eye Color"
            placeholder={eyeColor}
            onChange={(e) => setEyeColor(e.target.value as typeof colors[number])}
            onButtonClick={(e) => insertAttr({ attribute: "Eyes", color: eyeColor })}
            button={<ChevronDoubleLeftIcon className="h-5 w-5 mr-1" />}
          >
            {colors.map((color, i) => (
              <option key={i} value={color}>
                {color}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="mt-3">
          <SelectField
            id="skincolor"
            label="Skin Color"
            onChange={(e) => setSkinColor(e.target.value as typeof skin_colors[number])}
            onButtonClick={(e) => insertAttr({ attribute: "Skin", color: skinColor })}
            button={<ChevronDoubleLeftIcon className="h-5 w-5 mr-1" />}
          >
            {skin_colors.map((color, i) => (
              <option key={i} value={color}>
                {color}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="mt-3">
          <SelectField
            id="haircolor"
            label="Hair Color"
            onChange={(e) => setHairColor(e.target.value as typeof colors[number])}
            onButtonClick={(e) => insertAttr({ attribute: "Hair", color: hairColor })}
            button={<ChevronDoubleLeftIcon className="h-5 w-5 mr-1" />}
          >
            {colors.map((color, i) => (
              <option key={i} value={color}>
                {color}
              </option>
            ))}
          </SelectField>
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
    { enabled: !!userData, staleTime: Infinity }
  );

  // Mutations
  const { mutate, isLoading: isUpdating } = api.profile.updateNindo.useMutation({
    onSuccess: async (data) => {
      if (data.success) {
        show_toast("Success", "Nindo updated", "success");
        await refetch();
      } else {
        show_toast("Error on updating nindo", data.message, "error");
      }
    },
    onError: (error) => {
      show_toast("Error on updating nindo", error.message, "error");
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
      <Button id="create" label="Update Nindo" />
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
  const { register, errors, searchTerm } = useUserSearch();

  // Queries
  const { data: databaseUsername } = api.profile.getUsername.useQuery(
    { username: searchTerm },
    { staleTime: Infinity }
  );

  // Mutations
  const { mutate: updateUsername } = api.profile.updateUsername.useMutation({
    onSuccess: async (data) => {
      if (data.success) {
        show_toast("Success", "Username updated", "success");
        await refetchUser();
      } else {
        show_toast("Error on updating username", data.message, "error");
      }
    },
    onError: (error) => {
      show_toast("Error on updating username", error.message, "error");
    },
  });

  // Only show if we have userData
  if (!userData) {
    return <Loader explanation="Loading profile page..." />;
  }

  // Derived data
  const canBuyUsername = userData.reputationPoints >= COST_CHANGE_USERNAME;
  const error = databaseUsername?.username
    ? `${databaseUsername?.username} already exists`
    : errors.username?.message;

  return (
    <div className="grid grid-cols-1">
      <InputField
        id="username"
        placeholder="Search"
        register={register}
        error={error}
      />
      <Confirm
        title="Confirm New Username"
        button={
          <Button
            id="create"
            label={canBuyUsername ? "Update Username" : "Not enough points"}
            disabled={!canBuyUsername || searchTerm === "" || error !== undefined}
          />
        }
        onAccept={(e) => {
          e.preventDefault();
          updateUsername({ username: searchTerm });
        }}
      >
        Changing your username costs {COST_CHANGE_USERNAME} reputation points, and can
        only be reverted by purchasing another name change. Are you sure you want to
        change your username to {searchTerm}?
      </Confirm>
    </div>
  );
};
