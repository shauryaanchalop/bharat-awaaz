import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export function BackButton({
  to = "/",
  label = "Back",
  className = "",
}: {
  to?: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur transition hover:bg-accent hover:text-accent-foreground " +
        className
      }
      aria-label={label}
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}
