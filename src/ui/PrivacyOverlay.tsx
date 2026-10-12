import "@/ui/privacy.css";
import { useId } from "react";

import { CONTACT_EMAIL, PRIVACY } from "@/content/privacy";
import type { PrivacySection } from "@/content/privacy";
import { CloseButton, Overlay } from "@/ui/Overlay";
import { Awning } from "@/ui/PanelChrome";

function Section({ section }: { readonly section: PrivacySection }) {
  return (
    <section className="privacy__section">
      <h3>{section.heading}</h3>
      {section.paragraphs?.map((text) => (
        <p key={text}>{text}</p>
      ))}
      {section.bullets ? (
        <ul>
          {section.bullets.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** The privacy notice (`/privacy`): plain text from `src/content/privacy.ts`. */
export function PrivacyOverlay({
  leaving,
  onClose,
}: {
  readonly leaving: boolean;
  readonly onClose: () => void;
}) {
  const titleId = useId();
  return (
    <Overlay kind="privacy" labelledBy={titleId} leaving={leaving} onClose={onClose}>
      <header className="join__band">
        <Awning color="var(--peacock)" />
        <CloseButton onClose={onClose} />
        <h2 id={titleId} className="join__title">
          {PRIVACY.title}
        </h2>
        <p className="join__blurb">{PRIVACY.updated}</p>
      </header>
      <div className="overlay__scroll privacy">
        <p className="privacy__intro">{PRIVACY.intro}</p>
        {PRIVACY.sections.map((section) => (
          <Section key={section.heading} section={section} />
        ))}
        <p className="privacy__contact">
          Contact: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </div>
    </Overlay>
  );
}
