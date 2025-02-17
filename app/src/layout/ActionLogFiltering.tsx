import { useEffect } from "react";
import { useState } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { actionLogSchema } from "@/validators/logs";
import { Filter } from "lucide-react";
import { LOG_TYPES } from "@/drizzle/constants";
import type { LogType } from "@/drizzle/constants";
import type { ActionLogSchema } from "@/validators/logs";

interface ActionLogFilteringProps {
  state: ActionLogFilteringState;
}

const ActionLogFiltering: React.FC<ActionLogFilteringProps> = (props) => {
  // Destructure the state
  const { setSearch, setLogType } = props.state;
  const { search, logtype } = props.state;

  // Name search schema
  const form = useForm<ActionLogSchema>({
    resolver: zodResolver(actionLogSchema),
    defaultValues: { search: search, logtype: logtype },
  });
  const watchSearch = form.watch("search", "");

  // Update the state
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setSearch(watchSearch || "");
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [watchSearch, setSearch]);

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
              <Label htmlFor="rank">Search</Label>
              <FormField
                control={form.control}
                name="search"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input id="search" placeholder="Search" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Form>
            <p className="text-xs">Search IDs for bloodlines</p>
          </div>
          {/* Type */}
          <div className="">
            <Label htmlFor="method">Type</Label>
            <div className="flex flex-row items-center">
              <Select onValueChange={(m) => setLogType(m as LogType)}>
                <SelectTrigger>
                  <SelectValue placeholder={logtype || "None"} />
                </SelectTrigger>
                <SelectContent>
                  {LOG_TYPES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ActionLogFiltering;

/** tRPC filter to be used on api.jutsu.getAll */
export const getFilter = (state: ActionLogFilteringState) => {
  return {
    search: state.search ? state.search : undefined,
    logtype: state.logtype ? state.logtype : "user",
  };
};

/** State for the Jutsu Filtering component */
export const useFiltering = (logType: LogType = "user") => {
  // State variables
  const [search, setSearch] = useState<string>("");
  const [logtype, setLogType] = useState<LogType>(logType);

  // Return all
  return {
    logtype,
    search,
    setSearch,
    setLogType,
  };
};

/** State type */
export type ActionLogFilteringState = ReturnType<typeof useFiltering>;
