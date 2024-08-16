import React from "react";
import { useState, useEffect } from "react";
import AvatarImage from "./Avatar";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { X } from "lucide-react";
import { getUnique } from "@/utils/grouping";
import { api } from "@/utils/api";
import type { UseFormReturn } from "react-hook-form";

type SelectedClan = {
  name: string;
  image: string | null;
  clanId: string;
};

interface ClanSearchSelectProps {
  useFormMethods: UseFormReturn<
    {
      name: string;
      clans: {
        id: string;
        name: string;
        image?: string | null;
      }[];
    },
    any
  >;
  showOwn: boolean;
  userClanId?: string | null;
  selectedClans?: SelectedClan[];
  label?: string;
  inline?: boolean;
  maxClans?: number;
}

const ClanSearchSelect: React.FC<ClanSearchSelectProps> = (props) => {
  const [searchTerm, setSearchTerm] = useState("");

  const form = props.useFormMethods;

  const watchName = form.watch("name", "");
  const watchClans = form.watch("clans", []);

  const { data: searchResults } = api.clan.searchClans.useQuery(
    { name: searchTerm },
    { enabled: searchTerm !== "" },
  );

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setSearchTerm(watchName);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [watchName, setSearchTerm]);

  const selectedVisual = watchClans.map((clan) => (
    <span
      key={clan.id}
      className="mr-2 inline-flex items-center rounded-lg border  border-amber-900 bg-gray-100 px-2 text-sm font-medium text-gray-800"
    >
      <div className="m-1 w-8">
        <AvatarImage href={clan.image} alt={clan.name} size={100} priority />
      </div>
      {clan.name}
      <X
        className="ml-2 h-6 w-6 rounded-full hover:bg-gray-300"
        onClick={(e) => {
          e.preventDefault();
          const newSelected = getUnique(
            watchClans.filter((e) => e.id !== clan.id),
            "id",
          );
          form.setValue("clans", newSelected);
        }}
      />
    </span>
  ));

  return (
    <div className="flex flex-col w-full items-center">
      <div className="flex flex-row w-full items-center">
        <Form {...form}>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="mx-1 w-full flex flex-col">
                <FormControl>
                  <Input
                    id="name"
                    placeholder={props.label ?? "Search clan"}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </Form>
        {props.inline && selectedVisual}
      </div>
      {!props.inline && (
        <div className="flex flex-row mt-1 ml-1 w-full">{selectedVisual}</div>
      )}
      {searchResults && watchName && (
        <div className="mt-1 w-full rounded-lg border-2 border-slate-500 bg-slate-100">
          {searchResults
            ?.filter((c) => props.showOwn || c.id !== props.userClanId)
            .map((clan) => (
              <div
                className="flex flex-row items-center p-2.5 hover:bg-slate-200"
                key={clan.id}
                onClick={(e) => {
                  e.preventDefault();
                  let newSelected = getUnique([...watchClans, clan], "id");
                  if (props.maxClans && newSelected.length > props.maxClans) {
                    newSelected = newSelected.slice(1);
                  }
                  form.setValue("name", "");
                  form.setValue("clans", newSelected);
                }}
              >
                <div className="basis-1/12">
                  <AvatarImage href={clan.image} alt={clan.name} size={100} priority />
                </div>
                <div className="ml-2">
                  <p>{clan.name}</p>
                </div>
              </div>
            ))}
          {searchResults.length === 0 && <div className="p-2.5">No clans found</div>}
        </div>
      )}
    </div>
  );
};

export default ClanSearchSelect;
