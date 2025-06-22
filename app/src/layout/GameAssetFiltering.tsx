import { useEffect } from "react";
import { useState } from "react";
import { api } from "@/app/_trpc/client";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
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
import { MultiSelect } from "@/components/ui/multi-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { gameAssetSchema } from "@/validators/asset";
import { Filter } from "lucide-react";
import { GameAssetTypes } from "@/drizzle/constants";
import type { GameAssetType } from "@/drizzle/constants";
import type { GameAssetSchema } from "@/validators/asset";

interface GameAssetFilteringProps {
  state: GameAssetFilteringState;
}

const GameAssetFiltering: React.FC<GameAssetFilteringProps> = (props) => {
  // Destructure the state
  const { setName, setTags, setType, setFolder } = props.state;
  const { name, tags, type, folder } = props.state;

  // Name search schema
  const form = useForm<GameAssetSchema>({
    resolver: zodResolver(gameAssetSchema),
    defaultValues: { name: name, type: type, folder: folder },
  });
  const watchName = useWatch({ control: form.control, name: "name", defaultValue: "" });

  // Get all content tags
  const { data: dbTags } =
    api.gameAsset.getAllGameAssetContentTagNames.useQuery(undefined);

  // Get all folders
  const { data: dbFolders } = api.gameAsset.getAllFolders.useQuery(undefined);

  // Update the state
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setName(watchName || "");
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [watchName, setName]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button id="filter-bloodline">
          <Filter className="sm:mr-2 h-6 w-6 hover:text-orange-500" />
          <p className="hidden sm:block">Filter</p>
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="grid grid-cols-2 gap-1 gap-x-3">
          {/* Search */}
          <div>
            <Form {...form}>
              <Label htmlFor="rank">Name</Label>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input id="name" placeholder="Name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Form>
          </div>
          {/* Type */}
          <div className="">
            <Label htmlFor="method">Type</Label>
            <div className="flex flex-row items-center">
              <Select onValueChange={(m) => setType(m as GameAssetType)}>
                <SelectTrigger>
                  <SelectValue placeholder={type || "None"} />
                </SelectTrigger>
                <SelectContent>
                  {GameAssetTypes.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Folder */}
          <div>
            <Label htmlFor="folder">Folder</Label>
            <div className="flex flex-row items-center">
              <Select
                onValueChange={(v) => setFolder(v === "__ALL__" ? "" : v)}
                value={folder || "__ALL__"}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select folder" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL__">All folders</SelectItem>
                  {dbFolders?.map((f) => (
                    <SelectItem key={f.folder} value={f.folder}>
                      {f.folder}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Tags */}
          {dbTags && (
            <div>
              <Label htmlFor="tags">Tags by GPT-4o</Label>
              <MultiSelect
                selected={tags}
                options={dbTags.map((tag) => ({
                  value: tag.name,
                  label: tag.name,
                }))}
                onChange={setTags}
              />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default GameAssetFiltering;

/** tRPC filter to be used on api.jutsu.getAll */
export const getFilter = (state: GameAssetFilteringState) => {
  return {
    name: state.name ? state.name : undefined,
    type: state.type ? state.type : "STATIC",
    tags: state.tags.length !== 0 ? state.tags : undefined,
    folder: state.folder ? state.folder : undefined,
  };
};

/** State for the Jutsu Filtering component */
export const useFiltering = () => {
  // State variables
  const [name, setName] = useState<string>("");
  const [tags, setTags] = useState<string[]>([]);
  const [type, setType] = useState<GameAssetType>("STATIC");
  const [folder, setFolder] = useState<string>("");
  // Return all
  return {
    name,
    type,
    tags,
    folder,
    setName,
    setTags,
    setType,
    setFolder,
  };
};

/** State type */
export type GameAssetFilteringState = ReturnType<typeof useFiltering>;
