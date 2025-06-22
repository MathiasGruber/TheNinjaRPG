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
import { X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Filter } from "lucide-react";
import { BanStates } from "@/drizzle/constants";
import { userSearchSchema } from "../validators/register";
import type { UserSearchSchema } from "../validators/register";
import type { BanState } from "@/drizzle/constants";

interface ReportFilteringProps {
  state: ReportFilteringState;
}

const ReportFiltering: React.FC<ReportFilteringProps> = (props) => {
  // Destructure the state
  const { reportedUser, reporterUser, status, system } = props.state;
  const { startDate, endDate, setStartDate, setEndDate } = props.state;
  const { setReportedUser, setReporterUser, setStatus, setSystem } = props.state;

  // Get all systems with reports
  const { data: systemsData } = api.reports.getReportSystemNames.useQuery(undefined);

  // Name search schemas
  const reporterForm = useForm<UserSearchSchema>({
    resolver: zodResolver(userSearchSchema),
    defaultValues: { username: reporterUser },
    mode: "all",
  });
  const watchReporterName = useWatch({
    control: reporterForm.control,
    name: "username",
    defaultValue: undefined,
  });

  const reportedForm = useForm<UserSearchSchema>({
    resolver: zodResolver(userSearchSchema),
    defaultValues: { username: reportedUser },
    mode: "all",
  });
  const watchReportedName = useWatch({
    control: reportedForm.control,
    name: "username",
    defaultValue: undefined,
  });

  // Update the state
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setReporterUser(watchReporterName);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [watchReporterName, setReporterUser]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setReportedUser(watchReportedName);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [watchReportedName, setReportedUser]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button id="filter-bloodline">
          <Filter className="sm:mr-2 h-6 w-6 hover:text-orange-500" />
          <p className="hidden sm:block">Filter</p>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96">
        <div className="grid grid-cols-2 gap-1 gap-x-3">
          {/* REPORTER NAME */}
          <div>
            <Form {...reporterForm}>
              <Label htmlFor="rank">Reporter User</Label>
              <FormField
                control={reporterForm.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input id="name" placeholder="Reporter" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Form>
          </div>
          {/* REPORTED NAME */}
          <div>
            <Form {...reportedForm}>
              <Label htmlFor="rank">Reported User</Label>
              <FormField
                control={reportedForm.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input id="name" placeholder="Reporter" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Form>
          </div>
          {/* STATUS */}
          <div>
            <Select onValueChange={(e) => setStatus(e as BanState)}>
              <Label htmlFor="rank">Status</Label>
              <div className="flex flex-row items-center gap-1">
                <SelectTrigger>
                  <SelectValue placeholder={status} />
                </SelectTrigger>
                <SelectContent>
                  {BanStates.map((stat) => (
                    <SelectItem key={stat} value={stat}>
                      {stat}
                    </SelectItem>
                  ))}
                </SelectContent>
                <Button
                  className="w-8 p-0 ml-1"
                  type="button"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setStatus(undefined);
                  }}
                >
                  <X className="h-5 w-5 stroke-1" />
                </Button>
              </div>
            </Select>
          </div>
          {/* STATUS */}
          <div>
            <Select onValueChange={(e) => setSystem(e)}>
              <Label htmlFor="rank">System</Label>
              <SelectTrigger>
                <SelectValue placeholder={system} />
              </SelectTrigger>
              <SelectContent>
                {systemsData?.map((entry) => (
                  <SelectItem key={entry.system} value={entry.system}>
                    {entry.system}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* START DATE */}
          <div>
            <Label htmlFor="start-date">Start Date</Label>
            <div className="flex flex-row items-center gap-1">
              <Input
                id="start-date"
                type="date"
                value={startDate ? startDate.toISOString().slice(0, 10) : ""}
                max={new Date().toISOString().slice(0, 10)}
                min="1900-01-01"
                onChange={(e) => {
                  const val = e.target.value;
                  setStartDate(val ? new Date(val) : undefined);
                }}
              />
            </div>
          </div>
          {/* END DATE */}
          <div>
            <Label htmlFor="end-date">End Date</Label>
            <div className="flex flex-row items-center gap-1">
              <Input
                id="end-date"
                type="date"
                value={endDate ? endDate.toISOString().slice(0, 10) : ""}
                max={new Date().toISOString().slice(0, 10)}
                min="1900-01-01"
                onChange={(e) => {
                  const val = e.target.value;
                  setEndDate(val ? new Date(val) : undefined);
                }}
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ReportFiltering;

/** tRPC filter to be used on api.jutsu.getAll */
export const getFilter = (state: ReportFilteringState) => {
  return {
    reportedUser: state.reportedUser !== "None" ? state.reportedUser : undefined,
    reporterUser: state.reporterUser !== "None" ? state.reporterUser : undefined,
    status: state.status,
    startDate: state.startDate,
    endDate: state.endDate,
    system: state.system !== "None" ? state.system : undefined,
  };
};

/** State for the Jutsu Filtering component */
export const useFiltering = () => {
  // State variables
  const [reportedUser, setReportedUser] = useState<string>("None");
  const [reporterUser, setReporterUser] = useState<string>("None");
  const [status, setStatus] = useState<BanState | undefined>("UNVIEWED");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [system, setSystem] = useState<string>("None");

  return {
    reportedUser,
    reporterUser,
    status,
    startDate,
    endDate,
    system,
    setReportedUser,
    setReporterUser,
    setStatus,
    setStartDate,
    setEndDate,
    setSystem,
  };
};

/** State type */
export type ReportFilteringState = ReturnType<typeof useFiltering>;
