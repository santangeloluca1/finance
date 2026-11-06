import { Fragment, type ReactNode } from "react";

/** Testo del consulente: paragrafi, elenchi con "- " o "1." e **grassetto**. Niente HTML. */
export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list;
    blocks.push(
      L.ordered ? (
        <ol key={blocks.length} className="ml-5 list-decimal space-y-1">
          {L.items.map((t, i) => (
            <li key={i}>{inline(t)}</li>
          ))}
        </ol>
      ) : (
        <ul key={blocks.length} className="ml-5 list-disc space-y-1 marker:text-faint">
          {L.items.map((t, i) => (
            <li key={i}>{inline(t)}</li>
          ))}
        </ul>
      ),
    );
    list = null;
  };
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const num = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || num) {
      const ordered = !!num;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? num)![1]);
      continue;
    }
    flush();
    if (!line) continue;
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push(
      heading ? (
        <p key={blocks.length} className="pt-1 font-semibold text-ink">
          {inline(heading[1])}
        </p>
      ) : (
        <p key={blocks.length}>{inline(line)}</p>
      ),
    );
  }
  flush();
  return <div className={`space-y-2.5 ${className}`}>{blocks}</div>;
}

function inline(s: string): ReactNode {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
