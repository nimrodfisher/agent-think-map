import { kindMeta } from "./kinds.js";

export function KindKicker({
  kind,
  short = false,
}: {
  kind: string;
  short?: boolean;
}) {
  const meta = kindMeta(kind);
  return (
    <span className="atc-kicker">
      {meta.emoji ? (
        <span className="atc-kind-emoji" aria-hidden="true">
          {meta.emoji}
        </span>
      ) : null}
      {short ? meta.short : meta.label}
    </span>
  );
}
