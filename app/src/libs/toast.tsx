import { toast } from "react-toastify";
import { ErrorMessage } from "@hookform/error-message";
import type { FieldErrors } from "react-hook-form";
import type { ToastProps } from "react-toastify/dist/types/index.d";
import "react-toastify/dist/ReactToastify.css";

export const show_errors = (errors: FieldErrors<any>) => {
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
                <span>
                  <b>{key}:</b> {message}
                </span>
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
  console.error(errors);
  show_toast("Error submitting form", msgs, "error");
};

export const show_toast = (
  title: string,
  message: string | JSX.Element,
  type: string
) => {
  // Settings for toast
  const params = {
    position: "top-right",
    autoClose: 5000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: false,
    progress: undefined,
    theme: "light",
  } as ToastProps;
  // Return
  const msg = ({}) => (
    <div>
      <p className="font-bold">{title}</p>
      <p>{message}</p>
    </div>
  );
  // Show different types
  switch (type) {
    case "success":
      toast.success(msg, params);
      break;
    case "error":
      toast.error(msg, params);
      break;
    case "info":
      toast.info(msg, params);
      break;
    case "warning":
      toast.warning(msg, params);
      break;
    default:
      toast(msg, params);
      break;
  }
};
