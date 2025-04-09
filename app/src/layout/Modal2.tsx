/**
 * This is a modal that is used to display a modal.
 * This is a replacement for the Modal component, which will be deprecated.
 */
import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Modal2Props {
  title: string;
  children: string | React.ReactNode;
  className?: string;
  proceed_label?: string;
  confirmClassName?: string;
  isValid?: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onAccept?: (
    e:
      | React.MouseEvent<HTMLButtonElement, MouseEvent>
      | React.KeyboardEvent<KeyboardEvent>,
  ) => void;
  onClose?: () => void;
}

const Modal2: React.FC<Modal2Props> = (props) => {
  const confirmBtnClassName = props.confirmClassName
    ? props.confirmClassName
    : "bg-blue-600 text-white hover:bg-blue-700";

  // Handle key-presses for Enter key
  useEffect(() => {
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" && props?.onAccept) {
        props.onAccept(event as unknown as React.KeyboardEvent<KeyboardEvent>);
      }
    };
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDialogClose = () => {
    if (props.onClose) props.onClose();
    props.setIsOpen(false);
  };

  return (
    <DialogContent
      className={props.className || ""}
      onEscapeKeyDown={handleDialogClose}
      onInteractOutside={handleDialogClose}
    >
      <DialogHeader>
        <DialogTitle>{props.title}</DialogTitle>
      </DialogHeader>

      <div className="space-y-6 py-4">{props.children}</div>

      <DialogFooter>
        {props.proceed_label && (
          <Button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (props.onAccept) props.onAccept(e);
              if (props.isValid === undefined || props.isValid) {
                props.setIsOpen(false);
              }
            }}
            className={`rounded-lg z-30 ${confirmBtnClassName}`}
          >
            {props.proceed_label}
          </Button>
        )}
        <Button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDialogClose();
          }}
          className="z-30 rounded-lg border border-gray-500 bg-gray-700 text-sm font-medium text-gray-300 hover:bg-gray-600 hover:text-white"
        >
          Close
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

export default Modal2;
