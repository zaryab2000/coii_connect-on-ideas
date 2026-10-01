import { Application, Container } from "pixi.js";

import { hairTint, SKIN_TONES } from "@/data/avatar";
import { iconUrl } from "@/data/icons";
import { TOPICS, topicIndex } from "@/data/topics";
import type { IconId, Person, TopicId } from "@/data/types";
import { BUBBLE_ICONS, buildCrowdAtlas } from "@/engine/atlas";
import type { CrowdAtlas } from "@/engine/atlas";
import { BOOTH_LABEL_DY, BoothView } from "@/engine/booths";
import { Camera } from "@/engine/camera";
import { CrowdRenderer, LOD_ZOOM } from "@/engine/crowd";
import type { BeanLook } from "@/engine/crowd";
import { EffectPool } from "@/engine/fx";
import { Gestures } from "@/engine/gestures";
import type { GestureTarget } from "@/engine/gestures";
import { loadIconTextures } from "@/engine/icons";
import { BoothLabels, LabelLayer } from "@/engine/labels";
import { bgr, FLOOR } from "@/engine/palette";
import type { EngineApi, EngineEvents, EngineStats } from "@/engine/types";
import { buildChaiStall, buildFloor, buildGarlands, buildGate } from "@/engine/venue";
import { zoneCapacities } from "@/sim/capacity";
import { computeLayout, modeForAspect } from "@/sim/layout";
import type { VenueLayout } from "@/sim/layout";
import { State, World } from "@/sim/world";

const STEP = 1 / 30;
const MAX_STEPS = 3;
const DISPLAY_FONT = "Baloo 2";
const MAX_BUBBLES = 70;

interface Scene {
  readonly app: Application;
  readonly world: World;
  readonly layout: VenueLayout;
  readonly crowd: CrowdRenderer;
  readonly booths: readonly BoothView[];
  readonly camera: Camera;
  readonly gestures: Gestures;
  readonly effects: EffectPool;
  readonly labels: LabelLayer;
  readonly boothLabels: BoothLabels;
  readonly atlas: CrowdAtlas;
  readonly worldLayer: Container;
}

type Listeners = { [K in keyof EngineEvents]: Set<EngineEvents[K]> };

function seedOf(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return ((hash >>> 0) % 1000) / 1000;
}

export class AddaEngine implements EngineApi {
  private people: Person[] = [];
  private readonly agentOf = new Map<string, number>();
  private readonly personAt: (Person | undefined)[] = [];
  private readonly interest: number[] = TOPICS.map(() => 0);
  private scene: Scene | null = null;
  private starting = false;
  private readonly root: HTMLDivElement;
  private host: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly listeners: Listeners = {
    select: new Set(),
    boothTap: new Set(),
    ready: new Set(),
  };
  private readonly queue: ((scene: Scene) => void)[] = [];
  private paused = false;
  private reducedMotion = false;
  private accumulator = 0;
  private follow = -1;
  private youIndex = -1;
  private readonly perf = { fps: 60, frameMs: 0, simMs: 0 };
  private debugEl: HTMLDivElement | null = null;
  private bubbleCount = 0;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "map-root";
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  // ---- EngineApi -----------------------------------------------------------------------------

  setPeople(people: readonly Person[]): void {
    if (this.scene || this.starting)
      throw new Error("setPeople must be called before the map is first mounted");
    this.people = [...people];
  }

  mount(el: HTMLElement): void {
    this.host = el;
    el.append(this.root);
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(el);
    if (!this.scene && !this.starting) {
      this.starting = true;
      this.start(el).catch((error: unknown) => this.showFailure(error));
    }
  }

  unmount(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.root.remove();
    this.host = null;
  }

  spawn(person: Person, fromGate: boolean): void {
    this.whenReady((scene) => {
      const index = this.addAgent(scene, person, fromGate ? "gate" : "scatter");
      if (!fromGate) return;
      const gate = scene.layout.gate;
      this.confetti(scene, gate.x, gate.y - 30, person.isYou ? 70 : 18);
      if (person.isYou) {
        scene.camera.flyTo(
          gate.x,
          gate.y - 160,
          Math.max(0.9, scene.camera.fitZoom),
          this.reducedMotion ? 0 : 1.1,
        );
        this.follow = index;
      }
    });
  }

