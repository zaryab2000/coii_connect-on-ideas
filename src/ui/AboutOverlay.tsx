import "@/ui/about.css";
import "@/ui/decipher.css";
import { useId } from "react";

import { useActions, useApp } from "@/app/context";
import { IDEAS } from "@/app/ideas";
import { DECIPHER } from "@/content/decipher";
import { UNOFFICIAL } from "@/content/privacy";
import type { Avatar, IconId, TopicId } from "@/data/types";
import { BeanAvatar } from "@/ui/BeanAvatar";
import { DecipherLinks } from "@/ui/DecipherLinks";
import { Glyph, Icon } from "@/ui/Icon";
import { CloseButton, Overlay } from "@/ui/Overlay";

interface Feature {
  readonly icon: IconId;
  readonly title: string;
  readonly text: string;
}

const FEATURES: readonly Feature[] = [
  {
    icon: "handshake",
    title: "Create your own adda",
    text: "Build your adda: the group of people (and frens) you want to meet at Devcon\u00a08.",
  },
  {
    icon: "waving_hand",
    title: "Wave and earn wave points",
    text: "Wave to connect. Every wave you get is a point that climbs you up the coii leaderboard.",
  },
  {
    icon: "sparkles",
    title: "coii recommends your matches",
    text: "Every day, coii recommends people you should connect with, matched on ideas.",
  },
];

const PROMISES: readonly string[] = [
  "Your name, topics and one-liners are public. Your handles only show to people who wave at you.",
  "No app to install and no wallet to connect. It's just a web page.",
  "Leave anytime and your bean walks out.",
  "Meet in public parts of the venue. Nobody legit will ask for your seed phrase or funds.",
  "Grey beans are NPCs: friendly background walkers, not real people.",
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
        coii
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
        Plan & connect with people that value your interests. Make the most of Devcon&nbsp;8.
      </p>
      <p>Don't waste your time and social energy at an event (especially for nerds).</p>
      <p>coii helps you:</p>
      <ul className="about__helps">
        <li>Plan and strategize beforehand who you want to meet</li>
        <li>Connect with people who share your ideas and interests</li>
        <li>Make friends</li>
      </ul>
    </section>
  );
}

function Features() {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="about__h">
        With coii you can:
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
      <p className="about__event">Built for Devcon 8</p>
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
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => actions.openOverlay("invite")}
        >
          Invite friends
        </button>
      </div>
      <div className="about__decipher">
        <p>{DECIPHER.pitch}</p>
        <div className="about__ctas">
          <DecipherLinks spot="about" primary={false} />
        </div>
      </div>
      <p className="about__idea">
        {IDEAS.aboutLead}{" "}
        <button
          type="button"
          className="about__idea-link"
          onClick={() => actions.openOverlay("ideas")}
        >
          {IDEAS.aboutLink}
        </button>
      </p>
      <p className="about__love">
        <strong>With love, from Decipher Club</strong>
        <Icon id="red_heart" size={20} />
      </p>
      <p className="unofficial">{UNOFFICIAL}</p>
      <button type="button" className="privacy-link" onClick={() => actions.openOverlay("privacy")}>
        Privacy
      </button>
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
          <Promises />
          <Footer onClose={onClose} />
        </div>
      </div>
    </Overlay>
  );
}
