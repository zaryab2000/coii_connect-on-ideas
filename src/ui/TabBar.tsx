import "@/ui/tabbar.css";
import type { ReactNode, Ref } from "react";

import { useActions, useApp } from "@/app/context";
import type { Overlay, Panel } from "@/app/store";
import { addaBadgeCount } from "@/ui/adda";
import { BeanAvatar } from "@/ui/BeanAvatar";
import { Icon } from "@/ui/Icon";
import { meetTabLabel } from "@/ui/meet";
import { BadgeMark, useMeetBadge } from "@/ui/MeetBadge";
import { addaTabLabel } from "@/ui/Panels";

type Tab = "map" | "meet" | "adda" | "people" | "join";

function activeTab(panel: Panel, overlay: Overlay): Tab {
  if (overlay === "you") return "join";
  if (panel === "people" || panel === "meet" || panel === "adda") return panel;
  return "map";
}

function TabButton(props: {
  readonly active: boolean;
  readonly label: string;
  readonly icon: ReactNode;
  readonly ariaLabel?: string | undefined;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="tab"
      aria-current={props.active ? "page" : undefined}
      aria-label={props.ariaLabel}
      onClick={props.onClick}
    >
      <span className="tab__icon">{props.icon}</span>
      <span className="tab__label">{props.label}</span>
    </button>
  );
}

/** Phone navigation: Map, Meet, Adda, People, and Join / You (which opens your profile overlay). */
export function TabBar({ ref }: { readonly ref?: Ref<HTMLElement> }) {
  const actions = useActions();
  const panel = useApp((s) => s.panel);
  const overlay = useApp((s) => s.overlay);
  const you = useApp((s) => s.you);
  const badge = useMeetBadge();
  const invites = useApp((s) => addaBadgeCount(s.adda));
  const tab = activeTab(panel, overlay);
  return (
    <nav ref={ref} className="tabbar" aria-label="Main">
      <TabButton
        active={tab === "map"}
        label="Map"
        icon={<Icon id="hot_beverage" size={26} />}
        onClick={() => actions.closePanel()}
      />
      <TabButton
        active={tab === "meet"}
        label="Meet"
        ariaLabel={meetTabLabel(badge)}
        icon={
          <>
            <Icon id="sparkles" size={26} />
            <BadgeMark badge={badge} />
          </>
        }
        onClick={() => actions.openPanel("meet")}
      />
      <TabButton
        active={tab === "adda"}
        label="Adda"
        ariaLabel={addaTabLabel(invites)}
        icon={
          <>
            <Icon id="circus_tent" size={26} />
            {invites > 0 ? <BadgeMark badge={{ kind: "count", count: invites }} /> : null}
          </>
        }
        onClick={() => actions.openPanel("adda")}
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
        onClick={() => actions.openOverlay("you")}
      />
    </nav>
  );
}
