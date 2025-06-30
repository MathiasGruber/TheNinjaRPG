import { toast } from "@/components/ui/use-toast";
import { ErrorMessage } from "@hookform/error-message";
import { ToastAction } from "@/components/ui/toast";
import { CheckCircle, XOctagon } from "lucide-react";
import type { FieldErrors } from "react-hook-form";
import type { ToastActionElement } from "src/components/ui/toast";

/**
 * Convenience wrapper for showing toast
 * @param data
 */
export const showMutationToast = (data: {
  success: boolean;
  message: React.ReactNode;
  title?: string;
  action?: ToastActionElement;
  variant?: "destructive" | "default";
}) => {
  // Only show non-trivial messages
  if (data.message && data.message !== "OK") {
    if (data.success) {
      toast({
        title: data?.title ?? "Success",
        description: data.message,
        variant: data.variant ?? "default",
        action: data.action ?? (
          <ToastAction 
            altText="OK" 
            className="bg-green-600 h-5 md:h-10"
            onClick={() => toast.dismiss()}
          >
            <CheckCircle className="h-4 w-4 md:h-6 md:w-6 text-white my-4" />
          </ToastAction>
        ),
      });
    } else {
      toast({
        title: data?.title ?? "Error",
        description: data.message,
        variant: data.variant ?? "default",
        action: data.action ?? (
          <ToastAction 
            altText="OK" 
            className="bg-red-600 h-5 md:h-10"
            onClick={() => toast.dismiss()}
          >
            <XOctagon className="h-4 w-4 md:h-6 md:w-6 text-white my-4" />
          </ToastAction>
        ),
      });
    }
  }
};

/**
 * Show hookForm errors as a toast
 * @param errors
 */
export const showFormErrorsToast = (errors: FieldErrors<any>) => {
  const msgs = (
    <>
      {Object.keys(errors).map((key, i) => {
        if (key) {
          return (
            <ErrorMessage
              key={i}
              errors={errors}
              name={key}
              render={({ message }: { message: string }) => (
                <p>
                  <b>{key}:</b> {message ? message : "See form for details"}
                </p>
              )}
            />
          );
        } else {
          return (
            <p key={i}>
              <b>Overall:</b> {errors[key]?.message as string}
            </p>
          );
        }
      })}
    </>
  );
  toast({
    variant: "destructive",
    title: "Form Validation Error",
    description: msgs,
  });
};
