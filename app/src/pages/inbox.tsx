import { type z } from "zod";
import { useState, useEffect } from "react";
import { type NextPage } from "next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Conversation from "@/layout/Conversation";
import RichInput from "@/layout/RichInput";
import Confirm from "@/layout/Confirm";
import Loader from "@/layout/Loader";
import AvatarImage from "@/layout/Avatar";
import ContentBox from "@/layout/ContentBox";
import UserSearchSelect from "@/layout/UserSearchSelect";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormLabel,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { SquarePen, Users, X, Trash2 } from "lucide-react";
import { api } from "@/utils/api";
import { useRequiredUserData } from "@/utils/UserContext";
import { createConversationSchema } from "../validators/comments";
import { type CreateConversationSchema } from "../validators/comments";
import { getSearchValidator } from "../validators/register";

const Inbox: NextPage = () => {
  const { data: userData } = useRequiredUserData();
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null);
  if (!userData) return <Loader explanation="Loading userdata" />;

  if (selectedConvo) {
    return (
      <Conversation
        refreshKey={0}
        convo_id={selectedConvo}
        back_href="/inbox"
        onBack={() => setSelectedConvo(null)}
        title="Inbox"
        subtitle="Private messages"
        topRightContent={<NewConversationPrompt setSelectedConvo={setSelectedConvo} />}
      />
    );
  } else if (!selectedConvo) {
    return (
      <ContentBox
        title="Inbox"
        subtitle="Private Conversations"
        padding={false}
        topRightContent={<NewConversationPrompt setSelectedConvo={setSelectedConvo} />}
      >
        <ShowConversations
          selectedConvo={selectedConvo}
          setSelectedConvo={setSelectedConvo}
        />
      </ContentBox>
    );
  }
};

export default Inbox;

/**
 * Component for displaying a conversations
 */
interface ShowConversationsProps {
  selectedConvo?: string | null;
  setSelectedConvo: React.Dispatch<React.SetStateAction<string | null>>;
}
const ShowConversations: React.FC<ShowConversationsProps> = (props) => {
  const { selectedConvo, setSelectedConvo } = props;

  // Fetch conversations. Note we pass the selected convo to automatically re-fetch when it changes
  const {
    data: allConversations,
    refetch,
    isPending,
  } = api.comments.getUserConversations.useQuery({ selectedConvo: selectedConvo });

  const { mutate: exitConversation } = api.comments.exitConversation.useMutation({
    onSuccess: async () => {
      await refetch();
    },
  });
  return (
    <div>
      {isPending && <Loader explanation="Looking for conversations" />}
      {allConversations && (
        <div className="relative">
          <ul className="space-y-2">
            <li>
              <a
                href="#"
                className="flex items-center rounded-lg p-2 text-base font-normal"
              >
                {selectedConvo ? (
                  <X
                    className="h-6 w-6 hover:fill-orange-500"
                    onClick={() => setSelectedConvo(null)}
                  />
                ) : (
                  <Users className="h-6 w-6" />
                )}
                <span className="... ml-3 truncate font-bold">Chats</span>
              </a>
            </li>

            <hr />
            {allConversations.map((convo) => (
              <li
                className={`relative mx-3 my-3 flex h-12 flex-row items-center rounded-lg hover:bg-orange-200 ${
                  selectedConvo && selectedConvo === convo.id ? "bg-orange-200" : ""
                }`}
                key={convo.id}
                onClick={() => setSelectedConvo(convo.id)}
              >
                {convo.users.length > 0 &&
                  convo.users.map((relation, i) => {
                    const user = relation.userData;
                    return (
                      <div
                        key={user.userId}
                        className={`absolute w-14`}
                        style={{ left: `${i * 2}rem` }}
                      >
                        <AvatarImage
                          href={user.avatar}
                          userId={user.userId}
                          alt={user.username}
                          size={50}
                          priority
                        />
                      </div>
                    );
                  })}
                <span
                  className="... truncate text-sm grow"
                  style={{
                    marginLeft: (convo.users.length * 2 + 1.5).toString() + "rem",
                  }}
                >
                  {convo.title}
                  <br />
                  {convo.createdAt.toDateString()}s
                </span>
                <div className="grow"></div>
                <Trash2
                  className="mx-2 h-6 w-6 cursor-pointer rounded-full hover:fill-orange-500"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    exitConversation({ convo_id: convo.id });
                  }}
                />
              </li>
            ))}
          </ul>
          <div className="italic m-3">- Messages deleted after 14 days</div>
        </div>
      )}
    </div>
  );
};

/**
 * Component for creating a new conversation
 */
interface NewConversationPromptProps {
  setSelectedConvo: React.Dispatch<React.SetStateAction<string | null>>;
}

const NewConversationPrompt: React.FC<NewConversationPromptProps> = (props) => {
  const { data: userData } = useRequiredUserData();
  const maxUsers = 5;

  const create = useForm<CreateConversationSchema>({
    resolver: zodResolver(createConversationSchema),
  });

  const userSearchSchema = getSearchValidator({ max: maxUsers });
  const userSearchMethods = useForm<z.infer<typeof userSearchSchema>>({
    resolver: zodResolver(userSearchSchema),
  });

  const users = userSearchMethods.watch("users");
  useEffect(() => {
    if (users && users.length > 0) {
      create.setValue(
        "users",
        users.map((u) => u.userId),
      );
    }
  }, [users, create]);

  const createConversation = api.comments.createConversation.useMutation({
    onSuccess: (data) => {
      create.reset();
      props.setSelectedConvo(data.conversationId);
    },
  });

  const onSubmit = create.handleSubmit(
    (data) => {
      createConversation.mutate(data);
    },
    (error) => console.error(error),
  );

  return (
    <div className="flex flex-row items-center">
      {userData && !userData.isBanned && (
        <Confirm
          title="Create a new conversation"
          proceed_label="Submit"
          isValid={create.formState.isValid}
          button={
            <Button id="conversation">
              <SquarePen className="mr-2 h-5 w-5" />
              New
            </Button>
          }
          onAccept={onSubmit}
        >
          <Form {...create}>
            <UserSearchSelect
              useFormMethods={userSearchMethods}
              label="Users to send to"
              showYourself={false}
              maxUsers={maxUsers}
            />
            <FormField
              control={create.control}
              name="title"
              render={({ field }) => (
                <FormItem className="mb-2">
                  <FormLabel>Conversation name</FormLabel>
                  <FormControl>
                    <Input placeholder="" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <RichInput
              id="comment"
              label="Initial conversation message"
              height="300"
              placeholder=""
              control={create.control}
              error={create.formState.errors.comment?.message}
            />
          </Form>
        </Confirm>
      )}
    </div>
  );
};
