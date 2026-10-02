import "@/ui/people.css";
import { useCallback, useId, useMemo } from "react";
import type { CSSProperties } from "react";

import { useActions, useApp } from "@/app/context";
import { INTENTS } from "@/data/intents";
import { TOPICS } from "@/data/topics";
import type { IntentId, TopicId } from "@/data/types";
import { BeanAvatar } from "@/ui/BeanAvatar";
import { useDebounced } from "@/ui/hooks";
import { Glyph, Icon } from "@/ui/Icon";
import { capitalize } from "@/ui/meet";
import { Awning, PanelNav, topicVars } from "@/ui/PanelChrome";
import type { PanelChrome } from "@/ui/PanelChrome";
import { queryPeople } from "@/ui/people";
import type { PeopleQuery, SortKey, TopicMatch } from "@/ui/people";
import { PeopleRows } from "@/ui/PeopleRows";

export const DEFAULT_QUERY: PeopleQuery = {
  search: "",
  topics: [],
  match: "any",
  intents: [],
  sort: "newest",
};

const numberFormat = new Intl.NumberFormat("en-IN");
const EMPTY_AVATAR = { skin: 2, hair: 4, hairColor: 1, accessory: 1 };

interface PeopleListProps {
  readonly chrome: PanelChrome;
  readonly query: PeopleQuery;
  readonly onQuery: (query: PeopleQuery) => void;
}

function TopicFilter({ query, onQuery }: Omit<PeopleListProps, "chrome">) {
  const toggle = (topic: TopicId): void => {
    const topics = query.topics.includes(topic)
      ? query.topics.filter((t) => t !== topic)
      : [...query.topics, topic];
    onQuery({ ...query, topics });
  };
  return (
    <div className="filter-row" role="group" aria-label="Filter by topic">
      {TOPICS.map((topic) => (
        <button
          key={topic.id}
          type="button"
          className="chip chip--small"
          style={topicVars(topic.id)}
          aria-pressed={query.topics.includes(topic.id)}
          onClick={() => toggle(topic.id)}
        >
          <Icon id={topic.icon} size={18} />
          {topic.short}
        </button>
      ))}
    </div>
  );
}

const INTENT_VARS = { "--topic": "var(--marigold)", "--on-topic": "var(--ink)" } as CSSProperties;

function IntentFilter({ query, onQuery }: Omit<PeopleListProps, "chrome">) {
  const toggle = (intent: IntentId): void => {
    const intents = query.intents.includes(intent)
      ? query.intents.filter((i) => i !== intent)
      : [...query.intents, intent];
    onQuery({ ...query, intents });
  };
  return (
    <div className="filter-row filter-row--intents" role="group" aria-label="Filter by intent">
      {INTENTS.map((intent) => (
        <button
          key={intent.id}
          type="button"
          className="chip chip--small"
          style={INTENT_VARS}
          aria-pressed={query.intents.includes(intent.id)}
          onClick={() => toggle(intent.id)}
        >
          <Icon id={intent.icon} size={18} />
          {capitalize(intent.phrase)}
        </button>
      ))}
    </div>
  );
}

function MatchToggle({ query, onQuery }: Omit<PeopleListProps, "chrome">) {
  const options: readonly [TopicMatch, string][] = [
    ["any", "Any"],
    ["all", "All"],
  ];
  return (
    <div className="segmented" role="group" aria-label="Match any or all picked topics">
      {options.map(([value, label]) => (
        <button
          key={value}
          type="button"
          className="segmented__option"
          aria-pressed={query.match === value}
          onClick={() => onQuery({ ...query, match: value })}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SortSelect({
  query,
  onQuery,
  canMatch,
}: Omit<PeopleListProps, "chrome"> & { readonly canMatch: boolean }) {
  const id = useId();
  const sort: SortKey = query.sort === "match" && !canMatch ? "newest" : query.sort;
  return (
    <label className="sort" htmlFor={id}>
      <span className="sort__label">Sort</span>
      <span className="sort__control">
        <select
          id={id}
          className="sort__select"
          value={sort}
          onChange={(e) => onQuery({ ...query, sort: e.target.value as SortKey })}
        >
          <option value="newest">Newest</option>
          <option value="name">A–Z</option>
          {canMatch ? <option value="match">Best match</option> : null}
        </select>
        <Glyph name="chevron" size={14} />
      </span>
    </label>
  );
}

function resultCount(count: number, filtered: boolean): string {
  const n = numberFormat.format(count);
  if (!filtered) return `${n} people`;
  return `${n} ${count === 1 ? "match" : "matches"}`;
}

function EmptyState({ onReset }: { readonly onReset: () => void }) {
  return (
    <div className="empty">
      <BeanAvatar avatar={EMPTY_AVATAR} topic="jobs" size={72} face="wow" />
      <p className="empty__title">Nobody matches that yet</p>
      <p className="empty__hint">Try fewer filters or a shorter search.</p>
      <button type="button" className="btn btn--secondary" onClick={onReset}>
        Clear search and filters
      </button>
    </div>
  );
}

/** Everyone in the venue: search, filter by topic, sort, and tap to find them on the map. */
export function PeopleList({ chrome, query, onQuery }: PeopleListProps) {
  const actions = useActions();
  const people = useApp((s) => s.people);
  const you = useApp((s) => s.you);
  const search = useDebounced(query.search, 160);
  const effective = useMemo<PeopleQuery>(
    () => ({ ...query, search, sort: query.sort === "match" && !you ? "newest" : query.sort }),
    [query, search, you],
  );
  const results = useMemo(() => queryPeople(people, effective, you), [people, effective, you]);
  const locate = useCallback((id: string) => actions.locate(id), [actions]);
  const filtered =
    effective.search.trim() !== "" || effective.topics.length > 0 || effective.intents.length > 0;
  const titleId = useId();
  const resetKey = [
    effective.search,
    effective.topics.join(),
    effective.intents.join(),
    effective.match,
    effective.sort,
  ].join("|");

  return (
    <section className="panel people" aria-labelledby={titleId}>
      <header className="panel__head people__head" data-sheet-grab>
        <Awning color="var(--marigold)" />
        <PanelNav chrome={chrome} />
        <div className="people__title">
          <h2 id={titleId}>People</h2>
          <p className="people__total">{numberFormat.format(people.length)} here</p>
        </div>
        <div className="search">
          <Glyph name="search" size={20} />
          <input
            type="search"
            className="search__input"
            placeholder="Search names, handles or ideas"
            aria-label="Search people"
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={query.search}
            onChange={(e) => onQuery({ ...query, search: e.target.value })}
          />
        </div>
        <TopicFilter query={query} onQuery={onQuery} />
        <IntentFilter query={query} onQuery={onQuery} />
        <div className="people__meta">
          <p className="people__count" aria-live="polite">
            {resultCount(results.length, filtered)}
          </p>
          {query.topics.length > 1 ? <MatchToggle query={query} onQuery={onQuery} /> : null}
          <SortSelect query={query} onQuery={onQuery} canMatch={you !== null} />
        </div>
      </header>
      <div className="panel__scroll">
        {results.length > 0 ? (
          <PeopleRows people={results} resetKey={resetKey} onPick={locate} label="People" />
        ) : (
          <EmptyState onReset={() => onQuery(DEFAULT_QUERY)} />
        )}
      </div>
    </section>
  );
}
