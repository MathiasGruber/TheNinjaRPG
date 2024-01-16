import { useState, useEffect, useMemo } from "react";
import React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSafePush } from "@/utils/routing";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ContentBox from "@/layout/ContentBox";
import InputField from "@/layout/InputField";
import SelectField from "@/layout/SelectField";
import CheckBox from "@/layout/CheckBox";
import Button from "@/layout/Button";
import Loader from "@/layout/Loader";
import { fetchMap } from "@/libs/travel/globe";
import { useUserData } from "@/utils/UserContext";
import { api } from "@/utils/api";
import { registrationSchema } from "../validators/register";
import { attributes } from "../validators/register";
import { colors, skin_colors } from "../validators/register";
import { genders } from "../validators/register";
import { show_toast } from "@/libs/toast";
import type { RegistrationSchema } from "../validators/register";

const Map = dynamic(() => import("../layout/Map"));

const Register: React.FC = () => {
  const [map, setMap] = useState<Awaited<ReturnType<typeof fetchMap>> | null>(null);
  void useMemo(async () => {
    setMap(await fetchMap());
  }, []);

  // Router
  const router = useSafePush();

  // User data
  const {
    data: userData,
    status: userStatus,
    refetch: refetchUserData,
  } = useUserData();

  // Available villages
  const { data: villages } = api.village.getAll.useQuery(undefined, {
    staleTime: Infinity,
  });

  // Create avatar mutation
  const createAvatar = api.avatar.createAvatar.useMutation();

  // Create character mutation
  const { mutate: createCharacter, isLoading } =
    api.register.createCharacter.useMutation({
      onSuccess: async (data) => {
        if (data.success) {
          await refetchUserData();
          createAvatar.mutate();
        } else {
          show_toast("Error on character creation", data.message, "error");
        }
      },
      onError: (error) => {
        show_toast("Error on character creation", error.message, "error");
      },
    });

  // Form handling
  const {
    register,
    watch,
    setValue,
    setError,
    clearErrors,
    handleSubmit,
    formState: { errors },
  } = useForm<RegistrationSchema>({
    resolver: zodResolver(registrationSchema),
  });

  // Handle username changes
  const watchUsername = watch("username", "");

  // Checking for unique username
  const { data: databaseUsername } = api.profile.getUsername.useQuery(
    { username: watchUsername },
    { staleTime: Infinity }
  );

  // If selected username found in database, set error. If not, clear error.
  if (databaseUsername && errors.username === undefined) {
    setError("username", {
      type: "custom",
      message: "The selected username already exists in the database",
    });
  } else if (!databaseUsername && errors.username?.type == "custom") {
    clearErrors("username");
  }

  // If we have local storage referrer, set it as default value
  useEffect(() => {
    const referrer = localStorage.getItem("ref");
    if (referrer) {
      setValue("recruiter_userid", referrer);
    }
  }, [setValue]);

  // If we have userdata, we should not be here
  useEffect(() => {
    if (userStatus === "success" && userData) {
      void router.push("/");
    }
  }, [router, userStatus, userData]);

  // If we are still trying to load user data
  if (userStatus === "loading" || (userStatus === "success" && userData)) {
    return <Loader explanation="Loading page..." />;
  }

  // Handle form submit
  const handleCreateCharacter = handleSubmit(
    (data) => createCharacter(data),
    (errors) => console.log(errors)
  );

  // Options used for select fields
  const option_attributes = attributes.map((attribute, index) => (
    <option value={attribute} key={index}>
      {attribute}
    </option>
  ));
  const option_colors = colors.map((color, index) => (
    <option value={color} key={index}>
      {color}
    </option>
  ));
  const option_skins = skin_colors.map((color, index) => (
    <option value={color} key={index}>
      {color}
    </option>
  ));

  return (
    <form>
      <ContentBox title="Create your Ninja" subtitle="Avatar created by AI">
        {isLoading && <Loader explanation="Creating character..." />}
        {!isLoading && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div>
                <InputField
                  id="username"
                  label="Enter Username"
                  register={register}
                  error={errors.username?.message}
                />
                <SelectField
                  id="village"
                  label="Select Village"
                  register={register}
                  error={errors.village?.message}
                  placeholder="Pick a village"
                >
                  {villages?.map((village) => (
                    <option key={village.id} value={village.id}>
                      {village.name}
                    </option>
                  ))}
                </SelectField>
                {villages && map && (
                  <Map intersection={false} highlights={villages} hexasphere={map} />
                )}
              </div>
              <div>
                <SelectField
                  id="gender"
                  label="Gender"
                  register={register}
                  error={errors.gender?.message}
                  placeholder="Select gender"
                >
                  {genders.map((gender, index) => (
                    <option value={gender} key={index}>
                      {gender}
                    </option>
                  ))}
                </SelectField>

                <SelectField
                  id="hair_color"
                  label="Hair Color"
                  register={register}
                  error={errors.hair_color?.message}
                >
                  {option_colors}
                </SelectField>
                <SelectField
                  id="eye_color"
                  label="Eye Color"
                  register={register}
                  error={errors.eye_color?.message}
                >
                  {option_colors}
                </SelectField>
                <SelectField
                  id="skin_color"
                  label="Skin Color"
                  register={register}
                  error={errors.skin_color?.message}
                >
                  {option_skins}
                </SelectField>
                <SelectField
                  id="attribute_1"
                  label="Attribute #1"
                  register={register}
                  placeholder="Select Attribute"
                  error={errors.attribute_1?.message}
                >
                  {option_attributes}
                </SelectField>
                <SelectField
                  id="attribute_2"
                  label="Attribute #2"
                  register={register}
                  placeholder="Select Attribute"
                  error={errors.attribute_2?.message}
                >
                  {option_attributes}
                </SelectField>
                <SelectField
                  id="attribute_3"
                  label="Attribute #3"
                  register={register}
                  placeholder="Select Attribute"
                  error={errors.attribute_3?.message}
                >
                  {option_attributes}
                </SelectField>
              </div>
            </div>

            <CheckBox
              id="read_tos"
              label={
                <Link href="/terms" target="_blank" rel="noopener noreferrer">
                  I have read & agree to the Terms of Service
                </Link>
              }
              register={register}
              error={errors.read_tos?.message}
            />
            <CheckBox
              id="read_privacy"
              label={
                <Link href="/policy" target="_blank" rel="noopener noreferrer">
                  I have read & agree to the Privacy Policy
                </Link>
              }
              register={register}
              error={errors.read_privacy?.message}
            />
            <CheckBox
              id="read_earlyaccess"
              label={
                <Link href="/policy" target="_blank" rel="noopener noreferrer">
                  I accept that this is Early Access, and things (even if purchased with
                  real money) may radically change.
                </Link>
              }
              register={register}
              error={errors.read_earlyaccess?.message}
            />
            <Button
              id="create"
              label="Create Character"
              onClick={handleCreateCharacter}
            />
          </>
        )}
      </ContentBox>
    </form>
  );
};

export default Register;
