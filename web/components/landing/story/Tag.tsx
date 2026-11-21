// The small label on everything in the story that is not a live reading ("Example"): a mono tag
// in a dashed box, the way the app marks its estimated minutes (story.css .st-tag).
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("st-tag", className)}>{children}</span>;
}
