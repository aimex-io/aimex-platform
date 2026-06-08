import { parseAgentMentionHref } from "@paperclipai/shared";

/**
 * Shared logic for the "interrupt handoff" UX clarity surfaces (PAP-10669).
 *
 * The single rule every surface enforces: an *agent* appearance — agent chip,
 * "handed to <agent>" copy, a queued wake — is reserved for either (a) a durable
 * `assigneeAgentId` mutation, or (b) a structured agent mention (`agent://<id>`).
 * Plain text such as `QA` or `please get QA on this` never implies an agent wake.
 *
 * Backend interrupt semantics (see server/src/routes/issues.ts
 * `operatorInterruptCancelOptions`): an operator-triggered interrupt cancels the
 * active run with `errorCode: "operator_interrupted"` and
 * `resultJson.operatorInterrupted = true` /
 * `resultJson.interruptionSource = "issue_comment_interrupt"`.
 */

// --- Run interruption ---------------------------------------------------------

/**
 * Whether a run's terminal record reflects an intentional operator interrupt
 * (a board comment that cancelled the active run) rather than an unexplained
 * failure or a plain control-plane cancel.
 */
export function isOperatorInterruptedRun(
  resultJson: Record<string, unknown> | null | undefined,
  errorCode?: string | null,
): boolean {
  if (errorCode === "operator_interrupted") return true;
  if (!resultJson || typeof resultJson !== "object") return false;
  if (resultJson.operatorInterrupted === true) return true;
  return resultJson.interruptionSource === "issue_comment_interrupt";
}

export function runStatusClassName(status: string): string {
  switch (status) {
    case "succeeded":
      return "text-green-700 dark:text-green-300";
    case "failed":
    case "error":
      return "text-red-700 dark:text-red-300";
    case "timed_out":
      return "text-orange-700 dark:text-orange-300";
    case "running":
      return "text-cyan-700 dark:text-cyan-300";
    case "queued":
    case "pending":
      return "text-amber-700 dark:text-amber-300";
    case "cancelled":
      return "text-muted-foreground";
    default:
      return "text-foreground";
  }
}

export interface RunStatusPresentation {
  label: string;
  className: string;
  /** Screen-reader-only clarifier, or null. */
  srHint: string | null;
}

/**
 * Resolve the visible run status. A board-triggered interrupt reads as
 * "interrupted" (amber, operator-intentional) instead of a muted "cancelled"
 * that looks like an adapter failure.
 */
export function resolveRunStatusPresentation(
  status: string,
  opts: { operatorInterrupted?: boolean } = {},
): RunStatusPresentation {
  if (status === "cancelled" && opts.operatorInterrupted) {
    return {
      label: "interrupted",
      className: "text-amber-700 dark:text-amber-300",
      srHint: "interrupted by board comment",
    };
  }
  return {
    label: status === "timed_out" ? "timed out" : status.replace(/_/g, " "),
    className: runStatusClassName(status),
    srHint: null,
  };
}

// --- Structured mention vs plain text -----------------------------------------

const MARKDOWN_LINK_RE = /\[[^\]]*\]\(([^)]*)\)/g;

/** Ordered list of agent ids referenced via structured `agent://` mentions. */
export function extractAgentMentionIds(body: string): string[] {
  const ids: string[] = [];
  if (!body) return ids;
  for (const match of body.matchAll(MARKDOWN_LINK_RE)) {
    const href = match[1] ?? "";
    const parsed = parseAgentMentionHref(href);
    if (parsed?.agentId && !ids.includes(parsed.agentId)) {
      ids.push(parsed.agentId);
    }
  }
  return ids;
}

export function bodyHasAgentMention(body: string): boolean {
  return extractAgentMentionIds(body).length > 0;
}

