import React, { useEffect, useState, useRef } from "react";
import EmojiPicker from "emoji-picker-react";
import { SendHorizontal, PartyPopper } from "lucide-react";
import { Controller } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
import { useController, useWatch } from "react-hook-form";
import type { Control } from "react-hook-form";
import UserSearchSelect from "./UserSearchSelect";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { getSearchValidator } from "@/validators/register";

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
  enableMentions?: boolean;
}

const RichInput: React.FC<RichInputProps> = (props) => {
  // Reference for emoji element
  const emojiRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Is emoji popover open
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Show mentions interface
  const [showMentions, setShowMentions] = useState(false);
  // Cursor position for mention insertion
  const [cursorPosition, setCursorPosition] = useState<{
    start: number;
    end: number;
  } | null>(null);

  // Form for UserSearchSelect
  const maxUsers = 1;
  const userSearchSchema = getSearchValidator({ max: maxUsers });
  const mentionForm = useForm<z.infer<typeof userSearchSchema>>({
    resolver: zodResolver(userSearchSchema),
    defaultValues: { username: "", users: [] },
  });

  // Watch for selected users with useWatch instead of .watch
  const selectedUsers = useWatch({
    control: mentionForm.control,
    name: "users",
    defaultValue: [],
  });

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
          document.activeElement?.id === props.id &&
          !showMentions
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
  }, [showMentions]);

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

  // Function to check for mentions
  const checkForMention = (text: string) => {
    if (!props.enableMentions) return;

    // Get the current cursor position
    const cursorPos = textareaRef.current?.selectionStart || 0;

    // Get text up to cursor position
    const textUpToCursor = text.substring(0, cursorPos);

    // Find the last word being typed (from last space or beginning of text to cursor)
    const lastSpacePos = textUpToCursor.lastIndexOf(" ");
    const lastNewlinePos = textUpToCursor.lastIndexOf("\n");
    const startPos = Math.max(lastSpacePos, lastNewlinePos) + 1;
    const lastWord = textUpToCursor.substring(startPos);

    if (lastWord.startsWith("@") && lastWord.length > 1) {
      const query = lastWord.substring(1); // Remove @ symbol
      mentionForm.setValue("username", query);
      setShowMentions(true);
      setCursorPosition({ start: startPos, end: cursorPos });
    } else {
      setShowMentions(false);
    }
  };

  // Handle text changes
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    field.onChange(e);
    checkForMention(e.target.value);
  };

  // Handle user selection from UserSearchSelect
  useEffect(() => {
    if (selectedUsers.length > 0 && cursorPosition) {
      // Get the latest selected user
      const lastSelectedUser = selectedUsers[selectedUsers.length - 1];

      // Safely check if we have a valid user with optional chaining
      if (lastSelectedUser?.username) {
        const currentValue = (field.value as string) || "";

        // Replace the @mention query with the selected username
        const before = currentValue.substring(0, cursorPosition.start);
        const after = currentValue.substring(cursorPosition.end);
        const newValue = before + "@" + lastSelectedUser.username + " " + after;

        field.onChange(newValue);

        // Reset the mentions interface
        setShowMentions(false);
        mentionForm.setValue("users", []);
        mentionForm.setValue("username", "");

        // Set focus back to textarea
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            const newCursorPos = before.length + lastSelectedUser.username.length + 2; // +2 for @ and space
            textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
          }
        }, 0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUsers]);

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
          render={({ field: controllerField }) => {
            return (
              <Textarea
                {...controllerField}
                ref={(e) => {
                  textareaRef.current = e;
                }}
                id={props.id}
                autoFocus
                isDirty={props.isDirty}
                placeholder={props.placeholder}
                className="w-full"
                onChange={handleTextChange}
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
            style={
              {
                "--epr-emoji-gap": "2px",
                "--epr-emoji-size": "16px",
              } as React.CSSProperties
            }
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

        {showMentions && props.enableMentions && (
          <div className="absolute left-0 right-0 mt-1 z-50">
            <UserSearchSelect
              useFormMethods={mentionForm}
              showYourself={true}
              inline={true}
              maxUsers={1}
              showAi={true}
            />
          </div>
        )}
      </div>

      {props.error && <div className="text-xs italic text-red-500"> {props.error}</div>}
    </div>
  );
};

export default RichInput;
