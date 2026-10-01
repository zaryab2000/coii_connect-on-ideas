import "@/ui/panels.css";
import { useEffect, useMemo, useRef, useState } from "react";

import { useActions, useApp } from "@/app/context";
import type { Panel } from "@/app/store";
import { topicById } from "@/data/topics";
import type { TopicId } from "@/data/types";
import { BoothPanel } from "@/ui/BoothPanel";
import { usePresence } from "@/ui/hooks";
import { JoinPanel } from "@/ui/JoinPanel";
import { meetTabLabel } from "@/ui/meet";
import { BadgeMark, useMeetBadge } from "@/ui/MeetBadge";
import { MeetPanel } from "@/ui/MeetPanel";
import type { PanelChrome } from "@/ui/PanelChrome";
import type { PeopleQuery } from "@/ui/people";
import { PeopleList } from "@/ui/PeopleList";
import { ProfileCard } from "@/ui/ProfileCard";
import { Sheet } from "@/ui/Sheet";
import type { SheetSize } from "@/ui/Sheet";

/** What a panel shows, frozen so a closing sheet keeps its content while it slides away. */
export interface PanelView {
  readonly panel: Exclude<Panel, "none">;
  readonly personId: string | null;
  readonly topic: TopicId | null;
}

export interface QueryState {
  readonly query: PeopleQuery;
  readonly onQuery: (query: PeopleQuery) => void;
}

type ReturnTo = "booth" | "people" | "meet" | null;

/** The list panel a profile was opened from, so it can offer a way back. */
export function useReturnTo(panel: Panel): ReturnTo {
  const [state, setState] = useState<{ panel: Panel; returnTo: ReturnTo }>({
    panel,
    returnTo: null,
  });
  if (state.panel !== panel) {
    const from = state.panel;
    let returnTo: ReturnTo = null;
    if (panel === "profile") {
      returnTo = from === "booth" || from === "people" || from === "meet" ? from : null;
    }
    setState({ panel, returnTo });
  }
  return state.returnTo;
}

/** The current panel as a stable view object (new identity only when what it shows changes). */
export function usePanelView(): PanelView | null {
  const panel = useApp((s) => s.panel);
  const personId = useApp((s) => s.selectedId);
  const topic = useApp((s) => s.boothTopic);
  return useMemo(
    () => (panel === "none" ? null : { panel, personId, topic }),
    [panel, personId, topic],
  );
}

function ProfileView({ id, chrome }: { readonly id: string; readonly chrome: PanelChrome }) {
  const person = useApp((s) => s.people.find((p) => p.id === id) ?? null);
  return person ? <ProfileCard person={person} chrome={chrome} /> : null;
}

/** Renders the content for one panel view. */
export function PanelContent({
  view,
  chrome,
  query,
}: {
  readonly view: PanelView;
  readonly chrome: PanelChrome;
  readonly query: QueryState;
}) {
  switch (view.panel) {
    case "profile":
      return view.personId ? <ProfileView id={view.personId} chrome={chrome} /> : null;
    case "booth":
      return view.topic ? <BoothPanel topic={view.topic} chrome={chrome} /> : null;
    case "people":
      return <PeopleList chrome={chrome} query={query.query} onQuery={query.onQuery} />;
    case "join":
      return <JoinPanel chrome={chrome} />;
    case "meet":
      return <MeetPanel chrome={chrome} />;
  }
}

const SHEET: Record<PanelView["panel"], { size: SheetSize; modal: boolean; label: string }> = {
  profile: { size: "auto", modal: false, label: "Profile" },
  booth: { size: "peek", modal: false, label: "Booth" },
  people: { size: "tall", modal: true, label: "People" },
  join: { size: "tall", modal: true, label: "Join the adda" },
  meet: { size: "tall", modal: true, label: "Meet" },
};

function backTo(
  returnTo: ReturnTo,
  topic: TopicId | null,
  open: (panel: Panel) => void,
): PanelChrome["back"] {
  if (returnTo === "people") return { label: "People", onBack: () => open("people") };
  if (returnTo === "meet") return { label: "Meet", onBack: () => open("meet") };
  if (returnTo === "booth" && topic) {
    return { label: topicById(topic).short, onBack: () => open("booth") };
  }
  return null;
}

