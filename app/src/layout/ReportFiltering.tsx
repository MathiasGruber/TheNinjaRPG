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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useForm } from "react-hook-form";
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
  const watchReporterName = reporterForm.watch("username", undefined);

  const reportedForm = useForm<UserSearchSchema>({
    resolver: zodResolver(userSearchSchema),
    defaultValues: { username: reportedUser },
    mode: "all",
  });
  const watchReportedName = reportedForm.watch("username", undefined);

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
      <PopoverContent>
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
            </Select>
          </div>
          {/* STATUS */}
          <div>
            <Select onValueChange={(e) => setSystem(e)}>
              <Label htmlFor="rank">Status</Label>
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
            <Label htmlFor="rank">Start Date</Label>
            <div className="flex flex-row items-center gap-1">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(date) => setStartDate(date)}
                disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                initialFocus
              />
            </div>
          </div>
          {/* END DATE */}
          <div>
            <Label htmlFor="rank">End Date</Label>
            <div className="flex flex-row items-center gap-1">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={(date) => setEndDate(date)}
                disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                initialFocus
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
  const [status, setStatus] = useState<BanState>("UNVIEWED");
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