  remove(personId: string): void {
    this.whenReady((scene) => {
      const index = this.agentOf.get(personId);
      if (index === undefined) return;
      const person = this.personAt[index];
      scene.world.remove(index);
      scene.crowd.forget(index);
      scene.effects.clearFollowing(index);
      if (scene.crowd.selected === index) scene.crowd.selected = -1;
      if (this.follow === index) this.follow = -1;
      if (this.youIndex === index) this.youIndex = -1;
      this.agentOf.delete(personId);
      this.personAt[index] = undefined;
      for (const topic of person?.topics ?? []) this.bumpInterest(scene, topicIndex(topic), -1);
    });
  }

  select(personId: string | null): void {
    this.whenReady((scene) => {
      scene.crowd.selected = personId === null ? -1 : (this.agentOf.get(personId) ?? -1);
    });
  }

  locate(personId: string): void {
    this.whenReady((scene) => {
      const index = this.agentOf.get(personId);
      if (index === undefined) return;
      const a = scene.world.agent(index);
      scene.crowd.selected = index;
      scene.world.wave(index);
      this.follow = -1;
      const zoom = Math.max(scene.camera.zoom, 1.15);
      scene.camera.flyTo(a.x, a.y - 30, zoom, this.reducedMotion ? 0 : 0.9);
      this.waveBubble(scene, index);
    });
  }

  focusBooth(topic: TopicId): void {
    this.whenReady((scene) => {
      const zone = scene.layout.zones[topicIndex(topic)];
      if (!zone) return;
      const span = zone.r1 * 2 + 160;
      const zoom = Math.min(scene.camera.viewW / span, scene.camera.viewH / span);
      scene.camera.flyTo(
        zone.x,
        zone.y,
        Math.max(zoom, LOD_ZOOM + 0.05),
        this.reducedMotion ? 0 : 0.8,
      );
    });
  }

  highlightTopics(topics: readonly TopicId[]): void {
    this.whenReady((scene) => {
      const set = new Set(topics.map(topicIndex));
      scene.crowd.highlight = set;
      scene.booths.forEach((booth, i) => {
        const dimmed = set.size > 0 && !set.has(i);
        booth.setDimmed(dimmed);
        scene.boothLabels.setDimmed(i, dimmed);
      });
    });
  }

  fit(): void {
    this.whenReady((scene) => {
      this.follow = -1;
      scene.camera.fit(this.reducedMotion ? 0 : 0.8);
    });
  }

  pause(): void {
    this.paused = true;
    this.scene?.app.ticker.stop();
  }

  resume(): void {
    this.paused = false;
    if (!document.hidden) this.scene?.app.ticker.start();
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (this.scene) this.scene.world.reducedMotion = reduced;
  }

  stats(): EngineStats {
    return {
      fps: this.perf.fps,
      frameMs: this.perf.frameMs,
      simMs: this.perf.simMs,
      beans: this.scene?.world.activeCount ?? 0,
      particles: this.scene?.crowd.container.particleChildren.length ?? 0,
      zoom: this.scene?.camera.zoom ?? 0,
    };
  }

  on<K extends keyof EngineEvents>(event: K, listener: EngineEvents[K]): () => void {
    const set = this.listeners[event] as Set<EngineEvents[K]>;
    set.add(listener);
    return () => set.delete(listener);
  }

  /** Screen position (CSS px, relative to the map) of a person's body; used by tests. */
  screenPositionOf(personId: string): { x: number; y: number } | null {
    const scene = this.scene;
    const index = this.agentOf.get(personId);
    if (!scene || index === undefined) return null;
    const a = scene.world.agent(index);
    return scene.camera.worldToScreen(a.x, a.y - 18 - a.z);
  }

  // ---- startup ---------------------------------------------------------------------------------

