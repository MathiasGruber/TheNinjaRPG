interface ButtonProps {
  id: string;
  label: string;
  image?: React.ReactNode;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

const Button: React.FC<ButtonProps> = (props) => {
  return (
    <div className="m-1">
      <button
        id={props.id}
        className="flex w-full flex-row items-center justify-center rounded-md bg-amber-900 p-2 px-2 font-bold text-white hover:bg-orange-800"
        onClick={(e) => props.onClick(e)}
      >
        {props.image && props.image}
        {props.label}
      </button>
    </div>
  );
};

export default Button;
