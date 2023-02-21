interface SubmitButtonProps {
  id: string;
  label: string;
  image?: React.ReactNode;
  onClick?: () => void;
}

const SubmitButton: React.FC<SubmitButtonProps> = (props) => {
  return (
    <div className="m-1">
      <input
        className="w-full rounded-md bg-amber-900 p-2 font-bold text-white hover:bg-orange-800 focus:outline-none focus:ring-4 focus:ring-orange-500"
        {...(props.onClick && { onClick: props.onClick })}
        type="submit"
        value={props.label}
      ></input>
    </div>
  );
};

export default SubmitButton;
