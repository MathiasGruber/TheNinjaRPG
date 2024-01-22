import React from "react";

interface ModalProps {
  title: string;
  children: string | React.ReactNode;
  className?: string;
  proceed_label?: string;
  confirmClassName?: string;
  isValid?: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onAccept?: (e: React.MouseEvent<HTMLInputElement, MouseEvent>) => void;
}

const Modal: React.FC<ModalProps> = (props) => {
  const confirmBtnClassName = props.confirmClassName
    ? props.confirmClassName
    : "bg-blue-600 text-white hover:bg-blue-700";

  return (
    <>
      <div
        className="fixed bottom-0 left-0 right-0 top-0 z-20 h-full w-full bg-black opacity-80"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          props.setIsOpen(false);
        }}
      ></div>
      <div
        className={`fixed left-1/2 top-1/2 z-20 my-2 max-h-screen w-11/12 -translate-x-1/2 -translate-y-1/2 transform overflow-y-auto rounded-lg bg-gray-700 shadow ${props.className}`}
      >
        <div className="flex items-start justify-between rounded-t border-b border-gray-600 p-4">
          <h3 className="text-xl font-semibold text-white">{props.title}</h3>
          <button
            type="button"
            className="ml-auto inline-flex items-center rounded-lg bg-transparent p-1.5 text-sm text-gray-400 hover:bg-gray-200 hover:text-gray-900"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              props.setIsOpen(false);
            }}
          >
            <svg
              aria-hidden="true"
              className="h-5 w-5"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              ></path>
            </svg>
            <span className="sr-only">Close modal</span>
          </button>
        </div>
        <div className="space-y-6 p-6">
          <div className="text-lg leading-relaxed text-gray-400">{props.children}</div>
        </div>
        <div className="flex items-center space-x-2 rounded-b border-t border-gray-600 p-6">
          {props.proceed_label && (
            <input
              type="submit"
              value={props.proceed_label}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                props.onAccept && props.onAccept(e);
                if (props.isValid === undefined || props.isValid) {
                  props.setIsOpen(false);
                }
              }}
              className={`rounded-lg z-30  px-5 py-2.5 text-center text-sm font-medium ${confirmBtnClassName}`}
            ></input>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              props.setIsOpen(false);
            }}
            className="z-30 rounded-lg border  border-gray-500 bg-gray-700 px-5 py-2.5  text-sm font-medium text-gray-300  hover:bg-gray-600 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
};

export default Modal;
