"use client";

import { useSearchParams } from "next/navigation";
import { api } from "@/app/_trpc/client";
import ContentBox from "@/layout/ContentBox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, AlertCircle, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { showMutationToast } from "@/libs/toast";
import Loader from "@/layout/Loader";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Suspense } from "react";

// Helper function to format dates
const formatDate = (date: Date | string): string => {
  return format(new Date(date), "MMM d, yyyy h:mm a");
};

export const EmailReminderSkeleton: React.FC = () => {
  return (
    <Skeleton className="h-[400px] w-full items-start justify-center flex">
      <Loader explanation="Loading email reminder settings" />
    </Skeleton>
  );
};

// Component that uses useSearchParams
const EmailReminderContent: React.FC = () => {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const secret = searchParams.get("secret");

  // Get email reminder data
  const {
    data: reminderData,
    isPending: isReminderLoading,
    refetch,
  } = api.misc.getEmailReminder.useQuery(
    { email: email || "", secret: secret || "" },
    { enabled: !!email && !!secret },
  );

  // Toggle email reminder mutation
  const toggleMutation = api.misc.toggleEmailReminder.useMutation({
    onMutate: () => {
      document.body.style.cursor = "wait";
    },
    onSettled: () => {
      document.body.style.cursor = "default";
    },
    onSuccess: (data) => {
      showMutationToast(data);
      if (data.success) {
        void refetch();
      }
    },
  });

  // Delete email reminder mutation
  const deleteMutation = api.misc.deleteEmailReminder.useMutation({
    onMutate: () => {
      document.body.style.cursor = "wait";
    },
    onSettled: () => {
      document.body.style.cursor = "default";
    },
    onSuccess: (data) => {
      showMutationToast(data);
      if (data.success) {
        void refetch();
      }
    },
  });

  // Handle toggle
  const handleToggle = (disabled: boolean) => {
    if (!email || !secret) return;
    toggleMutation.mutate({
      email,
      secret,
      disabled,
    });
  };

  // Handle delete
  const handleDelete = () => {
    if (!email || !secret) return;
    deleteMutation.mutate({
      email,
      secret,
    });
  };

  const isDisabled = reminderData?.disabled ?? false;
  const createdAt = reminderData?.createdAt
    ? formatDate(reminderData.createdAt)
    : "Unknown";
  const latestRequest = reminderData?.latestRejoinRequest
    ? formatDate(reminderData.latestRejoinRequest)
    : "No recent requests";

  return (
    <>
      {isReminderLoading || toggleMutation.isPending || deleteMutation.isPending ? (
        <EmailReminderSkeleton />
      ) : !reminderData ? (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Error
            </CardTitle>
            <CardDescription>
              There was a problem loading your email reminder settings
            </CardDescription>
          </CardHeader>
          <CardContent>This email is not registered for email reminders.</CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Reminder Settings
            </CardTitle>
            <CardDescription>Manage notification settings for {email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-sm text-muted-foreground">{email}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Created</p>
                <p className="text-sm text-muted-foreground">{createdAt}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Latest Request</p>
                <p className="text-sm text-muted-foreground">{latestRequest}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Status</p>
                <p className="text-sm text-muted-foreground">
                  {isDisabled ? "Disabled" : "Enabled"}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="email-notifications"
                checked={!isDisabled}
                onCheckedChange={(checked) => handleToggle(!checked)}
              />
              <Label htmlFor="email-notifications">
                {isDisabled
                  ? "Enable email notifications"
                  : "Disable email notifications"}
              </Label>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              This link is unique to your email address. Do not share it with others.
            </p>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex items-center gap-1"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Email Reminder</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this email reminder? This action
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardFooter>
        </Card>
      )}
    </>
  );
};

export default function EmailReminderPage() {
  return (
    <ContentBox
      title="Email Reminder Settings"
      subtitle="Manage your email notification preferences"
    >
      <Suspense fallback={<EmailReminderSkeleton />}>
        <EmailReminderContent />
      </Suspense>
    </ContentBox>
  );
}
