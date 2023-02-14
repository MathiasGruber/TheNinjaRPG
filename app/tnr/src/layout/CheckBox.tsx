import { type UseFormRegister } from "react-hook-form";

interface CheckBoxProps {
  label: string | React.ReactNode;
  id: string;
  error?: string;
  register?: UseFormRegister<any>;
}

const CheckBox: React.FC<CheckBoxProps> = (props) => {
  const text_color = props.error ? "text-red-500" : "text-black-500";
  return (
    <div className="mb-4 flex items-center">
      <input
        {...(props.register && props.register(props.id))}
        id={props.id}
        type="checkbox"
        value=""
        className="h-4 w-4"
      />
      <label
        htmlFor="default-checkbox"
        className={`text-sm ml-2 font-medium ${text_color}`}
      >
        {props.label}
        {props.error && <p className="text-xs">- {props.error}</p>}
      </label>
    </div>
  );
};

export default CheckBox;
