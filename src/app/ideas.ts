import { cleanText } from "@/data/handles";

/**
 * "Got an idea for coii?" (docs-internal/prd/feature-requests.md): a joined person sends a short
 * idea, stored with their bean for the owner to review. Developers get the repo's issue form.
 */

export type IdeaKind = "feature" | "booth" | "design" | "other";

export const IDEA_KINDS: readonly { readonly id: IdeaKind; readonly label: string }[] = [
  { id: "feature", label: "Feature" },
  { id: "booth", label: "New booth" },
  { id: "design", label: "Avatar & design" },
  { id: "other", label: "Something else" },
];

/** Same range as the server's check, counted on the cleaned text. */
export const IDEA_MIN = 10;
export const IDEA_MAX = 300;

/** The idea as the server stores it: invisible characters gone, whitespace collapsed. */
export function cleanIdea(text: string): string {
  return cleanText(text);
}

/** Length that counts towards the 10–300 range (after cleaning, by code points like the server). */
export function ideaLength(text: string): number {
  return [...cleanIdea(text)].length;
}

export function ideaFits(text: string): boolean {
  const n = ideaLength(text);
  return n >= IDEA_MIN && n <= IDEA_MAX;
}

/** "123 / 300". */
export function ideaCounter(text: string): string {
  return `${ideaLength(text)} / ${IDEA_MAX}`;
}

const REPO = "https://github.com/zaryab2000/coii_connect-on-ideas";

/** The repo's feature-request issue form, and its pull requests. */
export const IDEA_LINKS = {
  issue: `${REPO}/issues/new?template=feature_request.md`,
  pulls: `${REPO}/pulls`,
} as const;

export const IDEAS = {
  heading: "Got an idea for coii?",
  sub: "Request a feature, a new booth, a new look for your bean, anything.",
  kindLegend: "What kind of idea?",
  label: "Your idea",
  placeholder: "e.g. A booth for ZK hardware, or let me add a cape to my bean",
  send: "Send to coii-agent",
  sending: "Sending…",
  sent: "Feature request sent to coii-agent. Once it's done, coii-agent will tag you and let you know.",
  again: "Send another",
  joinFirst: "Join coii to send a request",
  join: "Join coii",
  devHeading: "Are you a dev? Build it yourself.",
  issue: "Create an issue or PR",
  pulls: "Open a pull request",
  demo: "Requests work on the live site.",
  aboutLead: "Got an idea for coii?",
  aboutLink: "Request a feature",
  hud: "Ideas",
} as const;

/** What sending an idea came to: sent, or the line to show instead. */
export type IdeaOutcome = { readonly ok: true } | { readonly ok: false; readonly text: string };
