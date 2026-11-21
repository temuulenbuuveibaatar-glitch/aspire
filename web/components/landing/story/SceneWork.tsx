"use client";

// Scene 05, It does the work: the app's own reply to a task ("On it, sir.", lib/brain/shared.ts
// ON_IT) and the seven jobs it takes on. While the stage is pinned the job chips fly in from all
// sides, one after another, and settle into a grid beside the reply. Every chip names a tool the
// agent really has (copy.ts CHIP_IDS lists which). At rest the grid is simply there.

import { AppWindow, Bell, CalendarPlus, Laptop, Music, Play, ScanText, type LucideIcon } from "lucide-react";
import { motion, useTransform } from "motion/react";
import { createElement } from "react";
import type { Lang } from "@/lib/lang";
import { CHIP_IDS, storyCopy, type ChipId } from "./copy";
import { chipCss, chipWindow, easeOut } from "./math";
import { EASE_OUT, SceneBar, SceneFrame, SceneLine, SceneTitle, type SceneProgress, useSceneProgress } from "./scene";

const ICONS: Record<ChipId, LucideIcon> = {
  calendar: CalendarPlus,
  youtube: Play,
  spotify: Music,
  apps: AppWindow,
  reminders: Bell,
  photo: ScanText,
  desktop: Laptop,
};

function Chip({ i, id, label, scene }: { i: number; id: ChipId; label: string; scene: SceneProgress }) {
  const [from, to] = chipWindow(i);
  const transform = useTransform(scene.pin, (pin) => chipCss(i, easeOut((pin - from) / (to - from))));
  const opacity = useTransform(scene.pin, [from, from + (to - from) * 0.4], [0, 1]);
  return (
    <motion.li data-chip={id} className="st-chip v6-card" style={{ transform, opacity }}>
      <span aria-hidden className="st-chip-icon">
        {createElement(ICONS[id], { className: "size-5 sm:size-6" })}
      </span>
      <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
    </motion.li>
  );
}

export function SceneWork({ lang }: { lang: Lang }) {
  const scene = useSceneProgress();
  const c = storyCopy(lang);
  // The reply is there first: it arrives with the stage, before any chip does.
  const ackOpacity = useTransform(scene.enter, [0.6, 0.95], [0, 1]);
  const ackY = useTransform(scene.enter, [0.6, 1], [28, 0], { ease: EASE_OUT });
  return (
    <SceneFrame id="work" scene={scene} tall={[1.9, 2.2]}>
      <SceneBar n={5} label={c.work.label} scene={scene} />
      <div className="grid gap-x-10 gap-y-3 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] md:items-end">
        <SceneTitle id="work" rows={c.work.title} scene={scene} />
        <SceneLine scene={scene} className="md:pb-2">
          {c.work.line}
        </SceneLine>
      </div>
      <ul className="st-chips">
        <motion.li className="st-ack panel" style={{ opacity: ackOpacity, y: ackY }}>
          {/* The speaker is marked the way the app marks it: by sight with the orb's ring, by name for screen readers. */}
          <span aria-hidden className="st-ack-mark" />
          <span className="st-ack-says">
            <span className="sr-only">Aspire: </span>
            {c.work.ack}
          </span>
        </motion.li>
        {CHIP_IDS.map((id, i) => (
          <Chip key={id} i={i} id={id} label={c.work.chips[id]} scene={scene} />
        ))}
      </ul>
    </SceneFrame>
  );
}
