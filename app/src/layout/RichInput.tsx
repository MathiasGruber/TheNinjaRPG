import React, { useEffect, useState, useRef } from "react";
import EmojiPicker from "emoji-picker-react";
import { SendHorizontal, PartyPopper } from "lucide-react";
import { Controller } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
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
  isDirty?: boolean;
}

const RichInput: React.FC<RichInputProps> = (props) => {
  // Reference for emoji element
  const emojiRef = useRef<HTMLDivElement | null>(null);

  // Is emoji popover open
  const [emojiOpen, setEmojiOpen] = useState(false);

  // Handle button clicks
  const onDocumentKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case "Enter":
        if (
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.metaKey &&
          !props.disabled &&
          document.activeElement?.id === props.id
        ) {
          event.preventDefault();
          const value = (props.control._formValues[props.id] || "") as string;
          if (props.onSubmit) props.onSubmit(value);
          event.preventDefault();
        }
        break;
    }
  };

  // Add button handler
  useEffect(() => {
    if (props.onSubmit) {
      document.addEventListener("keydown", onDocumentKeyDown);
      return () => {
        document.removeEventListener("keydown", onDocumentKeyDown);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handler for clicks outside emoji selector
  const handleOutsideClick = (e: MouseEvent) => {
    if (emojiRef.current && !emojiRef.current.contains(e.target as HTMLElement)) {
      setEmojiOpen(false);
    }
  };

  // Handle clicks outside of the emoji element
  useEffect(() => {
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  });

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
              <Textarea
                {...field}
                id={props.id}
                autoFocus
                isDirty={props.isDirty}
                placeholder={props.placeholder}
                className="w-full"
              />
            );
          }}
        />

        <div
          className="z-50 absolute top-0 left-[50%] translate-x-[-50%]"
          ref={emojiRef}
        >
          <EmojiPicker
            open={emojiOpen}
            lazyLoadEmojis={true}
            onEmojiClick={(emojiData) => {
              const current = (field.value as string) || "";
              field.onChange(current + emojiData.emoji);
              setEmojiOpen(false);
            }}
          />
        </div>

        <div className="flex flex-row items-center absolute top-[50%] translate-y-[-50%] right-5">
          <PartyPopper
            className="h-8 w-8 text-gray-400 hover:cursor-pointer hover:text-gray-600 opacity-50"
            onClick={() => setEmojiOpen(!emojiOpen)}
          />
          {props.onSubmit && (
            <SendHorizontal
              className="h-8 w-8 text-gray-400 hover:cursor-pointer hover:text-gray-600 opacity-50"
              onClick={(e) => props.onSubmit && props.onSubmit(e)}
            />
          )}
        </div>
      </div>

      {props.error && <div className="text-xs italic text-red-500"> {props.error}</div>}
    </div>
  );
};

export default RichInput;
