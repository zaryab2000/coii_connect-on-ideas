import type { FaceKind, LegPose } from "@/engine/beanArt";
import { IdleKind, State } from "@/sim/world";
import type { Agent } from "@/sim/world";

/** How a bean is drawn this frame: offsets, squash, legs, face. Derived from sim state + time. */
export interface Pose {
  lift: number;
  bob: number;
  tilt: number;
  sx: number;
  sy: number;
  legs: LegPose;
  face: FaceKind;
  facing: number;
  phone: boolean;
}

export function createPose(): Pose {
  return {
    lift: 0,
    bob: 0,
    tilt: 0,
    sx: 1,
    sy: 1,
    legs: "stand",
    face: "open",
    facing: 1,
    phone: false,
  };
}

type StatePose = (pose: Pose, a: Agent, t: number) => void;

const walking: StatePose = (pose, a) => {
  const step = Math.sin(a.walkPhase);
  const running = a.state === State.RunningHome;
  pose.legs = step > 0 ? "stepA" : "stepB";
  pose.bob = Math.abs(step) * 1.4;
  pose.tilt = a.facing * (running ? 0.16 : 0.05);
  if (running) pose.face = "wow";
};

const IDLE_POSES: Readonly<Record<IdleKind, (pose: Pose, t: number) => void>> = {
  [IdleKind.Stand]: (pose, t) => {
    pose.sy = 1 + Math.sin(t * 2.2) * 0.012;
  },
  [IdleKind.LookAround]: (pose, t) => {
    pose.facing = Math.sin(t * 0.9) > 0 ? 1 : -1;
  },
  [IdleKind.Hop]: (pose, t) => {
    const hop = Math.max(0, Math.sin(t * 7));
    pose.lift = hop * 6;
    pose.sy = 1 + hop * 0.08;
    pose.sx = 1 - hop * 0.05;
    pose.face = "happy";
  },
  [IdleKind.Phone]: (pose) => {
    pose.face = "down";
    pose.phone = true;
  },
  [IdleKind.Wave]: (pose, t) => {
    pose.lift = Math.max(0, Math.sin(t * 9)) * 7;
    pose.face = "happy";
  },
};

const STATE_POSES: Readonly<Partial<Record<State, StatePose>>> = {
  [State.Wandering]: walking,
  [State.Commuting]: walking,
  [State.Arriving]: walking,
  [State.RunningHome]: walking,
  [State.Idle]: (pose, a, t) => IDLE_POSES[a.idleKind](pose, t),
  [State.Chatting]: (pose, _a, t) => {
    pose.sy = 1 + Math.sin(t * 11) * 0.025;
    if (Math.sin(t * 2.3) > 0.6) pose.face = "happy";
  },
  [State.Held]: (pose) => {
    pose.face = "wow";
    pose.sy = 0.94;
  },
  [State.Grabbed]: (pose, a, t) => {
    pose.legs = Math.sin(t * 22) > 0 ? "dangle" : "stepA";
    pose.face = "wow";
    pose.tilt = Math.sin(t * 9) * 0.14;
    pose.lift = a.z + Math.sin(t * 15) * 1.5;
  },
  [State.Thrown]: (pose, a, t) => {
    pose.legs = "dangle";
    pose.face = "wow";
    pose.tilt = Math.max(-0.7, Math.min(0.7, a.vx / 900)) + Math.sin(t * 13) * 0.1;
  },
  [State.Dizzy]: (pose, _a, t) => {
    pose.face = "dizzy";
    pose.tilt = Math.sin(t * 7) * 0.13;
  },
};

/**
 * Fills `pose` for an agent at time `t` (already offset by the person's seed). `squash` is the
 * renderer's decaying landing/bump impulse.
 */
export function computePose(pose: Pose, a: Agent, t: number, squash: number): Pose {
  pose.lift = a.z;
  pose.bob = 0;
  pose.tilt = 0;
  pose.sx = 1;
  pose.sy = 1;
  pose.legs = "stand";
  pose.face = t % 4.3 < 0.13 ? "blink" : "open";
  pose.facing = a.facing;
  pose.phone = false;
  STATE_POSES[a.state]?.(pose, a, t);
  if (squash > 0.01) {
    pose.sy *= 1 - squash * 0.45;
    pose.sx *= 1 + squash * 0.35;
  }
  return pose;
}
