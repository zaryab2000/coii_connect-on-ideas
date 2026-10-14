/**
 * Every word of "Claim your bean" (docs-internal/prd/claim-your-bean.md §7), in one place so the
 * owner can edit it without touching components. Plain strings and tiny templates only.
 */

import { CONTACT_EMAIL } from "@/content/privacy";

export const CLAIM = {
  /** The claim screen a claim link opens. */
  heading: "You're already on coii 👋",
  intro: (name: string): string =>
    `The coii team added you as ${name} because you're coming to Devcon 8. Claim your bean to make it yours: edit it, wave at people and get waves.`,
  button: "Claim my bean",
  pending: "Claiming…",
  loading: "Finding your bean…",
  claimed: "This bean has already been claimed. If it was you, sign in with Google.",
  expired: `This claim link has expired. Ask for a new one: ${CONTACT_EMAIL}`,
  invalid: `This claim link doesn't work. Check you copied all of it, or ask for a new one: ${CONTACT_EMAIL}`,
  /** This browser already has a bean (claim_bean would say coii:already_joined). */
  alreadyHaveBean: (yours: string): string =>
    `You already have a bean here (${yours}). To claim this one, leave coii on this device first, or open the link in another browser.`,
  /** The server knows this session has a bean, but this tab hasn't loaded it (so no name). */
  alreadyHaveSomeBean:
    "You already have a bean on coii. To claim this one, leave coii on this device first, or open the link in another browser.",
  /** Demo mode (no database): a claim link can't do anything here. */
  demoLink: "Claim links work on the live coii site. This is the demo map.",
  done: "Your bean is yours now!",
  googleNudge: "Save my bean with Google",

  /** The panel when a join hits an invited handle, or "This is me" on a profile card. */
  panelJoinHeading: "You're already on coii!",
  panelJoinText: (name: string): string =>
    `The coii team added you as ${name}. Claim that bean instead of making a new one.`,
  panelHeading: "Is this you?",
  panelText: (name: string): string =>
    `The coii team added ${name}. If that's you, claim the bean instead of making a new one.`,
  withTelegram: "Claim with Telegram",
  withTelegramHint:
    "Log in with the Telegram account the coii team added, and the bean is yours in one go.",
  telegramContinue: "Continue with Telegram",
  telegramNoMatch:
    "That Telegram account isn't the one the coii team added. Use your claim link, or join with your own handle.",
  haveLink: "I have a claim link",
  linkLabel: "Your claim link",
  linkOpen: "Open my claim link",
  linkBad: "That doesn't look like a claim link. Paste the whole link you were sent.",
  askLink: "Ask for my claim link",
  askText: `Write to ${CONTACT_EMAIL} from the account the coii team knows you by, and we'll send your link.`,
  /** Editing your own bean with a handle that belongs to an invited bean. */
  editingTaken: `That handle belongs to a bean the coii team added. If it's you, verify with Telegram on your profile to take it over, or write to ${CONTACT_EMAIL}.`,

  /** Soft hint in the join form when the typed name matches an invited bean. */
  hint: (name: string): string => `There's a bean waiting for ${name}. Is that you?`,
  hintClaim: "Claim it",
  hintDismiss: "Not me",

  /** An invited bean's profile card. */
  cardText: "Added by the coii team. Is this you? Claim your bean.",
  cardButton: "This is me",
  /** A wave (or an adda drop) that reached an invited bean. */
  unclaimed: (firstName: string): string => `${firstName} hasn't claimed their bean yet.`,
} as const;
