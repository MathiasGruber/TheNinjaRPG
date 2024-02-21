import { z } from "zod";
import Image from "next/image";
import InputField, { type InputFieldProps } from "@/layout/InputField";
import Loader from "@/layout/Loader";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

interface ChatInputFieldProps extends InputFieldProps {
  onSubmit: (text: string) => void;
  isLoading: boolean;
}

const ChatInputField: React.FC<ChatInputFieldProps> = (props) => {
  // Form for keeping track of input state
  const id = props.id;
  const schema = z.object({ [id]: z.string() });
  const {
    register,
    watch,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
  });
  const freeText = watch(id);

  return (
    <div className="pl-3 grow">
      <InputField
        {...props}
        register={register}
        disabled={props.isLoading}
        error={errors.freeText?.message}
        autofocus={true}
        options={
          <Button
            type="submit"
            className={`absolute top-0 right-0 h-full bg-green-600 border-primary border ${
              props.isLoading ? "disabled" : ""
            }`}
            onClick={(e) => {
              e.preventDefault();
              props.onSubmit(freeText);
            }}
          >
            {props.isLoading ? (
              <Loader noPadding={true} />
            ) : (
              <Image
                alt="OpenAI Logo"
                src="/images/openai.webp"
                width={20}
                height={20}
              />
            )}
          </Button>
        }
      />
    </div>
  );
};

export default ChatInputField;
