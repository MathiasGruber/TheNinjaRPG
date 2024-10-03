import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface ModalProps {
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
}

const Modal: React.FC<ModalProps> = (props) => {
  const confirmBtnClassName = props.confirmClassName
    ? props.confirmClassName
    : "bg-blue-600 text-white hover:bg-blue-700";

  // Handle key-presses
  useEffect(() => {
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case "Escape":
          props.setIsOpen(false);
          break;
        case "Enter":
          if (props?.onAccept)
            props.onAccept(event as unknown as React.KeyboardEvent<KeyboardEvent>);
          break;
      }
    };
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div
        className="fixed bottom-0 left-0 right-0 top-0 z-40 h-full w-full bg-black opacity-80"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          props.setIsOpen(false);
        }}
      ></div>
      <div
        className={`fixed left-1/2 top-1/2 z-40 my-2 max-h-screen w-11/12 -translate-x-1/2 -translate-y-1/2 transform overflow-y-auto rounded-lg bg-gray-700 shadow ${props.className}`}
      >
        <div className="flex items-start justify-between rounded-t border-b border-gray-600 p-4">
          <h3 className="text-xl font-semibold text-white">{props.title}</h3>
          <Button
            className="ml-auto inline-flex items-center rounded-lg bg-transparent p-1.5 text-sm text-gray-400 hover:bg-gray-200 hover:text-gray-900"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              props.setIsOpen(false);
            }}
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close modal</span>
          </Button>
        </div>
        <div className="space-y-6 p-6">
          <div className="text-lg leading-relaxed text-gray-400">{props.children}</div>
        </div>
        <div className="flex items-center space-x-2 rounded-b border-t border-gray-600 p-6">
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
              props.setIsOpen(false);
            }}
            className="z-30 rounded-lg border border-gray-500 bg-gray-700 text-sm font-medium text-gray-300 hover:bg-gray-600 hover:text-white"
          >
            Close
          </Button>
        </div>
      </div>
    </>
  );
};

export default Modal;
