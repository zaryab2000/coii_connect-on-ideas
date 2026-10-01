import "@/ui/tabbar.css";
import type { ReactNode } from "react";

import { useActions, useApp } from "@/app/context";
import type { Panel } from "@/app/store";
import { BeanAvatar } from "@/ui/BeanAvatar";
import { Icon } from "@/ui/Icon";

type Tab = "map" | "people" | "join";

function activeTab(panel: Panel): Tab {
  if (panel === "people") return "people";
  if (panel === "join") return "join";
  return "map";
}

function TabButton(props: {
  readonly active: boolean;
  readonly label: string;
  readonly icon: ReactNode;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="tab"
      aria-current={props.active ? "page" : undefined}
      onClick={props.onClick}
    >
      <span className="tab__icon">{props.icon}</span>
      <span className="tab__label">{props.label}</span>
    </button>
  );
}

/** Phone navigation: Map, People, and Join (which becomes You once you've joined). */
export function TabBar() {
  const actions = useActions();
  const panel = useApp((s) => s.panel);
  const you = useApp((s) => s.you);
  const tab = activeTab(panel);
  return (
    <nav className="tabbar" aria-label="Main">
      <TabButton
        active={tab === "map"}
        label="Map"
        icon={<Icon id="hot_beverage" size={26} />}
        onClick={() => actions.closePanel()}
      />
      <TabButton
        active={tab === "people"}
        label="People"
        icon={<Icon id="handshake" size={26} />}
        onClick={() => actions.openPanel("people")}
      />
      <TabButton
        active={tab === "join"}
        label={you ? "You" : "Join"}
        icon={
          you ? (
            <BeanAvatar avatar={you.avatar} topic={you.topics[0] ?? "ai"} size={30} face="happy" />
          ) : (
            <Icon id="waving_hand" size={26} />
          )
        }
        onClick={() => actions.openPanel("join")}
      />
    </nav>
  );
}
