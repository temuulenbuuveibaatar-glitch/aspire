// The small label on everything in the story that is not a live reading ("Example").
// Dashed, like the app's estimated minutes (story.css .st-tag).
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("st-tag", className)}>{children}</span>;
}