/** Phone: panels as bottom sheets above the tab bar, one at a time, animating in and out. */
export function PhoneSheets({
  query,
  onSheetHeight,
  reducedMotion,
}: {
  readonly query: QueryState;
  readonly onSheetHeight: (height: number) => void;
  readonly reducedMotion: boolean;
}) {
  const actions = useActions();
  const view = usePanelView();
  const returnTo = useReturnTo(view?.panel ?? "none");
  const boothTopic = useApp((s) => s.boothTopic);
  const items = usePresence(view, reducedMotion ? 160 : 240, (a, b) => a.panel === b.panel);
  const chrome: PanelChrome = {
    back:
      view?.panel === "profile"
        ? backTo(returnTo, boothTopic, (next) => actions.openPanel(next))
        : null,
    onClose: () => actions.closePanel(),
  };
  useEffect(() => {
    if (!view) onSheetHeight(0);
  }, [view, onSheetHeight]);

  return items.map(({ key, value, leaving }) => (
    <Sheet
      key={key}
      label={SHEET[value.panel].label}
      size={SHEET[value.panel].size}
      modal={SHEET[value.panel].modal}
      leaving={leaving}
      onClose={() => actions.closePanel()}
      onVisibleHeight={onSheetHeight}
    >
      <PanelContent view={value} chrome={chrome} query={query} />
    </Sheet>
  ));
}

type DeskTab = "people" | "meet" | "join";

const DESK_TABS: readonly DeskTab[] = ["people", "meet", "join"];

function isDeskTab(panel: Panel): panel is DeskTab {
  return panel === "people" || panel === "meet" || panel === "join";
}

/** The People/Meet/Join tab to show; remembers the last one while a profile or booth is open. */
function useDeskTab(panel: Panel): DeskTab {
  const [lastTab, setLastTab] = useState<DeskTab>("people");
  if (isDeskTab(panel) && panel !== lastTab) setLastTab(panel);
  return isDeskTab(panel) ? panel : lastTab;
}

function detailOf(view: PanelView | null): PanelView | null {
  return view && (view.panel === "profile" || view.panel === "booth") ? view : null;
}

function tabName(tab: DeskTab, joined: boolean): string {
  if (tab === "people") return "People";
  if (tab === "meet") return "Meet";
  return joined ? "You" : "Join";
}

/** Back button for a desktop detail view: to the list it came from, else to the current tab. */
function useDeskChrome(detail: PanelView | null, tab: DeskTab, joined: boolean): PanelChrome {
  const actions = useActions();
  const boothTopic = useApp((s) => s.boothTopic);
  const returnTo = useReturnTo(detail?.panel ?? "none");
  const fromList =
    detail?.panel === "profile"
      ? backTo(returnTo, boothTopic, (next) => actions.openPanel(next))
      : null;
  return {
    back: fromList ?? { label: tabName(tab, joined), onBack: () => actions.openPanel(tab) },
    onClose: null,
  };
}

function SideTabs({ tab, detail, joined }: { tab: DeskTab; detail: boolean; joined: boolean }) {
  const actions = useActions();
  const badge = useMeetBadge();
  return (
    <nav className="side__tabs" aria-label="Panels">
      {DESK_TABS.map((id) => (
        <button
          key={id}
          type="button"
          className="side__tab"
          aria-current={!detail && tab === id ? "page" : undefined}
          aria-label={id === "meet" ? meetTabLabel(badge) : undefined}
          onClick={() => actions.openPanel(id)}
        >
          {tabName(id, joined)}
          {id === "meet" ? <BadgeMark badge={badge} /> : null}
        </button>
      ))}
    </nav>
  );
}

/** Desktop: a side panel with People / Meet / Join tabs that also hosts profile and booth details. */
export function SidePanel({ query }: { readonly query: QueryState }) {
  const view = usePanelView();
  const joined = useApp((s) => s.you !== null);
  const tab = useDeskTab(view?.panel ?? "none");
  const detail = detailOf(view);
  const chrome = useDeskChrome(detail, tab, joined);
  const bodyRef = useRef<HTMLDivElement>(null);
  const detailKey = detail ? `${detail.panel}:${detail.personId}:${detail.topic}` : null;
  useEffect(() => {
    if (detailKey) bodyRef.current?.focus({ preventScroll: true });
  }, [detailKey]);
  const listView: PanelView = { panel: tab, personId: null, topic: null };

  return (
    <aside className="side" aria-label="People and profiles">
      <div className="side__card">
        <SideTabs tab={tab} detail={detail !== null} joined={joined} />
        <div className="side__body" ref={bodyRef} tabIndex={-1}>
          <PanelContent
            view={detail ?? listView}
            chrome={detail ? chrome : { back: null, onClose: null }}
            query={query}
          />
        </div>
      </div>
    </aside>
  );
}
