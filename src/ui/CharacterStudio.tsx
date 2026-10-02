import { useId, useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";

import {
  ACCESSORIES,
  HAIR_COLORS,
  HAIR_STYLES,
  HEADWEAR_COLORS,
  hairStyleAt,
  isHeadwear,
  SKIN_TONES,
} from "@/data/avatar";
import type { Accessory, HairStyle } from "@/data/avatar";
import { topicById } from "@/data/topics";
import type { Avatar, TopicId } from "@/data/types";
import { css } from "@/engine/palette";
import { randomAvatar } from "@/ui/avatar";
import { BeanAvatar } from "@/ui/BeanAvatar";
import { Glyph, Icon } from "@/ui/Icon";
import type { JoinDraft } from "@/ui/joinDraft";
import { IntentChips, OneLiners, topicVars } from "@/ui/PanelChrome";

const HAIR_NAMES: Readonly<Record<HairStyle, string>> = {
  short: "Short",
  spiky: "Spiky",
  long: "Long",
  bun: "Bun",
  curly: "Curly",
  ponytail: "Ponytail",
  bald: "Bald",
  sidepart: "Side part",
  cap: "Cap",
  beanie: "Beanie",
  headscarf: "Headscarf",
  turban: "Turban",
};

const EXTRA_NAMES: Readonly<Record<Accessory, string>> = {
  none: "Nothing",
  glasses: "Glasses",
  sunglasses: "Sunglasses",
  headphones: "Headphones",
};

interface StudioProps {
  readonly draft: JoinDraft;
  readonly update: (patch: Partial<JoinDraft>) => void;
}

/** Topic chips as plain stickers: the preview shouldn't navigate anywhere. */
function PreviewTopics({ topics }: { readonly topics: readonly TopicId[] }) {
  if (topics.length === 0) return <p className="studio__empty">Pick your topics →</p>;
  return (
    <ul className="topic-chips" aria-label="Topics">
      {topics.map((id) => (
        <li key={id}>
          <span className="topic-chip" style={topicVars(id)}>
            <Icon id={topicById(id).icon} size={18} />
            <span>{topicById(id).short}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function handlesOf(draft: JoinDraft): string {
  const telegram = draft.telegram.trim().replace(/^@/, "");
  const x = draft.x.trim().replace(/^@/, "");
  return [telegram ? `@${telegram}` : null, x ? `X @${x}` : null]
    .filter((h) => h !== null)
    .join(" · ");
}

/** The lines typed so far, without blanks or repeats (a repeat would reuse a React key). */
function previewLines(lines: readonly string[]): string[] {
  return [...new Set(lines.map((line) => line.trim()).filter((line) => line.length > 0))];
}

/** Live preview of your profile card, exactly as people will see it on the map. */
function Preview({ draft }: { readonly draft: JoinDraft }) {
  const primary: TopicId = draft.topics[0] ?? "ai";
  const handles = handlesOf(draft);
  const name = draft.name.trim();
  return (
    <div className="studio__preview">
      <div className="studio__stage rangoli-disc" style={topicVars(primary)}>
        <BeanAvatar avatar={draft.avatar} topic={primary} size={150} face="happy" />
      </div>
      <p className="studio__name" data-empty={name ? undefined : true}>
        {name || "Your name"}
      </p>
      {handles ? <p className="studio__handles">{handles}</p> : null}
      <PreviewTopics topics={draft.topics} />
      <IntentChips intents={draft.intent} />
      <OneLiners lines={previewLines(draft.oneLiners)} />
    </div>
  );
}

interface PickerProps {
  readonly legend: string;
  readonly children: ReactNode;
}

function Picker({ legend, children }: PickerProps) {
  return (
    <fieldset className="studio__group">
      <legend className="studio__legend">{legend}</legend>
      <div className="studio__options">{children}</div>
    </fieldset>
  );
}

interface LookOptionProps {
  readonly name: string;
  readonly label: string;
  readonly checked: boolean;
  readonly avatar: Avatar;
  readonly topic: TopicId;
  readonly onPick: () => void;
}

/** One look to pick, shown on your own bean so you see the result before choosing it. */
function LookOption({ name, label, checked, avatar, topic, onPick }: LookOptionProps) {
  return (
    <label className="look" title={label}>
      <input
        type="radio"
        name={name}
        className="visually-hidden"
        checked={checked}
        onChange={onPick}
      />
      <BeanAvatar avatar={avatar} topic={topic} size={46} face="happy" />
      <span className="visually-hidden">{label}</span>
    </label>
  );
}

interface SwatchesProps {
  readonly name: string;
  readonly label: string;
  readonly colors: readonly number[];
  readonly selected: number;
  readonly onPick: (index: number) => void;
}

function Swatches({ name, label, colors, selected, onPick }: SwatchesProps) {
  return (
    <>
      {colors.map((color, index) => (
        <label key={color} className="swatch" style={{ "--swatch": css(color) } as CSSProperties}>
          <input
            type="radio"
            name={name}
            className="visually-hidden"
            checked={selected === index}
            onChange={() => onPick(index)}
          />
          <span className="visually-hidden">
            {label} {index + 1}
          </span>
        </label>
      ))}
    </>
  );
}

/** Every variant of your bean for one trait, memoised so typing elsewhere doesn't repaint them. */
function useVariants(avatar: Avatar, trait: "hair" | "accessory", count: number): Avatar[] {
  return useMemo(
    () => Array.from({ length: count }, (_, i) => ({ ...avatar, [trait]: i })),
    [avatar, trait, count],
  );
}

function LookPickers({ draft, update }: StudioProps) {
  const base = useId();
  const avatar = draft.avatar;
  const topic: TopicId = draft.topics[0] ?? "ai";
  const set = (patch: Partial<Avatar>): void => update({ avatar: { ...avatar, ...patch } });
  const hairs = useVariants(avatar, "hair", HAIR_STYLES.length);
  const extras = useVariants(avatar, "accessory", ACCESSORIES.length);
  const headwear = isHeadwear(hairStyleAt(avatar.hair));
  const colourLabel = headwear ? "Headwear colour" : "Hair colour";
  return (
    <div className="studio__pickers">
      <Picker legend="Hair">
        {HAIR_STYLES.map((style, i) => (
          <LookOption
            key={style}
            name={`${base}-hair`}
            label={HAIR_NAMES[style]}
            checked={avatar.hair === i}
            avatar={hairs[i] ?? avatar}
            topic={topic}
            onPick={() => set({ hair: i })}
          />
        ))}
      </Picker>
      <Picker legend={colourLabel}>
        <Swatches
          name={`${base}-colour`}
          label={colourLabel}
          colors={headwear ? HEADWEAR_COLORS : HAIR_COLORS}
          selected={avatar.hairColor}
          onPick={(hairColor) => set({ hairColor })}
        />
      </Picker>
      <Picker legend="Extras">
        {ACCESSORIES.map((extra, i) => (
          <LookOption
            key={extra}
            name={`${base}-extra`}
            label={EXTRA_NAMES[extra]}
            checked={avatar.accessory === i}
            avatar={extras[i] ?? avatar}
            topic={topic}
            onPick={() => set({ accessory: i })}
          />
        ))}
      </Picker>
      <Picker legend="Skin tone">
        <Swatches
          name={`${base}-skin`}
          label="Skin tone"
          colors={SKIN_TONES}
          selected={avatar.skin}
          onPick={(skin) => set({ skin })}
        />
      </Picker>
    </div>
  );
}

/**
 * Where you make your bean: a big live preview of your profile card next to pickers for every
 * part of your look. Your first topic sets the shirt colour.
 */
export function CharacterStudio({ draft, update }: StudioProps) {
  const titleId = useId();
  return (
    <section className="studio" aria-labelledby={titleId}>
      <div className="studio__head">
        <h3 id={titleId} className="studio__title">
          Your bean
        </h3>
        <button
          type="button"
          className="btn btn--secondary studio__reroll"
          onClick={() => update({ avatar: randomAvatar(draft.avatar.skin) })}
        >
          <Glyph name="dice" size={20} />
          Surprise me
        </button>
      </div>
      <p className="studio__hint">
        This is you on the map. Your shirt is the colour of your first topic.
      </p>
      <Preview draft={draft} />
      <LookPickers draft={draft} update={update} />
    </section>
  );
}