  private async start(host: HTMLElement): Promise<void> {
    await Promise.all([
      document.fonts.load(`800 48px "${DISPLAY_FONT}"`),
      document.fonts.load('400 16px "Mukta"'),
    ]);
    const rect = host.getBoundingClientRect();
    const topicLists = this.people.map((p) => p.topics.map(topicIndex));
    const capacities = zoneCapacities(topicLists, TOPICS.length);
    const layout = computeLayout(
      modeForAspect(rect.width / Math.max(1, rect.height)),
      capacities.slice(0, TOPICS.length),
      capacities[TOPICS.length] ?? 40,
    );
    const world = new World(layout, { seed: 2026, capacities, reducedMotion: this.reducedMotion });

    const params = new URLSearchParams(location.search);
    const resolution = Number(params.get("res")) || Math.min(window.devicePixelRatio || 1, 2);
    const app = new Application();
    await app.init({
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
      preference: "webgl",
      antialias: false,
      resolution,
      autoDensity: true,
      background: FLOOR,
      eventFeatures: { move: false, globalMove: false, click: false, wheel: false },
    });
    app.stage.eventMode = "none";
    app.canvas.classList.add("map-canvas");
    app.canvas.setAttribute("role", "img");
    app.canvas.setAttribute(
      "aria-label",
      "Live map of the venue: topic booths with attendees moving around them. Use the People list for an accessible view.",
    );
    this.root.prepend(app.canvas);

    const [atlas, icons] = await Promise.all([
      buildCrowdAtlas(),
      loadIconTextures([...TOPICS.map((t) => t.icon), "hot_beverage"], 96),
    ]);
    this.scene = this.buildScene(app, world, layout, atlas, icons, rect);
    this.starting = false;
    for (const person of this.people) this.addAgent(this.scene, person, "scatter");
    for (const run of this.queue.splice(0)) run(this.scene);
    this.introCamera(this.scene);
    app.ticker.add(() => this.frame(app.ticker.deltaMS));
    if (params.has("debug")) this.showDebug();
    for (const listener of this.listeners.ready) listener();
  }

  private buildScene(
    app: Application,
    world: World,
    layout: VenueLayout,
    atlas: CrowdAtlas,
    icons: Map<IconId, import("pixi.js").Texture>,
    rect: DOMRect,
  ): Scene {
    const worldLayer = new Container({ isRenderGroup: true, label: "world" });
    worldLayer.addChild(buildFloor(layout));
    const boothLayer = new Container({ label: "booths" });
    const booths = layout.zones
      .filter((zone) => zone.kind === "booth")
      .map((zone) => {
        const topic = TOPICS[zone.topic];
        const icon = topic ? icons.get(topic.icon) : undefined;
        if (!topic || !icon) throw new Error(`Booth zone ${zone.topic} has no topic or icon`);
        const view = new BoothView(zone, topic, icon);
        boothLayer.addChild(view.container);
        return view;
      });
    const plaza = layout.zones[layout.plazaIndex];
    const cup = icons.get("hot_beverage");
    if (plaza && cup) boothLayer.addChild(buildChaiStall(plaza, DISPLAY_FONT, cup));
    worldLayer.addChild(boothLayer);
    const crowd = new CrowdRenderer(atlas, world, layout.width, layout.height);
    worldLayer.addChild(crowd.container);
    worldLayer.addChild(buildGarlands(layout));
    worldLayer.addChild(buildGate(layout, DISPLAY_FONT));
    app.stage.addChild(worldLayer);

    const camera = new Camera();
    camera.setWorld(layout.width, layout.height);
    camera.setViewport(rect.width, rect.height);
    const labels = new LabelLayer();
    const boothLabels = new BoothLabels(
      TOPICS,
      (topic) => iconUrl(topic.icon),
      (index) => {
        const id = TOPICS[index]?.id;
        if (id) this.tapBooth(id);
      },
    );
    this.root.append(labels.el, boothLabels.el);
    const scene: Scene = {
      app,
      world,
      layout,
      crowd,
      booths,
      camera,
      labels,
      boothLabels,
      atlas,
      worldLayer,
      effects: new EffectPool(),
      gestures: new Gestures(
        app.canvas,
        this.gestureTarget(() => scene),
      ),
    };
    return scene;
  }

  private introCamera(scene: Scene): void {
    const { camera, layout } = scene;
    const plaza = layout.zones[layout.plazaIndex];
    camera.fit(0);
    if (layout.mode === "landscape" || !plaza) return;
    // Phones: open on the whole street, then swoop in so both rows of stalls fill the width.
    const booths = layout.zones.filter((zone) => zone.kind === "booth");
    const minX = Math.min(...booths.map((zone) => zone.x)) - 130;
    const maxX = Math.max(...booths.map((zone) => zone.x)) + 130;
    const target = Math.max(LOD_ZOOM + 0.02, camera.viewW / (maxX - minX));
    const x = (minX + maxX) / 2;
    if (this.reducedMotion) {
      camera.flyTo(x, plaza.y, target, 0);
      return;
    }
    window.setTimeout(() => {
      if (!camera.animating && camera.vx === 0) camera.flyTo(x, plaza.y, target, 1.8);
    }, 900);
  }

