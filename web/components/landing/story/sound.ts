"use client";

// The recorded clips of the story (public/landing/audio): the example question and its answer,
// spoken in each of the five languages. One clip sounds at a time on the whole page.
//
// Sound only ever starts from a press. A clip that is missing, cannot be decoded or is refused by
// the browser is simply silence: the caller is told once (`onEnd`, with `false`), nothing is
// thrown and nothing is logged by this file, and whatever the clip was accompanying carries on.

import { useEffect, useState } from "react";
import { LANGS, type Lang } from "@/lib/lang";

export type ClipKind = "question" | "answer";

/** Where a clip lives. An unknown language gets the English one: the file name never takes outside text. */
export function clipSrc(kind: ClipKind, lang: Lang): string {
  return `/landing/audio/${kind}-${(LANGS as readonly string[]).includes(lang) ? lang : "en"}.mp3`;
}

/** Called once per clip: true when it played to its end, false when it was stopped or never sounded. */
type OnEnd = (heard: boolean) => void;

export interface ClipHandle {
  /** Lets a clip that was only readied start sounding. Does nothing once the clip is over. */
  start: () => void;
  /** The clip's length in seconds once the browser knows it, else null. */
  seconds: () => number | null;
}

interface Playing {
  audio: HTMLAudioElement;
  over: boolean;
  onEnd?: OnEnd;
}

/** Whoever has a clip open, anywhere on the page: opening another one stops it first. */
let holder: (() => void) | null = null;

/**
 * One scene's clips. Plain closures, made once per scene: `onSounding` is told which clip can be
 * heard (its address) and when there is silence again (null). Exported for its tests; a scene
 * uses it through useClip.
 */
export function createPlayer(onSounding: (src: string | null) => void) {
  let playing: Playing | null = null;

  const close = (clip: Playing, heard: boolean) => {
    if (clip.over) return;
    clip.over = true;
    try {
      clip.audio.pause();
    } catch {
      /* an element that never loaded has nothing to pause */
    }
    if (playing === clip) {
      playing = null;
      onSounding(null);
    }
    clip.onEnd?.(heard);
  };

  const stop = () => {
    if (playing) close(playing, false);
  };

  /**
   * Opens a clip from inside a press. `wait` readies it without sound (a muted start, which is
   * what lets the browser sound it a moment later without a second press) and returns a handle
   * whose `start` makes it audible; without `wait` it sounds at once.
   */
  const open = (src: string, onEnd: OnEnd | undefined, wait: boolean): ClipHandle => {
    if (holder && holder !== stop) holder();
    stop();
    if (typeof Audio === "undefined") {
      onEnd?.(false);
      return { start: () => {}, seconds: () => null };
    }
    const audio = new Audio();
    const clip: Playing = { audio, over: false, onEnd };
    playing = clip;
    holder = stop;
    audio.addEventListener("ended", () => close(clip, true));
    audio.addEventListener("error", () => close(clip, false));
    audio.preload = "auto";
    audio.muted = wait;
    audio.src = src;
    const refused = () => close(clip, false);
    const sound = () => {
      if (clip.over) return;
      onSounding(src);
      try {
        const p = audio.play();
        if (p && typeof p.catch === "function") p.catch(refused);
      } catch {
        refused();
      }
    };
    let ready: Promise<unknown> = Promise.resolve();
    if (wait) {
      try {
        const p = audio.play();
        if (p && typeof p.then === "function")
          ready = p.then(
            () => audio.pause(),
            () => {},
          );
      } catch {
        /* readied or not, start() will find out */
      }
    } else {
      sound();
    }
    return {
      start: () => {
        // A clip opened without `wait` is sounding already.
        if (!wait) return;
        void ready.then(() => {
          if (clip.over) return;
          audio.muted = false;
          try {
            audio.currentTime = 0;
          } catch {
            /* not seekable yet: it starts from the beginning anyway */
          }
          sound();
        });
      },
      seconds: () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null),
    };
  };

  return {
    /** Plays a clip now. For a press handler. */
    play: (src: string, onEnd?: OnEnd) => open(src, onEnd, false),
    /** Readies a clip now, to be started a moment later. For a press handler. */
    ready: (src: string, onEnd?: OnEnd) => open(src, onEnd, true),
    /** Stops the clip that is open here, if any. */
    stop,
    /** Whether a clip opened here can be heard right now (open, unmuted and running). */
    heard: () => !!playing && !playing.over && !playing.audio.muted && !playing.audio.paused,
    /** The scene is going away: silence, and the floor is free. */
    dispose: () => {
      stop();
      if (holder === stop) holder = null;
    },
  };
}

export function useClip() {
  /** The clip that is sounding now, by its address; null when there is silence. */
  const [sounding, setSounding] = useState<string | null>(null);
  const [player] = useState(() => createPlayer(setSounding));
  // A scene that goes away takes its sound with it.
  useEffect(() => player.dispose, [player]);
  return { sounding, heard: player.heard, play: player.play, ready: player.ready, stop: player.stop };
}
