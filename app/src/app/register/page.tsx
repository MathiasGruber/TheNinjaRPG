"use client";

import { useState, useEffect } from "react";
import React from "react";
import Link from "next/link";
import Image from "next/image";
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
import { MonitorPlay } from "lucide-react";
import { useUserData } from "@/utils/UserContext";
import { api } from "@/app/_trpc/client";
import { registrationSchema } from "@/validators/register";
import { attributes } from "@/validators/register";
import { colors, skin_colors } from "@/validators/register";
import { genders } from "@/validators/register";
import { showMutationToast, showFormErrorsToast } from "@/libs/toast";
import { Label } from "@/components/ui/label";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  IMG_REGISTRATIN_STEP1,
  IMG_REGISTRATIN_STEP2,
  IMG_REGISTRATIN_STEP3,
  IMG_REGISTRATIN_STEP4,
  IMG_REGISTRATIN_STEP5,
  IMG_REGISTRATIN_STEP6,
  IMG_REGISTRATIN_STEP7,
  IMG_REGISTRATIN_STEP8,
  IMG_REGISTRATIN_STEP9,
} from "@/drizzle/constants";
import type { CarouselApi } from "@/components/ui/carousel";
import type { RegistrationSchema } from "@/validators/register";

const Register: React.FC = () => {
  // Carousel state
  const [cApi, setCApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);

  // Router
  const router = useRouter();

  // tRPC utility
  const utils = api.useUtils();

  // User data
  const { data: userData, status: userStatus } = useUserData();

  // Create avatar mutation
  const createAvatar = api.avatar.createAvatar.useMutation();

  // Create character mutation
  const { mutate: createCharacter, isPending } =
    api.register.createCharacter.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.profile.getUser.invalidate();
          createAvatar.mutate();
        }
      },
    });

  // Form handling
  const form = useForm<RegistrationSchema>({
    mode: "all",
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      username: "",
      gender: undefined,
      hair_color: undefined,
      eye_color: undefined,
      skin_color: undefined,
      attribute_1: undefined,
      attribute_2: undefined,
      attribute_3: undefined,
      question1: undefined,
      question2: undefined,
      question3: undefined,
      question4: undefined,
      question5: undefined,
      question6: undefined,
    },
  });

  // Carousel control
  useEffect(() => {
    void form.trigger();
    if (!cApi) return;

    setCount(cApi.scrollSnapList().length);
    setCurrent(cApi.selectedScrollSnap() + 1);

    cApi.on("select", () => {
      setCurrent(cApi.selectedScrollSnap() + 1);
    });
  }, [cApi, form]);

  // Handle username changes
  const watchUsername = form.watch("username", "");
  const watchGender = form.watch("gender", undefined);
  const watchAttr1 = form.watch("attribute_1", undefined);
  const watchAttr2 = form.watch("attribute_2", undefined);
  const watchAttr3 = form.watch("attribute_3", undefined);
  const errors = form.formState.errors;

  // Checking for unique username
  const { data: databaseUsername } = api.profile.getUsername.useQuery(
    { username: watchUsername },
    {},
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
    (error) => showFormErrorsToast(error),
  );

  // Options used for select fields
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
    <ContentBox
      title="Create your Ninja"
      subtitle="And unlock the mysteries of Seichi"
      padding={false}
    >
      {!isPending && (
        <>
          <Form {...form}>
            <form onSubmit={handleCreateCharacter} className="relative">
              <Carousel setApi={setCApi}>
                <CarouselContent>
                  <CarouselItem className="flex flex-col gap-4">
                    <Image
                      alt="step1"
                      src={IMG_REGISTRATIN_STEP1}
                      width={491}
                      height={89}
                      className="basis-full w-full"
                      priority={true}
                    />

                    <div className="flex flex-wrap w-full gap-4 items-center px-10">
                      <FormField
                        control={form.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem className="w-full basis-full">
                            <FormLabel>Select username</FormLabel>
                            <FormControl>
                              <Input
                                className="h-14 text-3xl"
                                {...field}
                                placeholder="ninja name"
                              />
                            </FormControl>
                            <div className="flex flex-row">
                              <FormDescription className="grow">
                                Public display name.
                              </FormDescription>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="gender"
                        render={({ field }) => (
                          <div className="flex flex-row items-center w-full">
                            <FormItem className="w-full">
                              <FormLabel>Select gender</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger className="h-14 text-3xl ">
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
                              <div className="flex flex-row">
                                <FormDescription className="grow">
                                  Gender of your ninja
                                </FormDescription>
                                <FormMessage />
                              </div>
                            </FormItem>
                            <div>
                              <div className="text-7xl basis-full flex-row">
                                {watchGender === "Male" && (
                                  <p className="text-blue-500 p-2">♂</p>
                                )}
                                {watchGender === "Female" && (
                                  <p className="text-pink-500 p-2">♀</p>
                                )}
                                {watchGender === "Other" && (
                                  <p className="text-slate-500 p-2">⚥</p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      />
                    </div>
                  </CarouselItem>
                  <CarouselItem className="flex flex-col gap-4">
                    <Image
                      alt="step2"
                      src={IMG_REGISTRATIN_STEP2}
                      width={491}
                      height={89}
                      className="w-full basis-full"
                      priority={true}
                    />
                    <div className="flex w-full gap-4 items-center px-10">
                      <FormField
                        control={form.control}
                        name="hair_color"
                        render={({ field }) => (
                          <FormItem className="basis-1/3">
                            <FormLabel>Hair color</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger className="h-14 text-3xl ">
                                  <SelectValue placeholder={`None`} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>{option_colors}</SelectContent>
                            </Select>
                            <div className="flex flex-row">
                              <FormDescription className="grow">
                                Attribute 1
                              </FormDescription>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="eye_color"
                        render={({ field }) => (
                          <FormItem className="basis-1/3">
                            <FormLabel>Eye color</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger className="h-14 text-3xl ">
                                  <SelectValue placeholder={`None`} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>{option_colors}</SelectContent>
                            </Select>
                            <div className="flex flex-row">
                              <FormDescription className="grow">
                                Attribute 2
                              </FormDescription>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="skin_color"
                        render={({ field }) => (
                          <FormItem className="basis-1/3">
                            <FormLabel>Skin color</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger className="h-14 text-3xl ">
                                  <SelectValue placeholder={`None`} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>{option_skins}</SelectContent>
                            </Select>
                            <div className="flex flex-row">
                              <FormDescription className="grow">
                                Attribute 3
                              </FormDescription>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="flex w-full gap-4 items-center px-10">
                      <FormField
                        control={form.control}
                        name="attribute_1"
                        render={({ field }) => (
                          <FormItem className="basis-1/3">
                            <FormLabel>Attribute #1</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger className="h-14 text-3xl">
                                  <SelectValue placeholder={`None`} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {attributes
                                  .filter((e) => ![watchAttr2, watchAttr3].includes(e))
                                  .map((attribute, index) => (
                                    <SelectItem key={index} value={attribute}>
                                      {attribute}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            <div className="flex flex-row">
                              <FormDescription className="grow">
                                Customize
                              </FormDescription>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="attribute_2"
                        render={({ field }) => (
                          <FormItem className="basis-1/3">
                            <FormLabel>Attribute #2</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger className="h-14 text-3xl">
                                  <SelectValue placeholder={`None`} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {attributes
                                  .filter((e) => ![watchAttr1, watchAttr3].includes(e))
                                  .map((attribute, index) => (
                                    <SelectItem key={index} value={attribute}>
                                      {attribute}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            <div className="flex flex-row">
                              <FormDescription className="grow">
                                Customize
                              </FormDescription>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="attribute_3"
                        render={({ field }) => (
                          <FormItem className="basis-1/3">
                            <FormLabel>Attribute #3</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger className="h-14 text-3xl">
                                  <SelectValue placeholder={`None`} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {attributes
                                  .filter((e) => ![watchAttr1, watchAttr2].includes(e))
                                  .map((attribute, index) => (
                                    <SelectItem key={index} value={attribute}>
                                      {attribute}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            <div className="flex flex-row">
                              <FormDescription className="grow">
                                Customize
                              </FormDescription>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                  </CarouselItem>
                  <CarouselItem className="flex flex-col gap-4">
                    <Image
                      alt="step3"
                      src={IMG_REGISTRATIN_STEP3}
                      width={491}
                      height={89}
                      className="w-full"
                      priority={true}
                    />
                    <div className="px-10">
                      <FormField
                        control={form.control}
                        name="question1"
                        render={({ field }) => (
                          <FormItem className=" flex flex-col items-center">
                            <div>
                              <FormLabel className="font-bold text-base sm:text-xl">
                                What environment feels most like home to you?
                              </FormLabel>
                              <FormControl>
                                <RadioGroup
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Shine" id="r1" />
                                    <Label
                                      htmlFor="r1"
                                      className="text-base sm:text-lg"
                                    >
                                      Sunny deserts and glowing sands.
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Tsukimori" id="r2" />
                                    <Label
                                      htmlFor="r2"
                                      className="text-base sm:text-lg"
                                    >
                                      Mystic forests with ancient trees.
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Glacier" id="r3" />
                                    <Label
                                      htmlFor="r3"
                                      className="text-base sm:text-lg"
                                    >
                                      Icy mountains and snowfields.
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Shroud" id="r3" />
                                    <Label
                                      htmlFor="r3"
                                      className="text-base sm:text-lg"
                                    >
                                      Rain-soaked swamps and hidden lagoons.
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Current" id="r3" />
                                    <Label
                                      htmlFor="r3"
                                      className="text-base sm:text-lg"
                                    >
                                      Windy valleys and open skies.
                                    </Label>
                                  </div>
                                </RadioGroup>
                              </FormControl>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                  </CarouselItem>
                  <CarouselItem className="flex flex-col gap-4">
                    <Image
                      alt="step4"
                      src={IMG_REGISTRATIN_STEP4}
                      width={491}
                      height={89}
                      className="w-full"
                      priority={true}
                    />
                    <div className="px-10">
                      <FormField
                        control={form.control}
                        name="question2"
                        render={({ field }) => (
                          <FormItem className=" flex flex-col items-center">
                            <div>
                              <FormLabel className="font-bold text-base sm:text-xl">
                                Which element do you feel most connected to?
                              </FormLabel>
                              <FormControl>
                                <RadioGroup
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Shine" id="r1" />
                                    <Label
                                      htmlFor="r1"
                                      className="text-base sm:text-lg"
                                    >
                                      Fire, for its burning passion.
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Tsukimori" id="r2" />
                                    <Label
                                      htmlFor="r2"
                                      className="text-base sm:text-lg"
                                    >
                                      Earth, for its steady and grounding strength.
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Glacier" id="r3" />
                                    <Label
                                      htmlFor="r3"
                                      className="text-base sm:text-lg"
                                    >
                                      Ice, for its sharp and enduring calm.
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Shroud" id="r3" />
                                    <Label
                                      htmlFor="r3"
                                      className="text-base sm:text-lg"
                                    >
                                      Water, for its adaptability and flow.
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Current" id="r3" />
                                    <Label
                                      htmlFor="r3"
                                      className="text-base sm:text-lg"
                                    >
                                      Wind, for its freedom and swiftness.
                                    </Label>
                                  </div>
                                </RadioGroup>
                              </FormControl>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                  </CarouselItem>
                  <CarouselItem className="flex flex-col gap-4">
                    <Image
                      alt="step5"
                      src={IMG_REGISTRATIN_STEP5}
                      width={491}
                      height={89}
                      className="w-full"
                      priority={true}
                    />
                    <div className="px-10">
                      <FormField
                        control={form.control}
                        name="question3"
                        render={({ field }) => (
                          <FormItem className=" flex flex-col items-center">
                            <div>
                              <FormLabel className="font-bold text-base sm:text-xl">
                                What type of activity do you prefer?
                              </FormLabel>
                              <FormControl>
                                <RadioGroup
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Shine" id="r1" />
                                    <Label
                                      htmlFor="r1"
                                      className="text-base sm:text-lg"
                                    >
                                      Harnessing the power of the sun for creation
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Tsukimori" id="r2" />
                                    <Label
                                      htmlFor="r2"
                                      className="text-base sm:text-lg"
                                    >
                                      Walking peacefully through lush nature.
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Glacier" id="r3" />
                                    <Label
                                      htmlFor="r3"
                                      className="text-base sm:text-lg"
                                    >
                                      Conquering harsh challenges with persistence.
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Shroud" id="r3" />
                                    <Label
                                      htmlFor="r3"
                                      className="text-base sm:text-lg"
                                    >
                                      Embracing storms and adapting to change.
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Current" id="r3" />
                                    <Label
                                      htmlFor="r3"
                                      className="text-base sm:text-lg"
                                    >
                                      Soaring through the air and embracing speed.
                                    </Label>
                                  </div>
                                </RadioGroup>
                              </FormControl>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                  </CarouselItem>
                  <CarouselItem className="flex flex-col gap-4">
                    <Image
                      alt="step6"
                      src={IMG_REGISTRATIN_STEP6}
                      width={491}
                      height={89}
                      className="w-full"
                      priority={true}
                    />
                    <div className="px-10">
                      <FormField
                        control={form.control}
                        name="question4"
                        render={({ field }) => (
                          <FormItem className=" flex flex-col items-center">
                            <div>
                              <FormLabel className="font-bold text-base sm:text-xl">
                                How do you approach a problem?
                              </FormLabel>
                              <FormControl>
                                <RadioGroup
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Shine" id="r1" />
                                    <Label
                                      htmlFor="r1"
                                      className="text-base sm:text-lg"
                                    >
                                      Dive in headfirst with fiery determination.
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Tsukimori" id="r2" />
                                    <Label
                                      htmlFor="r2"
                                      className="text-base sm:text-lg"
                                    >
                                      Think it through with patience and wisdom.
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Glacier" id="r3" />
                                    <Label
                                      htmlFor="r3"
                                      className="text-base sm:text-lg"
                                    >
                                      Stand firm and outlast it.
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Shroud" id="r3" />
                                    <Label
                                      htmlFor="r3"
                                      className="text-base sm:text-lg"
                                    >
                                      Flow around it, adapting as needed.
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Current" id="r3" />
                                    <Label
                                      htmlFor="r3"
                                      className="text-base sm:text-lg"
                                    >
                                      Hit it from an unexpected angle.
                                    </Label>
                                  </div>
                                </RadioGroup>
                              </FormControl>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                  </CarouselItem>
                  <CarouselItem className="flex flex-col gap-4">
                    <Image
                      alt="step7"
                      src={IMG_REGISTRATIN_STEP7}
                      width={491}
                      height={89}
                      className="w-full"
                      priority={true}
                    />
                    <div className="px-10">
                      <FormField
                        control={form.control}
                        name="question5"
                        render={({ field }) => (
                          <FormItem className=" flex flex-col items-center">
                            <div>
                              <FormLabel className="font-bold text-base sm:text-xl">
                                What kind of landscape inspires you the most?
                              </FormLabel>
                              <FormControl>
                                <RadioGroup
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Shine" id="r1" />
                                    <Label
                                      htmlFor="r1"
                                      className="text-base sm:text-lg"
                                    >
                                      A desert shimmering under a blazing sun.
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Tsukimori" id="r2" />
                                    <Label
                                      htmlFor="r2"
                                      className="text-base sm:text-lg"
                                    >
                                      A tranquil forest alive with spirit energy.
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Glacier" id="r3" />
                                    <Label
                                      htmlFor="r3"
                                      className="text-base sm:text-lg"
                                    >
                                      A frozen peak under a starry sky
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Shroud" id="r3" />
                                    <Label
                                      htmlFor="r3"
                                      className="text-base sm:text-lg"
                                    >
                                      A misty swamp buzzing with hidden life.
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Current" id="r3" />
                                    <Label
                                      htmlFor="r3"
                                      className="text-base sm:text-lg"
                                    >
                                      A windswept valley under a vast, open sky.
                                    </Label>
                                  </div>
                                </RadioGroup>
                              </FormControl>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                  </CarouselItem>
                  <CarouselItem className="flex flex-col gap-4">
                    <Image
                      alt="step8"
                      src={IMG_REGISTRATIN_STEP8}
                      width={491}
                      height={89}
                      className="w-full"
                      priority={true}
                    />
                    <div className="px-10">
                      <FormField
                        control={form.control}
                        name="question6"
                        render={({ field }) => (
                          <FormItem className=" flex flex-col items-center">
                            <div>
                              <FormLabel className="font-bold text-base sm:text-xl">
                                What motivates you the most?
                              </FormLabel>
                              <FormControl>
                                <RadioGroup
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Shine" id="r1" />
                                    <Label
                                      htmlFor="r1"
                                      className="text-base sm:text-lg"
                                    >
                                      The brilliance of success and glory.
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Tsukimori" id="r2" />
                                    <Label
                                      htmlFor="r2"
                                      className="text-base sm:text-lg"
                                    >
                                      Harmony with the world and others.
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Glacier" id="r3" />
                                    <Label
                                      htmlFor="r3"
                                      className="text-base sm:text-lg"
                                    >
                                      Overcoming the toughest obstacles.
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Shroud" id="r3" />
                                    <Label
                                      htmlFor="r3"
                                      className="text-base sm:text-lg"
                                    >
                                      Faith and resilience through adversity
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Current" id="r3" />
                                    <Label
                                      htmlFor="r3"
                                      className="text-base sm:text-lg"
                                    >
                                      Freedom and the thrill of the unknown.
                                    </Label>
                                  </div>
                                </RadioGroup>
                              </FormControl>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                  </CarouselItem>
                  <CarouselItem className="flex flex-col items-center justify-center gap-4">
                    <Image
                      alt="step9"
                      src={IMG_REGISTRATIN_STEP9}
                      width={491}
                      height={89}
                      className="w-full"
                      priority={true}
                    />
                    <div className="px-10">
                      <FormField
                        control={form.control}
                        name="read_tos"
                        render={({ field }) => (
                          <FormItem className="flex flex-row space-x-3 space-y-0 p-4">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>
                                <Link
                                  className="hover:opacity-70 text-base sm:text-lg"
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
                          <FormItem className="flex flex-row space-x-3 space-y-0 p-4">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>
                                <Link
                                  className="hover:opacity-70 text-base sm:text-lg"
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
                          <FormItem className="flex flex-row space-x-3 space-y-0 p-4">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-base sm:text-lg">
                                I accept that this is Early Access
                              </FormLabel>
                              <FormDescription>
                                Things (even if purchased with real money) may radically
                                change.
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="w-full px-10">
                      <Button
                        id="create"
                        type="submit"
                        className="w-full animate-[wiggle_1s_ease-in-out_infinite]"
                        decoration="gold"
                        size="xl"
                        animation="pulse"
                      >
                        <MonitorPlay className="mr-2 h-7 w-7" />
                        Create & Start
                      </Button>
                    </div>
                  </CarouselItem>
                </CarouselContent>
                <CarouselPrevious className="animate-[wiggle_1s_ease-in-out_infinite]" />
                <CarouselNext className="animate-[wiggle_1s_ease-in-out_infinite]" />
              </Carousel>
            </form>
          </Form>

          <p className="text-center text-lg italic opacity-30 font-bold m-2">
            Step {current} / {count}
          </p>
        </>
      )}
      {isPending && <Loader explanation="Creating character..." />}
    </ContentBox>
  );
};

export default Register;
