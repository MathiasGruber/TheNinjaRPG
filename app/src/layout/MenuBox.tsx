import React from "react";

interface MenuBoxProps {
  children: React.ReactNode;
  link?: React.ReactNode;
  title: string;
}

const MenuBox: React.FC<MenuBoxProps> = (props) => {
  return (
    <div className="mx-2 mb-5 rounded-md bg-orange-100">
      <div className="flex rounded-t-md bg-gradient-to-t from-orange-800 to-orange-600 p-3 font-bold">
        <div>{props.title}</div>
        <div className="grow"></div> <div>{props.link}</div>
      </div>
      <div className="m-1 rounded-md bg-yellow-50 p-3">{props.children}</div>
    </div>
  );
};

export default MenuBox;
