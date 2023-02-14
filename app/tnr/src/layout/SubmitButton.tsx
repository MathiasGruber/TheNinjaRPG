interface SubmitButtonProps {
  id: string;
  label: string;
}

const SubmitButton: React.FC<SubmitButtonProps> = (props) => {
  return (
    <div className="m-3">
      <input
        className="my-5 w-full rounded-lg bg-amber-900 p-4 font-bold text-white hover:bg-orange-800 focus:outline-none focus:ring-4 focus:ring-orange-500"
        type="submit"
        value={props.label}
      ></input>
    </div>
  );
};

export default SubmitButton;
