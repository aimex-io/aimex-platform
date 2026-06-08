import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AssigneeChip,
  ComposerHandoffPreviewRow,
  ComposerMentionCoach,
  HandoffWakeRow,
  RunStatusBadge,
  type HandoffChipResolvers,
} from "@/components/interrupt-handoff/InterruptHandoffViews";
import { computeComposerHandoffPreview } from "@/lib/interrupt-handoff";

/**
 * Visual states for the interrupt-handoff UX clarity work (PAP-10669). Each card
 * is one row of the design's state matrix: interrupted → handed to QA,
 * interrupted → waiting on user, and no agent selected.
 */

const resolvers: HandoffChipResolvers = {
  agentMap: new Map([
    ["agent-claude", { name: "ClaudeCoder", icon: null }],
    ["agent-qa", { name: "QA", icon: null }],
  ]),
  currentUserId: "user-board",
  resolveUserLabel: (id) => (id === "user-board" ? "Riley Board" : null),
};

const claude = { agentId: "agent-claude", userId: null };
const qa = { agentId: "agent-qa", userId: null };
const board = { agentId: null, userId: "user-board" };
const unassigned = { agentId: null, userId: null };

function ActivityCard({
  title,
  state,
  to,
  interruptedRunAttached,
  composerTarget,
  composerCurrent,
  composerHasActiveRun,
}: {
  title: string;
  state: string;
  to: { agentId: string | null; userId: string | null };
  interruptedRunAttached?: boolean;
  composerTarget: string;
  composerCurrent: string;
  composerHasActiveRun: boolean;
}) {
  const preview = computeComposerHandoffPreview({
    reassignTarget: composerTarget,
    currentAssigneeValue: composerCurrent,
    hasActiveRun: composerHasActiveRun,
    bodyHasAgentMention: false,
    plainNameCandidate: null,
  });
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription>{state}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Timeline run row */}
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-foreground">ClaudeCoder</span>
          <span className="text-muted-foreground">run</span>
          <span className="rounded-md border border-border bg-accent/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            3a648d1b
          </span>
          <RunStatusBadge status="cancelled" operatorInterrupted />
        </div>

        {/* Assignee change row + wake row */}
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Assignee</span>
            <AssigneeChip assignee={claude} resolvers={resolvers} />
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <AssigneeChip assignee={to} resolvers={resolvers} />
          </div>
          <HandoffWakeRow to={to} resolvers={resolvers} interruptedRunAttached={interruptedRunAttached} />
        </div>

        {/* Composer footer preview */}
        <div className="rounded-md border border-dashed border-border/70 p-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Composer preview</div>
          <ComposerHandoffPreviewRow preview={preview} resolvers={resolvers} />
        </div>
      </CardContent>
    </Card>
  );
}

const meta: Meta = {
  title: "Surfaces/Interrupt Handoff",
};
export default meta;

type Story = StoryObj;

export const StateMatrix: Story = {
  render: () => (
    <div className="flex flex-col gap-4 p-4" data-testid="interrupt-handoff-matrix">
      <ActivityCard
        title="A. Interrupted → handed to QA"
        state="Durable assigneeAgentId = QA; QA wake queued."
        to={qa}
        interruptedRunAttached
        composerTarget="agent:agent-qa"
        composerCurrent="agent:agent-claude"
        composerHasActiveRun
      />
      <ActivityCard
        title="B. Interrupted → waiting on user"
        state="assigneeUserId set, agent cleared; no agent wake."
        to={board}
        composerTarget="user:user-board"
        composerCurrent="agent:agent-claude"
        composerHasActiveRun
      />
      <ActivityCard
        title="C. No agent selected"
        state="Run interrupted, no durable owner persisted."
        to={unassigned}
        composerTarget="__none__"
        composerCurrent="agent:agent-claude"
        composerHasActiveRun
      />
    </div>
  ),
};

export const ComposerCoach: Story = {
  render: () => (
    <div className="max-w-xl p-4" data-testid="interrupt-handoff-coach">
      <ComposerMentionCoach
        candidate={{ agentId: "agent-qa", matchedText: "QA" }}
        agentDisplayName="QA"
        onInsert={() => {}}
        onDismiss={() => {}}
      />
    </div>
  ),
};

export const PlainTextWarning: Story = {
  render: () => {
    const preview = computeComposerHandoffPreview({
      reassignTarget: "agent:agent-claude",
      currentAssigneeValue: "agent:agent-claude",
      hasActiveRun: true,
      bodyHasAgentMention: false,
      plainNameCandidate: { agentId: "agent-qa", matchedText: "QA" },
    });
    return (
      <div className="max-w-xl p-4" data-testid="interrupt-handoff-plain-warning">
        <ComposerHandoffPreviewRow preview={preview} resolvers={resolvers} />
      </div>
    );
  },
};
