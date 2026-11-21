"use client";

// Scene 005, It does the work: the app's own reply to a task ("On it, sir.", lib/brain/shared.ts
// ON_IT) and the seven jobs it takes on, as a grid of hairline boxes that arrive one after another
// while the stage is pinned. Every box names a tool the agent really has (copy.ts CHIP_IDS).
//
// Pressing a box, or resting a mouse on it, writes one line at the foot of the stage: what one
// might say to start that job ("> open spotify"). It is an example and is marked as one; nothing
// is opened, sent or started from this page. At rest the grid and the first line are simply there.
// A screen reader is told the line once, by a status of its own.

import { AppWindow, Bell, CalendarPlus, Laptop, Music, Play, ScanText, type LucideIcon } from "lucide-react";
import { motion, useTransform } from "motion/react";
import { createElement, useContext, useState, type PointerEvent } from "react";
import type { Lang } from "@/lib/lang";
import { CHIP_IDS, storyCopy, type ChipId } from "./copy";
import { Decode } from "./Decode";
import { chipCss, chipWindow, easeOut } from "./math";
import { ModeContext } from "./mode";
import { EASE_OUT, SceneBar, SceneFrame, SceneLine, SceneTitle, type SceneProgress, useSceneProgress } from "./scene";
import { Tag } from "./Tag";

const ICONS: Record<ChipId, LucideIcon> = {
  calendar: CalendarPlus,
  youtube: Play,
  spotify: Music,
  apps: AppWindow,
  reminders: Bell,
  photo: ScanText,
  desktop: Laptop,
};

interface ChipProps {
  i: number;
  id: ChipId;
  label: string;
  scene: SceneProgress;
  picked: boolean;
  /** Absent where no script runs: the box is then a plain box, not a button that does nothing. */
  onPick?: (id: ChipId) => void;
}

function Chip({ i, id, label, scene, picked, onPick }: ChipProps) {
  const [from, to] = chipWindow(i);
  const transform = useTransform(scene.pin, (pin) => chipCss(easeOut((pin - from) / (to - from))));
  const opacity = useTransform(scene.pin, [from, from + (to - from) * 0.6], [0, 1]);
  const inside = (
    <>
      <span aria-hidden className="st-chip-icon">
        {createElement(ICONS[id], { className: "size-5" })}
      </span>
      <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
    </>
  );
  // A mouse resting on a box picks it too; a finger or a pen has to press.
  const hover = onPick && ((e: PointerEvent) => e.pointerType === "mouse" && onPick(id));
  return (
    <motion.li data-chip={id} className="st-chip-cell" style={{ transform, opacity }}>
      {onPick ? (
        <button type="button" className="st-chip st-box press" data-on={picked || undefined} onClick={() => onPick(id)} onPointerEnter={hover || undefined}>
          {inside}
        </button>
      ) : (
        <div className="st-chip st-box" data-on={picked || undefined}>
          {inside}
        </div>
      )}
    </motion.li>
  );
}

export function SceneWork({ lang }: { lang: Lang }) {
  const mode = useContext(ModeContext);
  const scene = useSceneProgress();
  const c = storyCopy(lang);
  // The line at the foot starts on the first job, so it is in the page before any press. It is
  // only written out letter by letter once a box has been picked: `typed` counts those picks.
  const [picked, setPicked] = useState<ChipId>(CHIP_IDS[0]);
  const [typed, setTyped] = useState(0);
  const pick = (id: ChipId) => {
    if (id === picked) return;
    setPicked(id);
    setTyped((n) => n + 1);
  };
  // The reply is there first: it arrives with the stage, before any box does.
  const ackOpacity = useTransform(scene.enter, [0.6, 0.95], [0, 1]);
  const ackY = useTransform(scene.enter, [0.6, 1], [28, 0], { ease: EASE_OUT });
  return (
    <SceneFrame id="work" scene={scene} tall={[1.9, 2.2]}>
      <SceneBar n={5} label={c.work.label} scene={scene} />
      <div className="st-head">
        <SceneTitle id="work" rows={c.work.title} scene={scene} />
        <SceneLine scene={scene}>{c.work.line}</SceneLine>
      </div>
      <div className="st-fill st-work">
        <ul className="st-chips">
          <motion.li className="st-chip-cell" style={{ opacity: ackOpacity, y: ackY }}>
            <div className="st-ack st-box">
              {/* The speaker is marked the way the app marks it: by sight with the orb's ring, by name for screen readers. */}
              <span aria-hidden className="st-ack-mark" />
              <span className="st-ack-says">
                <span className="sr-only">Aspire: </span>
                {c.work.ack}
              </span>
            </div>
          </motion.li>
          {CHIP_IDS.map((id, i) => (
            <Chip key={id} i={i} id={id} label={c.work.chips[id]} scene={scene} picked={mode.ready && picked === id} onPick={mode.ready ? pick : undefined} />
          ))}
        </ul>
        <p className="st-run">
          <Tag>{c.example}</Tag>{" "}
          <span className="st-run-line readout">
            <span aria-hidden className="st-run-mark">
              {">"}
            </span>{" "}
            <Decode key={typed} as="type" text={c.work.runs[picked]} play={typed > 0} />
          </span>
          {/* A press is answered in words for people who do not see the line typed. Empty until
              the first press, and apart from the line itself, so it is said once and whole: the
              line above changes many times while it is being written. */}
          <span className="sr-only" role="status">
            {typed > 0 ? `${c.example}: ${c.work.runs[picked]}` : ""}
          </span>
        </p>
      </div>
    </SceneFrame>
  );
}
