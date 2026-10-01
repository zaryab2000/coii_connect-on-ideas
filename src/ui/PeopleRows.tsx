import { useEffect, useRef, useState } from "react";

import type { Person, TopicId } from "@/data/types";
import { PersonRow } from "@/ui/PersonRow";

const FIRST_PAGE = 60;
const PAGE = 120;

interface PeopleRowsProps {
  readonly people: readonly Person[];
  /** Changing this (a new search or filter) starts again from the first page. */
  readonly resetKey: string;
  readonly omitTopic?: TopicId;
  readonly onPick: (id: string) => void;
  readonly label: string;
}

/**
 * A long list of people rendered a page at a time: more rows mount as the end scrolls into
 * view, and each row skips rendering while off screen (`content-visibility`).
 */
export function PeopleRows({ people, resetKey, omitTopic, onPick, label }: PeopleRowsProps) {
  const [limit, setLimit] = useState(FIRST_PAGE);
  const [lastKey, setLastKey] = useState(resetKey);
  const sentinel = useRef<HTMLLIElement>(null);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setLimit(FIRST_PAGE);
  }
  const hasMore = limit < people.length;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setLimit((n) => n + PAGE);
      },
      { root: el.closest(".panel__scroll"), rootMargin: "800px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore]);

  return (
    <ul className="people-rows" aria-label={label}>
      {people.slice(0, limit).map((person) => (
        <PersonRow
          key={person.id}
          person={person}
          onPick={onPick}
          {...(omitTopic ? { omitTopic } : {})}
        />
      ))}
      {hasMore ? <li ref={sentinel} className="people-rows__more" aria-hidden="true" /> : null}
    </ul>
  );
}
