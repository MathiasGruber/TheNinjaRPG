interface ButtonProps {
  id: string;
  label: string | React.ReactNode;
  image?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  color?: "default" | "green" | "red" | "blue";
  noJustify?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  marginClass?: string;
  borderClass?: string;
}

const Button: React.FC<ButtonProps> = (props) => {
  let color = "bg-amber-900";
  let hover = "hover:bg-orange-800";
  switch (props.color) {
    case "green":
      color = "bg-green-700";
      hover = "hover:bg-green-800";
      break;
    case "red":
      color = "bg-red-700";
      hover = "hover:bg-red-800";
      break;
    case "blue":
      color = "bg-blue-700";
      hover = "hover:bg-blue-800";
      break;
  }

  return (
    <div
      className={`${props.className ?? ""} relative ${
        props.marginClass !== undefined ? props.marginClass : "m-1"
      }`}
    >
      <button
        {...(props.disabled && { disabled: true })}
        id={props.id}
        className={`relative flex w-full flex-row items-center ${
          props.noJustify ? "" : "justify-center"
        } ${
          props.borderClass ?? "rounded-md"
        } p-3 px-5 font-bold text-white ${color} ${hover} ${
          props.disabled ? "cursor-not-allowed opacity-50" : ""
        }`}
        onClick={props.onClick}
      >
        {props.image && props.image}
        {props.label}
      </button>
    </div>
  );
};

export default Button;