/** Strip every markdown link so chip labels/hrefs are not mistaken for plain text. */
function plainTextOutsideLinks(body: string): string {
  return body.replace(MARKDOWN_LINK_RE, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface HandoffAgentMention {
  agentId: string;
  name: string;
  /** Optional role label (e.g. "QA"). */
  role?: string | null;
}

export interface PlainAgentNameCandidate {
  agentId: string;
  /** The token (agent name or role) that matched in the body. */
  matchedText: string;
}

/**
 * Find a plain-text token in `body` that names a known agent (by display name or
 * role) but is *not* a structured `agent://` mention. This is the signal the
 * composer coach uses to offer an "Insert mention" upgrade. Returns the
 * highest-confidence (longest-token) match, or null.
 */
export function findPlainAgentNameCandidate(
  body: string,
  mentions: readonly HandoffAgentMention[],
): PlainAgentNameCandidate | null {
  if (!body.trim() || mentions.length === 0) return null;
  const text = plainTextOutsideLinks(body);
  let best: PlainAgentNameCandidate | null = null;

  for (const mention of mentions) {
    const tokens = [mention.name, mention.role ?? ""].filter((t) => t && t.trim().length >= 2);
    for (const token of tokens) {
      const re = new RegExp(`(?<![\\w@/])${escapeRegExp(token)}(?![\\w/])`, "i");
      if (re.test(text)) {
        if (!best || token.length > best.matchedText.length) {
          best = { agentId: mention.agentId, matchedText: token };
        }
      }
    }
  }

  return best;
}

// --- Composer interpretation preview ------------------------------------------

export type HandoffPreviewTone = "neutral" | "warn";

export type ComposerHandoffPreviewKind =
  | "interrupt_handoff_agent"
  | "wake_agent"
  | "user_handoff"
  | "clear_assignee"
  | "notify_agent"
  | "plain_text_only"
  | "none";

export interface ComposerHandoffPreview {
  kind: ComposerHandoffPreviewKind;
  tone: HandoffPreviewTone;
  /** Copy rendered before the optional chip. */
  text: string;
  /** Copy rendered after the optional chip. */
  suffix?: string;
  /** Entity to render as a mini chip, if any. */
  chip?: { kind: "agent" | "user"; id: string };
}

function parseReassignValue(value: string): { kind: "agent" | "user" | "none"; id: string | null } {
  if (!value || value === "__none__") return { kind: "none", id: null };
  if (value.startsWith("agent:")) {
    const id = value.slice("agent:".length);
    return { kind: "agent", id: id || null };
  }
  if (value.startsWith("user:")) {
    const id = value.slice("user:".length);
    return { kind: "user", id: id || null };
  }
  return { kind: "none", id: null };
}

export interface ComposerHandoffPreviewInput {
  /** Current picker value, e.g. "agent:<id>", "user:<id>", "__none__", "". */
  reassignTarget: string;
  /** The issue's current assignee value in the same encoding. */
  currentAssigneeValue: string;
  /** Whether an agent run is currently in flight on this issue. */
  hasActiveRun: boolean;
  /** Whether the comment body contains a structured agent mention. */
  bodyHasAgentMention: boolean;
  /** First agent id structurally mentioned in the body, if any. */
  mentionedAgentId?: string | null;
  /** A plain-text agent-name candidate detected in the body, if any. */
  plainNameCandidate?: PlainAgentNameCandidate | null;
}

/**
 * Compute the one-line interpretation of what submitting this comment will
 * durably do. This is the composer footer preview (design surface 1c) and the
 * core of the agent-vs-user disambiguation.
 */
export function computeComposerHandoffPreview(
  input: ComposerHandoffPreviewInput,
): ComposerHandoffPreview {
  const hasReassignment = input.reassignTarget !== input.currentAssigneeValue;

  if (hasReassignment) {
    const target = parseReassignValue(input.reassignTarget);
    if (target.kind === "agent" && target.id) {
      return input.hasActiveRun
        ? {
            kind: "interrupt_handoff_agent",
            tone: "neutral",
            text: "Interrupt current run, hand off to",
            chip: { kind: "agent", id: target.id },
          }
        : {
            kind: "wake_agent",
            tone: "neutral",
            text: "Wake",
            chip: { kind: "agent", id: target.id },
          };
    }
    if (target.kind === "user" && target.id) {
      return {
        kind: "user_handoff",
        tone: "neutral",
        text: "Hand off to",
        chip: { kind: "user", id: target.id },
        suffix: "— no agent will be notified",
      };
    }
    // Cleared / no target chosen for the mutation.
    return {
      kind: "clear_assignee",
      tone: "neutral",
      text: "Clear assignee — no agent will be notified",
    };
  }

  if (input.bodyHasAgentMention) {
    return {
      kind: "notify_agent",
      tone: "neutral",
      text: "Notify",
      chip: input.mentionedAgentId ? { kind: "agent", id: input.mentionedAgentId } : undefined,
      suffix: input.mentionedAgentId ? undefined : "the mentioned agent",
    };
  }

  if (input.plainNameCandidate) {
    return {
      kind: "plain_text_only",
      tone: "warn",
      text: "No agent will be notified. Use @ to mention an agent.",
    };
  }

  return { kind: "none", tone: "neutral", text: "" };
}

// --- Timeline assignee handoff / wake classification --------------------------

export type AssigneeHandoffKind = "agent_wake" | "user_handoff" | "unassigned";

export interface TimelineAssigneeLike {
  agentId: string | null;
  userId: string | null;
}

export interface AssigneeHandoffInfo {
  kind: AssigneeHandoffKind;
  /** Copy rendered after the "Wake" label in the activity card. */
  wakeText: string;
}

/**
 * Classify the wake outcome of an assignee change, given the *destination*
 * assignee. This drives the timeline "Wake" sub-row so the three required
 * states are self-describing in the activity log.
 */
export function classifyAssigneeHandoff(
  to: TimelineAssigneeLike,
  opts: { agentName?: string | null; interruptedRunAttached?: boolean } = {},
): AssigneeHandoffInfo {
  if (to.agentId) {
    const who = opts.agentName ?? "the assigned agent";
    const suffix = opts.interruptedRunAttached ? " (interrupted run attached)" : "";
    return { kind: "agent_wake", wakeText: `queued for ${who}${suffix}` };
  }
  if (to.userId) {
    return {
      kind: "user_handoff",
      wakeText: "not created — this is a handoff to a board user",
    };
  }
  return {
    kind: "unassigned",
    wakeText: "not created — no agent selected. Mention @agent or pick an assignee to dispatch.",
  };
}
