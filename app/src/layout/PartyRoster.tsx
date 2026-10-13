import { Button } from "@/components/ui/button";

/** Shared party display; each activity supplies its own status and removal permissions. */
export const PartyRoster = ({
  members,
  leaderId,
  viewerId,
  disabled,
  onRemove,
}: PartyRosterProps) => (
  <ul className="space-y-2 text-sm">
    {members.map((member) => (
      <li
        key={member.userId}
        className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted p-3"
      >
        <span>
          {member.username}
          {member.userId === leaderId ? " (Leader)" : ""}
          {member.details ? ` · ${member.details}` : ""}
        </span>
        {onRemove && viewerId === leaderId && member.userId !== viewerId && (
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => onRemove(member.userId)}
          >
            Remove
          </Button>
        )}
      </li>
    ))}
  </ul>
);

/** Activity-owned roster display; omit removal outside editable phases and enforce permissions server-side. */
type PartyRosterProps = {
  members: { userId: string; username: string; details?: string }[];
  leaderId: string;
  viewerId: string;
  disabled?: boolean;
  onRemove?: (userId: string) => void;
};
