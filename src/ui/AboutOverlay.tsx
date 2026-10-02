import "@/ui/about.css";
import { useId } from "react";

import { useActions, useApp } from "@/app/context";
import type { Avatar, IconId, TopicId } from "@/data/types";
import { BeanAvatar } from "@/ui/BeanAvatar";
import { Glyph, Icon } from "@/ui/Icon";
import { CloseButton, Overlay } from "@/ui/Overlay";

interface Feature {
  readonly icon: IconId;
  readonly title: string;
  readonly text: string;
}

const FEATURES: readonly Feature[] = [
  {
    icon: "light_bulb",
    title: "Explore ideas, not logos",
    text: "Every booth is a topic: AI agents, DeFi, privacy and more. The busier the booth, the hotter the idea. Tap one to see who hangs out there.",
  },
  {
    icon: "waving_hand",
    title: "Tap anyone",
    text: "Every bean is a person. Tap one to see what they're building, what they're here for, and how to reach them on Telegram or X.",
  },
  {
    icon: "sparkles",
    title: "Get today's 3",
    text: "Every morning at 6 AM (Mumbai time), Meet deals you three people worth meeting today, with the reasons why. Flip, wave or skip.",
  },
  {
    icon: "hot_beverage",
    title: "Wave, then chai",
    text: "Waves are private. If they wave back, it's Chai's on! We suggest a spot at the venue and a first message you can send in one tap.",
  },
  {
    icon: "handshake",
    title: "Find your tribe",
    text: "My tribe lights up everyone who shares your topics, so you can see where your people are right now.",
  },
  {
    icon: "dizzy",
    title: "Play with the crowd",
    text: "Grab a bean (long-press on a phone) and fling it. They dust themselves off and run back to their booth.",
  },
];

const STEPS: readonly { readonly title: string; readonly text: string }[] = [
  {
    title: "Join in a minute",
    text: "Your name, a Telegram or X handle, and 1 to 3 topics. Your bean walks in through the gate.",
  },
  {
    title: "Meet by ideas",
    text: "Browse the booths, flip today's 3, light up your tribe.",
  },
  {
    title: "Take it offline",
    text: "A wave back turns into chai at the venue. That's the whole point.",
  },
];

const PROMISES: readonly string[] = [
  "You choose what's public: your name, handles, topics and one-liner. Nothing else.",
  "No app to install and no wallet to connect. It's just a web page.",
  "Leave anytime and your bean walks out.",
  "Meet in public parts of the venue. Nobody legit will ask for your seed phrase or funds.",
];

const CROWD: readonly { readonly avatar: Avatar; readonly topic: TopicId }[] = [
  { avatar: { skin: 2, hair: 2, hairColor: 0, accessory: 1 }, topic: "ai" },
  { avatar: { skin: 4, hair: 11, hairColor: 2, accessory: 0 }, topic: "defi" },
  { avatar: { skin: 1, hair: 4, hairColor: 1, accessory: 3 }, topic: "privacy" },
  { avatar: { skin: 3, hair: 10, hairColor: 5, accessory: 0 }, topic: "stablecoins" },
  { avatar: { skin: 0, hair: 1, hairColor: 4, accessory: 2 }, topic: "prediction" },
];

function Hero({ titleId, onClose }: { readonly titleId: string; readonly onClose: () => void }) {
  return (
    <header className="about__hero">
      <CloseButton onClose={onClose} />
      <p className="about__kicker">About</p>
      <h2 id={titleId} className="about__title">
        <span className="about__gm">gm</span> coii
      </h2>
      <p className="about__tagline">connect on ideas & interests</p>
      <div className="about__crowd" aria-hidden="true">
        {CROWD.map(({ avatar, topic }) => (
          <BeanAvatar key={topic} avatar={avatar} topic={topic} size={58} face="happy" />
        ))}
      </div>
    </header>
  );
}

function Thesis() {
  return (
    <section className="about__thesis" aria-label="Why coii">
      <p className="about__lead">
        Conferences are full of people you'd love to meet, and you walk right past most of them.
      </p>
      <p>
        Badges show logos and job titles. They don't say what someone actually cares about. coii
        turns Devcon into a live map of ideas: every booth is a topic, and every little bean is a
        person who cares about it. Walk up to an idea and your people are standing right there.
      </p>
    </section>
  );
}

function Features() {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="about__h">
        What you can do
      </h3>
      <ul className="about__features">
        {FEATURES.map((f) => (
          <li key={f.title} className="about__feature">
            <span className="about__feature-icon">
              <Icon id={f.icon} size={28} />
            </span>
            <h4>{f.title}</h4>
            <p>{f.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HowItWorks() {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="about__h">
        How it works
      </h3>
      <ol className="about__steps">
        {STEPS.map((step) => (
          <li key={step.title} className="about__step">
            <h4>{step.title}</h4>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Promises() {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="about__h">
        Ground rules
      </h3>
      <ul className="about__promises">
        {PROMISES.map((text) => (
          <li key={text}>
            <span className="about__tick">
              <Glyph name="check" size={16} />
            </span>
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Footer({ onClose }: { readonly onClose: () => void }) {
  const actions = useActions();
  const joined = useApp((s) => s.you !== null);
  return (
    <footer className="about__footer">
      <p className="about__event">
        <strong>Built for Devcon 8</strong> · Jio World Centre, Mumbai · 3–6 Nov 2026
      </p>
      <p className="about__fine">
        An independent project by attendees, not run by the Devcon team. The crowd you see now is a
        demo: names and handles are made up until sign-ups open.
      </p>
      <div className="about__ctas">
        {joined ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              actions.openPanel("meet");
              onClose();
            }}
          >
            <Icon id="sparkles" size={22} />
            See today's 3
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => actions.startJoin(null)}
          >
            <Icon id="waving_hand" size={22} />
            Join coii
          </button>
        )}
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          Explore the map
        </button>
      </div>
    </footer>
  );
}

/** What coii is and what you can do here, over the live venue. */
export function AboutOverlay({
  leaving,
  onClose,
}: {
  readonly leaving: boolean;
  readonly onClose: () => void;
}) {
  const titleId = useId();
  return (
    <Overlay kind="about" labelledBy={titleId} leaving={leaving} onClose={onClose}>
      <div className="overlay__scroll about">
        <Hero titleId={titleId} onClose={onClose} />
        <div className="about__body">
          <Thesis />
          <Features />
          <HowItWorks />
          <Promises />
          <Footer onClose={onClose} />
        </div>
      </div>
    </Overlay>
  );
}
