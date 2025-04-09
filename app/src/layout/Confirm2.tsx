/**
 * This is a confirmation modal that is used to display a modal.
 * This is a replacement for the Confirm component, which will be deprecated.
 */
import React, { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import Modal2 from "./Modal2";

interface Confirm2Props {
  title: string;
  button: React.ReactNode;
  className?: string;
  children: string | React.ReactNode;
  confirmClassName?: string;
  proceed_label?: string;
  isValid?: boolean;
  disabled?: boolean;
  onAccept?: (
    e:
      | React.MouseEvent<HTMLButtonElement, MouseEvent>
      | React.KeyboardEvent<KeyboardEvent>,
  ) => void;
  onClose?: () => void;
}

const Confirm2: React.FC<Confirm2Props> = (props) => {
  const [showModal, setShowModal] = useState<boolean>(false);

  return (
    <>
      <span
        onClick={(e) => {
          if (props.disabled) return;
          e.preventDefault();
          e.stopPropagation();
          setShowModal(true);
        }}
        className={props.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
      >
        {props.button}
      </span>

      {showModal && (
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <Modal2
            title={props.title}
            setIsOpen={setShowModal}
            proceed_label={props.proceed_label ? props.proceed_label : "Proceed"}
            confirmClassName={props.confirmClassName}
            onAccept={props.onAccept}
            className={props.className}
            isValid={props.isValid}
            onClose={props.onClose}
          >
            {props.children}
          </Modal2>
        </Dialog>
      )}
    </>
  );
};

export default Confirm2;
