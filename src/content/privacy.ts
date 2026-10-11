/**
 * Every word of coii's privacy notice and consent, in one place so the owner can edit it
 * without touching components (pre-release tracker P7; India's DPDP Act). Plain strings only.
 */

export const CONTACT_EMAIL = "zartaj.afsar@gmail.com";

/** Shown wherever the project needs to say it isn't official (PLAN §9). */
export const UNOFFICIAL =
  "coii is an unofficial community project. It isn't run by or affiliated with Devcon or the Ethereum Foundation.";

/** Next to the join form's checkbox: the only consent step, so it says everything that matters. */
export const CONSENT = {
  label:
    "Your bean, name, topics and one-liners are public. Your handles show only to people who wave at you.",
  link: "How coii uses your data",
};

export const LEAVE = {
  button: "Leave coii",
  /** Backend mode: deleting the account deletes everything. */
  question:
    "Leave coii for good? This deletes your bean, your handles, your waves, chais and addas, right away. It can't be undone.",
  /** Demo mode: nothing was ever sent anywhere. */
  demoQuestion: "Leave coii? Your bean walks out and this browser forgets your profile.",
  confirm: "Yes, leave",
  cancel: "Stay",
};

export const SIGN_OUT = {
  button: "Sign out",
  hint: "Your bean stays on the map. Sign in with Google to get back to it.",
};

export interface PrivacySection {
  readonly heading: string;
  readonly paragraphs?: readonly string[];
  readonly bullets?: readonly string[];
}

export const PRIVACY = {
  title: "Privacy",
  updated: "Last updated 12 October 2026",
  intro:
    "coii is a live map of who's into what at Devcon 8 in Mumbai. This page says what we keep about you, who can see it, and how to make it all go away. " +
    UNOFFICIAL,
  sections: [
    {
      heading: "What we keep",
      bullets: [
        "Your bean: name, topics, what you're at Devcon for, up to three one-liners and how your bean looks.",
        "Your Telegram username and/or X handle.",
        "The waves you send and get, your chais and whether you've messaged or met, today's picks, people you skipped or blocked.",
        "Your addas and who's in them.",
        "Reports you make, and reports about your bean.",
        "If you link Google: the email Google shares with us, used only to sign you in.",
        "If you verify with Telegram: your Telegram account number, used only to prove the username is yours.",
      ],
    },
    {
      heading: "What everyone can see",
      paragraphs: [
        "Anyone who opens coii sees your bean, name, topics, what you're here for, your one-liners, your badges and your wave points.",
        "Nobody else sees your handles, who you waved at, who waved at you (until you both have), who you blocked, or any report.",
      ],
    },
    {
      heading: "When your handles are shown",
      paragraphs: [
        "Only after someone waves at you. A wave is how a person asks to reach you, and it gives you a wave point. They learn your handles; you learn it was them only if you wave back.",
      ],
    },
    {
      heading: "Who helps run coii",
      bullets: [
        "Supabase: the database and sign-in. Your data is stored in Mumbai, India.",
        "Vercel: hosts the website. Vercel Web Analytics counts visits without cookies and without identifying you.",
        "Cloudflare Turnstile: the quick robot check when you join.",
        'Google: only if you choose "Save my bean" or "Sign in with Google".',
        "Telegram: only if you choose to verify your username.",
      ],
    },
    {
      heading: "How long we keep it",
      paragraphs: [
        "Waves, chais, daily picks, skips and addas are deleted on 6 December 2026, a month after Devcon 8.",
        "Your bean stays until you leave. Encrypted backups are kept for 14 days, so anything you delete is gone from them within two weeks.",
      ],
    },
    {
      heading: "How to leave",
      paragraphs: [
        'Open your profile and tap "Leave coii". After one confirm, your bean, handles, waves, chais, addas and account are deleted, and your bean disappears from everyone\'s map within a minute.',
        'You can change anything about your bean at any time with "Edit my profile".',
      ],
    },
    {
      heading: "Questions",
      paragraphs: [
        `Write to ${CONTACT_EMAIL} for any question, to correct something, or to ask us to delete your data.`,
      ],
    },
  ] satisfies readonly PrivacySection[],
};
