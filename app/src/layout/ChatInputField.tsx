"use client";

import { z } from "zod";
import { useEffect, useRef } from "react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import AvatarImage from "@/layout/Avatar";
import Loader from "@/layout/Loader";
import RichInput from "@/layout/RichInput";
import { useState } from "react";
import { useChat } from "ai/react";
import { X, BrainCircuit } from "lucide-react";
import { SiOpenai } from "@icons-pack/react-simple-icons";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "src/libs/shadui";
import { useUserData } from "@/utils/UserContext";
import { showMutationToast } from "@/libs/toast";

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
  const { data: userData } = useUserData();
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { messages, append, isLoading } = useChat({
    api: aiProps.apiEndpoint,
    initialMessages: [
      ...(aiProps.systemMessage
        ? [{ id: "system", role: "system" as const, content: aiProps.systemMessage }]
        : []),
      { id: "initial", role: "assistant", content: "Hello! How can I help you today?" },
    ],
    onToolCall: ({ toolCall }) => onToolCall(toolCall),
    onError: (error) => {
      console.error(error);
      showMutationToast({
        success: false,
        message: "Error sending message. Not allowed?",
      });
    },
    maxSteps: 1,
  });

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Input form
  const FormSchema = z.object({ message: z.string() });
  type FormSchemaType = z.infer<typeof FormSchema>;
  const form = useForm<FormSchemaType>({
    resolver: zodResolver(FormSchema),
    defaultValues: { message: "" },
  });

  // Loader
  if (!userData) return <Loader explanation="Loading user" />;

  // Render
  return (
    <>
      <div className="pl-3 w-full flex flex-row justify-end">
        <Button
          disabled={isLoading}
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
        <div className="fixed bottom-28 right-4 min-w-96 max-w-96 bg-popover rounded-md shadow-lg z-50">
          <div className="flex flex-col h-full">
            <header className="flex items-center justify-between px-4 py-2 border-b">
              <h4 className="text-lg font-medium">Chat</h4>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" onClick={() => setIsOpen((prev) => !prev)} />
                <span className="sr-only">Close chat window</span>
              </Button>
            </header>
            <div className="flex-1 min-h-96 max-h-[700px] overflow-y-auto bg-card">
              {messages
                .filter((message) => message.role !== "system")
                .map((message, i) => {
                  let content = message.content ? message.content : "";
                  if (!content && message.toolInvocations) {
                    content = message.toolInvocations
                      .map((tool) => `Calling ${tool.toolName}`)
                      .join(", ");
                  }
                  return (
                    <div
                      className={cn(
                        "flex flex-row items-start space-x-2 p-4",
                        i % 2 === 0 ? "bg-card" : "bg-popover",
                      )}
                      key={message.id}
                    >
                      <div className="flex-shrink-0">
                        {message.role === "user" ? (
                          <AvatarImage
                            href={userData.avatar}
                            alt={userData.username}
                            className="w-10 h-10 border-0"
                            size={100}
                            hover_effect={true}
                            priority
                          />
                        ) : (
                          <BrainCircuit className="h-10 w-10" />
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">
                            {message.role === "user" ? userData.username : "Seichi AI"}
                          </div>
                          <div className="text-xs">
                            {message.createdAt?.toLocaleTimeString()}
                          </div>
                        </div>
                        <p className="text-sm">{content}</p>
                      </div>
                    </div>
                  );
                })}
              {isLoading && (
                <div
                  className={cn(
                    "flex flex-row items-start space-x-2 p-4",
                    messages.length % 2 === 0 ? "bg-card" : "bg-popover",
                  )}
                >
                  <div className="flex-shrink-0">
                    <BrainCircuit className="h-10 w-10" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Seichi AI</div>
                      <div className="text-xs">{new Date().toLocaleTimeString()}</div>
                    </div>
                    <div className="flex flex-row items-center gap-2">
                      <p className="text-sm">Thinking</p>
                      <div className="h-1 w-1 bg-black dark:bg-white rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="h-1 w-1 bg-black dark:bg-white rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="h-1 w-1 bg-black dark:bg-white rounded-full animate-bounce"></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="border-t p-4">
              <Form {...form}>
                <FormField
                  control={form.control}
                  name="message"
                  render={({}) => (
                    <FormItem>
                      <FormControl>
                        <RichInput
                          id="message"
                          height="200"
                          control={form.control}
                          disabled={isLoading}
                          onSubmit={(value) => {
                            void append({ role: "user", content: value as string });
                            form.setValue("message", "");
                          }}
                          error={form.formState.errors.message?.message}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatInputField;
