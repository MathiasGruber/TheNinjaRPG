import { useEffect } from "react";
import { useState } from "react";
import { api } from "@/utils/api";
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
import { canSeeSecretData } from "@/utils/permissions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { getPublicUsersSchema } from "@/validators/user";
import { Filter } from "lucide-react";
import { useUserData } from "@/utils/UserContext";
import type { GetPublicUsersSchema } from "@/validators/user";

interface UserFilteringProps {
  state: UserFilteringState;
}

const UserFiltering: React.FC<UserFilteringProps> = (props) => {
  // Global state
  const { data: userData } = useUserData();

  // Destructure the state
  const { setUsername, setBloodline, setVillage, setIp } = props.state;
  const { username, bloodline, village, ip } = props.state;

  // Query
  const { data: bloodlines } = api.bloodline.getAllNames.useQuery(undefined, {
    staleTime: Infinity,
  });
  const { data: villages } = api.village.getAll.useQuery(undefined, {
    staleTime: Infinity,
  });

  // Name search schema
  const form = useForm<GetPublicUsersSchema>({
    resolver: zodResolver(getPublicUsersSchema),
    defaultValues: { username: username, ip: ip },
  });
  const watchUsername = form.watch("username", "");
  const watchIp = form.watch("ip", "");

  // Update the state
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setUsername(watchUsername || "");
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [watchUsername, setUsername]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setIp(watchIp || "");
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [watchIp, setIp]);

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
          {/* USERNAME */}
          <div>
            <Form {...form}>
              <Label htmlFor="rank">Username</Label>
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input id="username" placeholder="Search User" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Form>
          </div>
          {/* IP */}
          {userData && canSeeSecretData(userData.role) && (
            <div>
              <Form {...form}>
                <Label htmlFor="rank">Last IP</Label>
                <FormField
                  control={form.control}
                  name="ip"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input id="ip" placeholder="Search IP" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Form>
            </div>
          )}
          {/* Bloodline */}
          <div>
            <Select onValueChange={(e) => setBloodline(e)}>
              <Label htmlFor="bloodline">Bloodline</Label>
              <SelectTrigger>
                <SelectValue placeholder={bloodline || "None"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key="None" value="None">
                  None
                </SelectItem>
                {bloodlines
                  ?.sort((a, b) => (a.name < b.name ? -1 : 1))
                  .map((bloodline) => (
                    <SelectItem key={bloodline.name} value={bloodline.id}>
                      {bloodline.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {/* Village */}
          <div>
            <Select onValueChange={(e) => setVillage(e)}>
              <Label htmlFor="village">Village</Label>
              <SelectTrigger>
                <SelectValue placeholder={village || "None"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key={"None"} value="None">
                  None
                </SelectItem>
                {villages
                  ?.sort((a, b) => (a.name < b.name ? -1 : 1))
                  .map((village) => (
                    <SelectItem key={village.name} value={village.id}>
                      {village.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default UserFiltering;

/** tRPC filter to be used on api.jutsu.getAll */
export const getFilter = (state: UserFilteringState) => {
  return {
    username: state.username ? state.username : undefined,
    ip: state.ip ? state.ip : undefined,
    bloodline: state.bloodline !== "None" ? state.bloodline : undefined,
    village: state.village !== "None" ? state.village : undefined,
  };
};

/** State for the Jutsu Filtering component */
export const useFiltering = () => {
  // State variables
  const [username, setUsername] = useState<string>("");
  const [ip, setIp] = useState<string>("");
  const [bloodline, setBloodline] = useState<string>("None");
  const [village, setVillage] = useState<string>("None");

  // Return all
  return {
    bloodline,
    ip,
    setBloodline,
    setIp,
    setUsername,
    setVillage,
    username,
    village,
  };
};

/** State type */
export type UserFilteringState = ReturnType<typeof useFiltering>;