import React, { useState } from "react";
import Modal from "./Modal";

interface ConfirmProps {
  title: string;
  button: React.ReactNode;
  children: string | React.ReactNode;
  confirmClassName?: string;
  proceed_label?: string;
  isValid?: boolean;
  onAccept?: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
}

const Confirm: React.FC<ConfirmProps> = (props) => {
  const [showModal, setShowModal] = useState<boolean>(false);
  if (showModal) {
    return (
      <Modal
        title={props.title}
        setIsOpen={setShowModal}
        proceed_label={props.proceed_label ? props.proceed_label : "Proceed"}
        confirmClassName={props.confirmClassName}
        onAccept={props.onAccept}
        isValid={props.isValid}
      >
        {props.children}
      </Modal>
    );
  } else {
    return (
      <div
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowModal(true);
        }}
      >
        {props.button}
      </div>
    );
  }
};

export default Confirm;
