"use client";

import { useState, useEffect, useMemo } from "react";
import React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import {
  Form,
  FormControl,
  FormLabel,
  FormDescription,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import { fetchMap } from "@/libs/travel/globe";
import { useUserData } from "@/utils/UserContext";
import { api } from "@/utils/api";
import { registrationSchema } from "@/validators/register";
import { attributes } from "@/validators/register";
import { colors, skin_colors } from "@/validators/register";
import { genders } from "@/validators/register";
import { showMutationToast } from "@/libs/toast";
import type { RegistrationSchema } from "@/validators/register";

const Map = dynamic(() => import("@/layout/Map"));

const Register: React.FC = () => {
  const [map, setMap] = useState<Awaited<ReturnType<typeof fetchMap>> | null>(null);
  void useMemo(async () => {
    setMap(await fetchMap());
  }, []);

  // Router
  const router = useRouter();

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
  const { mutate: createCharacter, isPending } =
    api.register.createCharacter.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await refetchUserData();
          createAvatar.mutate();
        }
      },
    });

  // Form handling
  const form = useForm<RegistrationSchema>({
    resolver: zodResolver(registrationSchema),
  });

  // Handle username changes
  const watchUsername = form.watch("username", "");
  const errors = form.formState.errors;

  // Checking for unique username
  const { data: databaseUsername } = api.profile.getUsername.useQuery(
    { username: watchUsername },
    { staleTime: Infinity },
  );

  // If selected username found in database, set error. If not, clear error.
  if (databaseUsername && errors.username === undefined) {
    form.setError("username", {
      type: "custom",
      message: "The selected username already exists in the database",
    });
  } else if (!databaseUsername && errors.username?.type == "custom") {
    form.clearErrors("username");
  }

  // If we have local storage referrer, set it as default value
  useEffect(() => {
    const referrer = localStorage.getItem("ref");
    if (referrer) {
      form.setValue("recruiter_userid", referrer);
    }
  }, [form]);

  // If we have userdata, we should not be here
  useEffect(() => {
    if (userStatus === "success" && userData) {
      void router.push("/");
    }
  }, [router, userStatus, userData]);

  // If we are still trying to load user data
  if (userStatus === "pending" || (userStatus === "success" && userData)) {
    return <Loader explanation="Loading page..." />;
  }

  // Handle form submit
  const handleCreateCharacter = form.handleSubmit(
    (data) => createCharacter(data),
    (errors) => console.log(errors),
  );

  // Options used for select fields
  const option_attributes = attributes.map((attribute, index) => (
    <SelectItem key={index} value={attribute}>
      {attribute}
    </SelectItem>
  ));
  const option_colors = colors.map((color, index) => (
    <SelectItem key={index} value={color}>
      {color}
    </SelectItem>
  ));
  const option_skins = skin_colors.map((color, index) => (
    <SelectItem key={index} value={color}>
      {color}
    </SelectItem>
  ));

  return (
    <ContentBox title="Create your Ninja" subtitle="Avatar created by AI">
      {isPending && <Loader explanation="Creating character..." />}
      {!isPending && (
        <Form {...form}>
          <form onSubmit={handleCreateCharacter} className="relative">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="space-y-2">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select username</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="village"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select village</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={`None`} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {villages
                            ?.filter((v) => v.type === "VILLAGE")
                            .map((option) => (
                              <SelectItem key={option.name} value={option.id}>
                                {option.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>

                      <FormMessage />
                    </FormItem>
                  )}
                />
                {villages && map && (
                  <Map intersection={false} highlights={villages} hexasphere={map} />
                )}
              </div>
              <div className="space-y-2">
                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select gender</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={`None`} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {genders.map((gender, index) => (
                            <SelectItem key={index} value={gender}>
                              {gender}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hair_color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hair color</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={`None`} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>{option_colors}</SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="eye_color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Eye color</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={`None`} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>{option_colors}</SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="skin_color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Skin color</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={`None`} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>{option_skins}</SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="attribute_1"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Attribute #1</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={`None`} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>{option_attributes}</SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="attribute_2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Attribute #2</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={`None`} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>{option_attributes}</SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="attribute_3"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Attribute #3</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={`None`} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>{option_attributes}</SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
            <FormField
              control={form.control}
              name="read_tos"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md p-4">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>
                      <Link
                        href="https://app.termly.io/document/terms-of-service/71d95c2f-d6eb-4e3c-b480-9f0b9bb87830"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {" "}
                        I have read & agree to the Terms of Service
                      </Link>
                    </FormLabel>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="read_privacy"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md p-4">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>
                      <Link
                        href="https://app.termly.io/document/privacy-policy/9fea0bba-1061-47c0-8f28-0f724f06cc0e"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        I have read & agree to the Privacy Policy
                      </Link>
                    </FormLabel>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="read_earlyaccess"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md p-4">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>I accept that this is Early Access</FormLabel>
                    <FormDescription>
                      Things (even if purchased with real money) may radically change.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
            <Button id="create" type="submit" className="w-full" decoration="gold">
              <UserPlus className="mr-2 h-5 w-5" />
              Create Character
            </Button>
          </form>
        </Form>
      )}
    </ContentBox>
  );
};

export default Register;
