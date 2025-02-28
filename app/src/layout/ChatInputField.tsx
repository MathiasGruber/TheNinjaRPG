"use client";

import { useState } from "react";
import { SiOpenai } from "@icons-pack/react-simple-icons";
import { Button } from "@/components/ui/button";
import { cn } from "src/libs/shadui";
import ChatBox from "@/layout/ChatBox";

interface ToolCall<NAME extends string, ARGS> {
  toolCallId: string;
  toolName: NAME;
  args: ARGS;
}

interface ChatInputFieldProps {
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
  aiProps: {
    apiEndpoint: string;
    systemMessage?: string;
  };
  onToolCall: (toolCall: ToolCall<string, unknown>) => void;
}

const ChatInputField: React.FC<ChatInputFieldProps> = ({ aiProps, onToolCall }) => {
  // State
  const [isOpen, setIsOpen] = useState(false);

  // Render
  return (
    <>
      <div className="pl-3 w-full flex flex-row justify-end">
        <Button
          className={!isOpen ? "bg-green-600" : ""}
          type="submit"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <SiOpenai
            className={cn("text-white", isOpen ? "animate-spin" : "")}
            size={22}
          />
        </Button>
      </div>
      {isOpen && (
        <ChatBox
          aiProps={aiProps}
          onToolCall={onToolCall}
          onClose={() => setIsOpen(false)}
          position="fixed"
        />
      )}
    </>
  );
};

export default ChatInputField;