  private showFailure(error: unknown): void {
    this.starting = false;
    console.error("Adda venue map failed to start", error);
    const message = document.createElement("p");
    message.className = "map-error";
    message.textContent =
      "The live venue map couldn't start in this browser (WebGL may be turned off). The People list still works.";
    this.root.append(message);
  }

  // ---- per frame -------------------------------------------------------------------------------

  private frame(deltaMs: number): void {
    const scene = this.scene;
    if (!scene) return;
    const start = performance.now();
    const dt = Math.min(deltaMs, 100) / 1000;
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= STEP && steps < MAX_STEPS) {
      scene.world.step(STEP);
      this.consumeEvents(scene);
      scene.crowd.sortByDepth();
      this.accumulator -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS && this.accumulator >= STEP) this.accumulator = 0;
    const simDone = performance.now();
    const alpha = this.accumulator / STEP;
    this.followArrival(scene, dt);
    scene.camera.update(dt);
    const { camera, worldLayer } = scene;
    worldLayer.scale.set(camera.zoom);
    worldLayer.position.set(
      camera.viewW / 2 - camera.x * camera.zoom,
      camera.viewH / 2 - camera.y * camera.zoom,
    );
    scene.effects.update(dt);
    scene.crowd.render(alpha, camera.view(), scene.world.time + alpha * STEP, dt, scene.effects);
    this.updateLabels(scene, alpha);
    this.positionBoothLabels(scene);
    const end = performance.now();
    this.perf.fps = this.perf.fps * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
    this.perf.frameMs = this.perf.frameMs * 0.9 + (end - start) * 0.1;
    this.perf.simMs = this.perf.simMs * 0.9 + (simDone - start) * 0.1;
  }

  private followArrival(scene: Scene, dt: number): void {
    if (this.follow < 0 || scene.camera.animating) return;
    const a = scene.world.agents[this.follow];
    if (!a?.active || a.state === State.Idle) {
      this.follow = -1;
      return;
    }
    const k = 1 - Math.exp(-2.5 * dt);
    scene.camera.x += (a.x - scene.camera.x) * k;
    scene.camera.y += (a.y - 30 - scene.camera.y) * k;
    scene.camera.clamp();
  }

  private updateLabels(scene: Scene, alpha: number): void {
    this.updateYouLabel(scene, alpha);
    const index = scene.crowd.selected;
    const a = index >= 0 ? scene.world.agents[index] : undefined;
    const person = index >= 0 ? this.personAt[index] : undefined;
    if (!a?.active || !person || scene.camera.zoom < LOD_ZOOM) {
      scene.labels.set("selected", "", null, "selected");
      return;
    }
    const x = a.px + (a.x - a.px) * alpha;
    const y = a.py + (a.y - a.py) * alpha - a.z - 70;
    scene.labels.set("selected", person.name, scene.camera.worldToScreen(x, y), "selected");
  }

  private updateYouLabel(scene: Scene, alpha: number): void {
    const a = this.youIndex >= 0 ? scene.world.agents[this.youIndex] : undefined;
    const person = this.youIndex >= 0 ? this.personAt[this.youIndex] : undefined;
    if (!a?.active || !person || scene.crowd.selected === this.youIndex) {
      scene.labels.set("you", "", null, "you");
      return;
    }
    const x = a.px + (a.x - a.px) * alpha;
    const lift = scene.camera.zoom < LOD_ZOOM ? 40 : 66;
    const y = a.py + (a.y - a.py) * alpha - a.z - lift;
    const first = person.name.split(" ")[0] ?? person.name;
    scene.labels.set("you", `You · ${first}`, scene.camera.worldToScreen(x, y), "you");
  }

  private consumeEvents(scene: Scene): void {
    const { world, crowd } = scene;
    for (let i = 0; i < world.eventCount; i++) {
      const event = world.events[i];
      if (!event) continue;
      switch (event.kind) {
        case "bounce":
          crowd.impulse(event.agent, 0.55);
          this.dust(scene, event.x, event.y, 3);
          break;
        case "bump":
          crowd.impulse(event.agent, 0.4);
          this.dust(scene, event.x, event.y, 2);
          break;
        case "dizzy":
          crowd.impulse(event.agent, 0.7);
          this.dust(scene, event.x, event.y, 4);
          break;
        case "arrive":
          crowd.impulse(event.agent, 0.35);
          if (world.agents[event.agent]?.isYou) this.confetti(scene, event.x, event.y - 40, 60);
          break;
        case "bubble":
          this.chatBubble(scene, event.agent, event.x, event.y);
          break;
        case "chat":
          break;
      }
    }
  }

  // ---- effects -------------------------------------------------------------------------------

  private inView(scene: Scene, x: number, y: number): boolean {
    const v = scene.camera.view();
    return x > v.x0 - 60 && x < v.x1 + 60 && y > v.y0 - 60 && y < v.y1 + 120;
  }

  private dust(scene: Scene, x: number, y: number, count: number): void {
    if (this.reducedMotion || !this.inView(scene, x, y)) return;
    for (let k = 0; k < count; k++) {
      const e = scene.effects.spawn(
        scene.atlas.dust,
        x + (Math.random() - 0.5) * 16,
        y - 2,
        0.45 + Math.random() * 0.2,
      );
      e.vx = (Math.random() - 0.5) * 70;
      e.vy = -14 - Math.random() * 22;
      e.size = 0.7 + Math.random() * 0.5;
      e.grow = 1.1;
    }
  }

  private confetti(scene: Scene, x: number, y: number, count: number): void {
    if (this.reducedMotion || !this.inView(scene, x, y)) return;
    for (let k = 0; k < count; k++) {
      const e = scene.effects.spawn(scene.atlas.confetti, x, y, 1.3 + Math.random() * 0.6);
      e.vx = (Math.random() - 0.5) * 330;
      e.vy = -210 - Math.random() * 230;
      e.gravity = 560;
      e.spin = (Math.random() - 0.5) * 18;
      e.size = 1 + Math.random() * 0.6;
      e.tint = TOPICS[k % TOPICS.length]?.color ?? 0xffffff;
    }
  }

  private chatBubble(scene: Scene, agent: number, x: number, y: number): void {
    if (
      this.bubbleCount >= MAX_BUBBLES ||
      !this.inView(scene, x, y) ||
      scene.camera.zoom < LOD_ZOOM
    )
      return;
    const iconId = BUBBLE_ICONS[Math.floor(Math.random() * BUBBLE_ICONS.length)] ?? "light_bulb";
    this.bubbleAt(scene, agent, iconId, 1.7);
  }

  private waveBubble(scene: Scene, agent: number): void {
    this.bubbleAt(scene, agent, "waving_hand", 2.6);
  }

  private bubbleAt(scene: Scene, agent: number, iconId: IconId, life: number): void {
    const icon = scene.atlas.icons.get(iconId);
    if (!icon) return;
    const bubble = scene.effects.spawn(scene.atlas.bubble, 9, 0, life);
    bubble.follow = agent;
    bubble.followDy = -60;
    bubble.pop = true;
    const glyph = scene.effects.spawn(icon, 9, 0, life);
    glyph.follow = agent;
    glyph.followDy = -62;
    glyph.size = 0.62;
    glyph.pop = true;
    this.bubbleCount++;
    window.setTimeout(() => this.bubbleCount--, life * 1000);
  }

  // ---- agents ----------------------------------------------------------------------------------

  private addAgent(scene: Scene, person: Person, at: "scatter" | "gate"): number {
    const topics = person.topics.map(topicIndex);
    const index = scene.world.spawn({ id: person.id, topics, isYou: person.isYou }, at);
    scene.crowd.setLook(index, this.lookFor(scene.atlas, person, topics[0] ?? 0));
    this.agentOf.set(person.id, index);
    this.personAt[index] = person;
    if (person.isYou) this.youIndex = index;
    for (const topic of topics) this.bumpInterest(scene, topic, 1);
    return index;
  }

  private lookFor(atlas: CrowdAtlas, person: Person, primary: number): BeanLook {
    const { avatar } = person;
    const lod = atlas.lod[primary * SKIN_TONES.length + avatar.skin] ?? atlas.lod[0];
    if (!lod) throw new Error("Crowd atlas is missing far-zoom bean frames");
    return {
      shirt: bgr(TOPICS[primary]?.color ?? 0xffffff),
      skin: bgr(SKIN_TONES[avatar.skin] ?? 0xd9a066),
      hair: bgr(hairTint(avatar.hair, avatar.hairColor)),
      hairFrame: atlas.hair[avatar.hair] ?? null,
      accessory: atlas.accessories[avatar.accessory] ?? null,
      lod,
      seed: seedOf(person.id),
    };
  }

  private bumpInterest(scene: Scene, topic: number, delta: number): void {
    this.interest[topic] = Math.max(0, (this.interest[topic] ?? 0) + delta);
    const info = TOPICS[topic];
    if (info) scene.boothLabels.setCount(topic, this.interest[topic] ?? 0, info);
  }

  // ---- input -----------------------------------------------------------------------------------

  private gestureTarget(getScene: () => Scene): GestureTarget {
    const world = (): World => getScene().world;
    const toWorld = (sx: number, sy: number): { x: number; y: number } =>
      getScene().camera.screenToWorld(sx, sy);
    return {
      get camera() {
        return getScene().camera;
      },
      hitBean: (sx, sy, touch) => {
        const p = toWorld(sx, sy);
        return world().pick(p.x, p.y, (touch ? 26 : 16) / getScene().camera.zoom);
      },
      hitBooth: (sx, sy) => {
        const p = toWorld(sx, sy);
        return getScene().booths.findIndex((booth) => booth.contains(p.x, p.y));
      },
      tapBean: (index) => this.tapBean(getScene(), index),
      tapBooth: (topic) => {
        const id = TOPICS[topic]?.id;
        if (id) this.tapBooth(id);
      },
      tapEmpty: () => {
        const scene = getScene();
        if (scene.crowd.selected < 0) return;
        scene.crowd.selected = -1;
        for (const listener of this.listeners.select) listener(null);
      },
      hold: (index) => world().hold(index),
      unhold: (index) => world().unhold(index),
      grab: (index) => {
        this.follow = -1;
        world().grab(index);
        getScene().crowd.impulse(index, 0.5);
      },
      drag: (index, sx, sy) => {
        const p = toWorld(sx, sy);
        world().dragTo(index, p.x, p.y + 44);
      },
      release: (index, vx, vy) => {
        const zoom = getScene().camera.zoom;
        world().release(index, vx / zoom, vy / zoom);
      },
      interacted: () => {
        this.follow = -1;
      },
    };
  }

  private tapBooth(id: TopicId): void {
    this.focusBooth(id);
    for (const listener of this.listeners.boothTap) listener(id);
  }

  private positionBoothLabels(scene: Scene): void {
    const { camera, layout, boothLabels } = scene;
    const scale = Math.min(1.12, Math.max(0.78, 0.62 + camera.zoom * 0.5));
    for (const zone of layout.zones) {
      if (zone.kind !== "booth") continue;
      const p = camera.worldToScreen(zone.x, zone.y + BOOTH_LABEL_DY);
      boothLabels.position(zone.topic, p.x, p.y, scale, camera.viewW);
    }
  }

  private tapBean(scene: Scene, index: number): void {
    const a = scene.world.agents[index];
    const person = this.personAt[index];
    if (!a || !person) return;
    if (scene.camera.zoom < LOD_ZOOM) {
      scene.camera.flyTo(a.x, a.y - 30, 0.85, this.reducedMotion ? 0 : 0.6);
      return;
    }
    scene.crowd.selected = index;
    scene.crowd.impulse(index, 0.45);
    for (const listener of this.listeners.select) listener(person.id);
  }

  // ---- housekeeping ----------------------------------------------------------------------------

  private whenReady(run: (scene: Scene) => void): void {
    if (this.scene) run(this.scene);
    else this.queue.push(run);
  }

  private resize(): void {
    const scene = this.scene;
    const host = this.host;
    if (!scene || !host) return;
    const { width, height } = host.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    scene.app.renderer.resize(width, height);
    scene.camera.setViewport(width, height);
  }

  private readonly onVisibility = (): void => {
    const ticker = this.scene?.app.ticker;
    if (!ticker) return;
    if (document.hidden) ticker.stop();
    else if (!this.paused) {
      this.accumulator = 0;
      ticker.start();
    }
  };

  private showDebug(): void {
    this.debugEl = document.createElement("div");
    this.debugEl.className = "map-debug";
    this.root.append(this.debugEl);
    window.setInterval(() => {
      if (!this.debugEl) return;
      const s = this.stats();
      this.debugEl.textContent = `${s.fps.toFixed(0)} fps · frame ${s.frameMs.toFixed(1)}ms · sim ${s.simMs.toFixed(1)}ms · ${s.beans} beans · ${s.particles} particles · zoom ${s.zoom.toFixed(2)}`;
    }, 500);
  }
}
