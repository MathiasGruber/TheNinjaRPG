interface ButtonProps {
  id: string;
  label: string;
  image?: React.ReactNode;
  color?: "default" | "green" | "red" | "blue";
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
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
    <div className="m-1">
      <button
        id={props.id}
        className={`flex w-full flex-row items-center justify-center rounded-md p-3 px-5 font-bold text-white ${color} ${hover}`}
        onClick={props.onClick}
      >
        {props.image && props.image}
        {props.label}
      </button>
    </div>
  );
};

export default Button;
