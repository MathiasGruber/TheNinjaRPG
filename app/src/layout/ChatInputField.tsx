import { z } from "zod";
import Image from "next/image";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

interface ChatInputFieldProps {
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
  onChat: (text: string) => void;
}

const ChatInputField: React.FC<ChatInputFieldProps> = ({ inputProps, onChat }) => {
  const id = inputProps.id ?? "chat";

  const FormSchema = z.object({ [id]: z.string() });
  type FormSchemaType = z.infer<typeof FormSchema>;
  const form = useForm<FormSchemaType>({
    resolver: zodResolver(FormSchema),
    defaultValues: { [id]: "" },
  });

  function onSubmit(data: FormSchemaType) {
    const text = data[id];
    if (text) onChat(text);
  }

  return (
    <div className="relative pl-3 w-full flex flex-row justify-end">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <FormField
            control={form.control}
            name={id}
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    {...inputProps}
                    {...field}
                    autoFocus
                    className="max-w-96 min-w-72"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            disabled={inputProps.disabled}
            className="bg-green-600 absolute top-0 right-0"
            type="submit"
          >
            <Image alt="OpenAI Logo" src="/images/openai.webp" width={20} height={20} />
          </Button>
        </form>
      </Form>
    </div>
  );
};

export default ChatInputField;
