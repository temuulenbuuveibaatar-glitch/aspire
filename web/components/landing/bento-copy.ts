// The one string the bento grid needs that the story's copy (story/copy.ts) does not have, in the
// 5 app languages. Plain data, no JSX. No emojis and no em or en dashes (tests/landing-bento.test.ts).
//
// The photo tile shows the example sign of the story's copy (index.sign, written in another
// language than the page) and what it means. The story's own sentence for that ("It says:
// pharmacy.") repeats a word of the tile's line in English and in Russian, and no word may show
// twice on one screen, so the tile shows the meaning alone.
import type { Lang } from "@/lib/lang";

export interface BentoCopy {
  /** What the example sign says, in the page's language. */
  meaning: string;
}

export const BENTO_COPY: Record<Lang, BentoCopy> = {
  en: { meaning: "Pharmacy" },
  mn: { meaning: "Эмийн сан" },
  zh: { meaning: "药店" },
  ru: { meaning: "Аптека" },
  de: { meaning: "Apotheke" },
};

/** The grid's strings for a language; English when the language is not one of the five. */
export const bentoCopy = (lang: Lang): BentoCopy => BENTO_COPY[lang] ?? BENTO_COPY.en;
