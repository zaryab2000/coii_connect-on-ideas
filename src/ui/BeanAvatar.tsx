import { useEffect, useRef } from "react";

import type { Avatar, TopicId } from "@/data/types";
import type { FaceKind } from "@/engine/beanArt";
import { renderAvatar } from "@/ui/avatar";

type Paint = () => void;

const pending = new Map<Element, Paint>();
const observers = new WeakMap<Element | Document, IntersectionObserver>();

function observerFor(root: Element | null): IntersectionObserver {
  const key = root ?? document;
  let observer = observers.get(key);
  if (!observer) {
    const created = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          pending.get(entry.target)?.();
          pending.delete(entry.target);
          created.unobserve(entry.target);
        }
      },
      { root, rootMargin: "320px 0px" },
    );
    observers.set(key, created);
    observer = created;
  }
  return observer;
}

/**
 * Paints a list avatar the first time its row nears the visible part of its scroll container.
 * One observer per scroller keeps this cheap for long lists.
 */
function whenVisible(el: Element, paint: Paint): () => void {
  const observer = observerFor(el.closest(".panel__scroll"));
  pending.set(el, paint);
  observer.observe(el);
  return () => {
    pending.delete(el);
    observer.unobserve(el);
  };
}

interface BeanAvatarProps {
  readonly avatar: Avatar;
  readonly topic: TopicId;
  readonly size: number;
  readonly face?: FaceKind;
  /** Paint only once scrolled near the viewport (long lists). */
  readonly lazy?: boolean;
  readonly className?: string;
}

/** A person's bean, drawn with the same art as the live map. Decorative: names carry meaning. */
export function BeanAvatar({ avatar, topic, size, face, lazy, className }: BeanAvatarProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const paint = (): void => renderAvatar(canvas, avatar, topic, size, face);
    if (!lazy) {
      paint();
      return undefined;
    }
    return whenVisible(canvas, paint);
  }, [avatar, topic, size, face, lazy]);
  return (
    <canvas
      ref={ref}
      className={className}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
