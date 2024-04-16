import React, { useEffect, useState } from "react";
import EmojiPicker from "emoji-picker-react";
import { SendHorizontal, PartyPopper } from "lucide-react";
import { Controller } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useController } from "react-hook-form";
import type { Control } from "react-hook-form";

interface RichInputProps {
  id: string;
  refreshKey?: number;
  label?: string;
  height: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  control: Control<any>;
  onSubmit?: (e: any) => void;
}

const RichInput: React.FC<RichInputProps> = (props) => {
  // Is emoji popover open
  const [emojiOpen, setEmojiOpen] = useState(false);

  // Handle button clicks
  const onDocumentKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case "Enter":
        if (!event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          props.onSubmit && props.onSubmit(event);
        }
        break;
    }
  };

  // Add button handler
  useEffect(() => {
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { field } = useController({
    name: props.id,
    control: props.control,
    rules: { required: true },
  });

  return (
    <div className={`${props.disabled ? "opacity-50" : ""}`}>
      <label htmlFor={props.id} className="mb-2 block text-sm font-medium">
        {props.label}
      </label>
      <div className="relative">
        <Controller
          key={props.refreshKey}
          name={props.id}
          control={props.control}
          rules={{ required: true }}
          render={({ field }) => {
            return (
              <Textarea {...field} placeholder={props.placeholder} className="w-full" />
            );
          }}
        />

        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger>
            <PartyPopper className="absolute top-[50%] translate-y-[-50%] right-14 h-8 w-8 text-gray-400 hover:cursor-pointer hover:text-gray-600 opacity-50" />
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={0}>
            <EmojiPicker
              onEmojiClick={(emojiData) => {
                const current = (field.value as string) || "";
                field.onChange(current + emojiData.emoji);
                setEmojiOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>

        <SendHorizontal
          className="absolute top-[50%] translate-y-[-50%] right-5 h-8 w-8 text-gray-400 hover:cursor-pointer hover:text-gray-600 opacity-50"
          onClick={(e) => props.onSubmit && props.onSubmit(e)}
        />
      </div>

      {props.error && <div className="text-xs italic text-red-500"> {props.error}</div>}
    </div>
  );
};

export default RichInput;
