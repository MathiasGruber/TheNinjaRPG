"use client";

import { z } from "zod";
import { useEffect, useRef, useState } from "react";
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
import { X, BrainCircuit, ThumbsUp, ThumbsDown, Meh } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "src/libs/shadui";
import { useUserData } from "@/utils/UserContext";
import { showMutationToast } from "@/libs/toast";
import { useChat } from "ai/react";
import { api } from "@/app/_trpc/client";

interface ToolCall<NAME extends string, ARGS> {
  toolCallId: string;
  toolName: NAME;
  args: ARGS;
}

export interface ChatBoxProps {
  className?: string;
  position?: "fixed" | "relative";
  onClose?: () => void;
  showCloseButton?: boolean;
  showHeader?: boolean;
  showFeedback?: boolean;
  aiProps: {
    apiEndpoint: string;
    systemMessage?: string;
  };
  onToolCall: (toolCall: ToolCall<string, unknown>) => void;
}

const ChatBox: React.FC<ChatBoxProps> = ({
  className,
  position = "fixed",
  onClose,
  showCloseButton = true,
  showHeader = true,
  showFeedback = true,
  aiProps,
  onToolCall,
}) => {
  // State
  const { data: userData } = useUserData();
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

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
      const message = error?.message || "Error sending message. Not allowed?";
      showMutationToast({ success: false, message: message });
    },
    maxSteps: 1,
  });

  // Feedback mutation
  const { mutate: submitFeedback, isPending: isSubmittingFeedback } =
    api.misc.reviewSupportWithAI.useMutation({
      onSuccess: (data) => {
        setFeedbackSubmitted(true);
        showMutationToast(data);
      },
    });

  // Handle feedback submission
  const handleFeedback = (sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL") => {
    if (feedbackSubmitted) return;

    submitFeedback({
      apiRoute: aiProps.apiEndpoint,
      chatHistory: messages,
      sentiment,
    });
  };

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

  // Calculate max height for messages container
  const messagesContainerClass =
    showFeedback && messages.length > 2
      ? "min-h-[200px] max-h-[500px]"
      : "min-h-96 max-h-[700px]";

  // Render
  return (
    <div
      className={cn(
        position === "fixed"
          ? "fixed bottom-28 right-4 min-w-96 max-w-96 shadow-lg z-50"
          : "w-full",
        "bg-popover rounded-md overflow-hidden",
        className,
      )}
    >
      <div className="flex flex-col h-full">
        {showHeader && (
          <header className="flex items-center justify-between px-4 py-2 border-b">
            <h4 className="text-lg font-medium">Chat</h4>
            {showCloseButton && (
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
                <span className="sr-only">Close chat window</span>
              </Button>
            )}
          </header>
        )}
        <div className={cn("flex-1 overflow-y-auto bg-card", messagesContainerClass)}>
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
                      height="120"
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

          {/* Feedback section */}
          {showFeedback && messages.length > 2 && (
            <div className="mt-2 flex flex-col items-center">
              <p className="text-xs text-muted-foreground mb-1">
                {feedbackSubmitted
                  ? "Thank you for your feedback!"
                  : "How was your chat experience?"}
              </p>
              {!feedbackSubmitted && (
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleFeedback("POSITIVE")}
                    disabled={isSubmittingFeedback}
                    className="flex items-center gap-1 h-8 px-2 py-1"
                  >
                    <ThumbsUp className="h-3 w-3" />
                    <span className="text-xs">Good</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleFeedback("NEUTRAL")}
                    disabled={isSubmittingFeedback}
                    className="flex items-center gap-1 h-8 px-2 py-1"
                  >
                    <Meh className="h-3 w-3" />
                    <span className="text-xs">Neutral</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleFeedback("NEGATIVE")}
                    disabled={isSubmittingFeedback}
                    className="flex items-center gap-1 h-8 px-2 py-1"
                  >
                    <ThumbsDown className="h-3 w-3" />
                    <span className="text-xs">Poor</span>
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatBox;
