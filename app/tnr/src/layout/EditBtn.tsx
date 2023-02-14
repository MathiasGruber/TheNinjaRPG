import React from "react";
import Link from "next/link";
import IconEdit from "./IconEdit";

interface EditBtnProps {
  href: string;
}

const EditBtn: React.FC<EditBtnProps> = (props) => {
  return (
    <Link href={props.href ?? ""}>
      <IconEdit />
    </Link>
  );
};

export default EditBtn;
