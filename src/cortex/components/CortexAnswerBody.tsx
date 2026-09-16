/**
 * Renders a Cortex investigation answer as a document, not a chat blob.
 *
 * WHAT WAS WRONG
 * --------------
 * The answer was rendered with `{msg.content}` inside a `<div>`, so every
 * `**Evidence:**` the model wrote appeared as literal asterisks and every
 * "- " bullet ran into the previous sentence. A four-section answer arrived as
 * one grey paragraph, which is why it read as a text dump however carefully it
 * was written.
 *
 * DELIBERATELY NOT A MARKDOWN LIBRARY
 * -----------------------------------
 * Cortex answers use a known, small subset — a lead sentence, `**Label:**`
 * sections, `-` bullets, and inline `**bold**` / `` `code` ``. A full markdown
 * renderer would also render images, links and raw HTML from text that includes
 * network-sourced strings, which is a larger attack surface for no benefit. So
 * this parses the subset and renders nothing else: any `<`, `>` or `&` reaches
 * the DOM as React text, never as markup.
 *
 * The first paragraph is the verdict and is typeset as such — it is the whole
 * answer for most readers.
 */
import React from 'react';
import { cn } from '@/components/ui/utils';

/** Inline `**bold**` and `` `code` ``. Text only — no links, no HTML. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(
        <strong key={`${keyPrefix}-b${i}`} className="font-semibold text-white">
          {m[1]}
        </strong>
      );
    } else if (m[2] !== undefined) {
      out.push(
        <code
          key={`${keyPrefix}-c${i}`}
          className="rounded bg-white/10 px-1 py-0.5 text-[11px] font-mono text-white/90"
        >
          {m[2]}
        </code>
      );
    }
    last = re.lastIndex;
    i += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: 'lead'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'bullets'; items: string[] };

/**
 * Split the answer into blocks.
 *
 * The model writes sections as `**Evidence:**`, `**Cause and confidence:**`,
 * `**What to do:**` — sometimes on their own line, sometimes leading a
 * paragraph. Both are handled, because prompt output is not a wire format and
 * treating it as one produced blank sections.
 */
export function parseAnswer(raw: string): Block[] {
  const text = String(raw ?? '').trim();
  if (!text) return [];

  // Normalise " - " bullets that the model sometimes writes inline after a
  // section label, which is what collapsed the evidence list into a paragraph.
  const normalised = text.replace(/\s+-\s+(?=[A-Z(`])/g, '\n- ');

  const blocks: Block[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push({ kind: 'bullets', items: bullets });
      bullets = [];
    }
  };

  const lines = normalised.split('\n');
  let seenLead = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }

    if (/^[-*•]\s+/.test(line)) {
      bullets.push(line.replace(/^[-*•]\s+/, ''));
      continue;
    }
    flush();

    // A whole-line section label: **Evidence:** or **Evidence**
    const headingOnly = line.match(/^\*\*(.+?):?\*\*:?$/);
    if (headingOnly) {
      blocks.push({ kind: 'heading', text: headingOnly[1].replace(/:$/, '') });
      continue;
    }

    // A label that leads a paragraph: **Evidence:** the AP is …
    const inlineHeading = line.match(/^\*\*(.+?):\*\*\s*(.+)$/);
    if (inlineHeading) {
      blocks.push({ kind: 'heading', text: inlineHeading[1] });
      blocks.push({ kind: 'para', text: inlineHeading[2] });
      continue;
    }

    if (!seenLead) {
      // The verdict. Strip a wrapping bold so it is not double-emphasised.
      blocks.push({ kind: 'lead', text: line.replace(/^\*\*(.+?)\*\*$/, '$1') });
      seenLead = true;
      continue;
    }
    blocks.push({ kind: 'para', text: line });
  }
  flush();
  return blocks;
}

export const CortexAnswerBody: React.FC<{ text: string }> = ({ text }) => {
  const blocks = React.useMemo(() => parseAnswer(text), [text]);
  if (!blocks.length) return null;

  return (
    <div className="space-y-2.5">
      {blocks.map((b, i) => {
        if (b.kind === 'lead') {
          return (
            <p key={i} className="text-[15px] leading-snug font-medium text-white">
              {renderInline(b.text, `l${i}`)}
            </p>
          );
        }
        if (b.kind === 'heading') {
          return (
            <p
              key={i}
              className="text-[10px] uppercase tracking-wider font-semibold text-white/40 pt-1"
            >
              {b.text}
            </p>
          );
        }
        if (b.kind === 'bullets') {
          return (
            <ul key={i} className="space-y-1">
              {b.items.map((item, j) => (
                <li key={j} className="flex gap-2 text-[13px] leading-relaxed text-white/75">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-violet-400/70" />
                  <span>{renderInline(item, `u${i}-${j}`)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className={cn('text-[13px] leading-relaxed text-white/75')}>
            {renderInline(b.text, `p${i}`)}
          </p>
        );
      })}
    </div>
  );
};
