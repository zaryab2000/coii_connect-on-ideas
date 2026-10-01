import type { Topic, TopicId } from "@/data/types";
import { TOPIC_IDS } from "@/data/types";

export const TOPICS: readonly Topic[] = [
  { id: "ai", label: "AI Agents & Agentic Payments", short: "AI Agents", color: 0x7c4dff, css: "#7c4dff", icon: "robot" },
  { id: "prediction", label: "Prediction Markets", short: "Prediction", color: 0xff4fa0, css: "#ff4fa0", icon: "crystal_ball" },
  { id: "defi", label: "DeFi", short: "DeFi", color: 0x19b8e6, css: "#19b8e6", icon: "water_wave" },
  { id: "privacy", label: "Privacy & ZK", short: "Privacy", color: 0x3a3570, css: "#3a3570", icon: "locked" },
  { id: "stablecoins", label: "Stablecoins & Payments", short: "Stablecoins", color: 0x22b573, css: "#22b573", icon: "dollar_banknote" },
  { id: "core", label: "Core Protocol & Scaling", short: "Core & L2s", color: 0x3366ff, css: "#3366ff", icon: "chains" },
  { id: "security", label: "Security", short: "Security", color: 0xff7a1a, css: "#ff7a1a", icon: "shield" },
  { id: "wallets", label: "Wallets & UX", short: "Wallets & UX", color: 0xffc93c, css: "#ffc93c", icon: "purse" },
  { id: "consumer", label: "Consumer, Social & Gaming", short: "Consumer", color: 0x8bd62f, css: "#8bd62f", icon: "video_game" },
  { id: "jobs", label: "Jobs & Hiring", short: "Jobs", color: 0x0fa3a3, css: "#0fa3a3", icon: "briefcase" },
];

const BY_ID = new Map<TopicId, Topic>(TOPICS.map((topic) => [topic.id, topic]));

export function topicById(id: TopicId): Topic {
  const topic = BY_ID.get(id);
  if (!topic) {
    throw new Error(`Unknown topic id "${id}". Expected one of: ${TOPIC_IDS.join(", ")}`);
  }
  return topic;
}

export function topicIndex(id: TopicId): number {
  return TOPIC_IDS.indexOf(id);
}

export function isTopicId(value: string): value is TopicId {
  return (TOPIC_IDS as readonly string[]).includes(value);
}
