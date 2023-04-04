import React, { useState } from "react";
import Modal from "./Modal";

interface ConfirmProps {
  title: string;
  button: React.ReactNode;
  children: string | React.ReactNode;
  proceed_label?: string;
  isValid?: boolean;
  onAccept?: (e: React.MouseEvent<HTMLInputElement, MouseEvent>) => void;
}

const Confirm: React.FC<ConfirmProps> = (props) => {
  const [showModal, setShowModal] = useState<boolean>(false);
  if (showModal) {
    return (
      <Modal
        title={props.title}
        setIsOpen={setShowModal}
        proceed_label={props.proceed_label ? props.proceed_label : "Proceed"}
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
          setShowModal(true);
        }}
      >
        {props.button}
      </div>
    );
  }
};

export default Confirm;
