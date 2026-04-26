import { LinkOutlined } from "@ant-design/icons";
import { useMemo } from "react";

/** Match http(s) and file:// URLs; trim trailing punctuation from matches. */
const URL_RE = /https?:\/\/[^\s<>\[\]()（）【】"'，。]+|file:\/\/[^\s<>\[\]()（）【】"'，。]+/gi;

function trimTrailingPunct(url: string): string {
  return url.replace(/[),.;!?}\]）】"'」』]+$/u, "");
}

function safeHref(raw: string): string | null {
  const u = trimTrailingPunct(raw.trim());
  if (/^https?:\/\//i.test(u)) {
    return u;
  }
  if (/^file:\/\//i.test(u)) {
    return u;
  }
  return null;
}

export function splitLinkSegments(text: string): Array<{ key: string; node: "text" | "url"; value: string; href?: string }> {
  const out: Array<{ key: string; node: "text" | "url"; value: string; href?: string }> = [];
  let lastIndex = 0;
  let mi = 0;
  URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_RE.exec(text)) !== null) {
    const start = match.index;
    const raw = match[0];
    if (start > lastIndex) {
      out.push({ key: `t-${lastIndex}`, node: "text", value: text.slice(lastIndex, start) });
    }
    const href = safeHref(raw);
    if (href) {
      out.push({ key: `u-${mi}`, node: "url", value: trimTrailingPunct(raw), href });
      mi += 1;
    } else {
      out.push({ key: `t-${start}`, node: "text", value: raw });
    }
    lastIndex = start + raw.length;
  }
  if (lastIndex < text.length) {
    out.push({ key: `t-${lastIndex}`, node: "text", value: text.slice(lastIndex) });
  }
  return out;
}

interface LinkifiedTextProps {
  text: string;
  className?: string;
}

export function LinkifiedText({ text, className }: LinkifiedTextProps) {
  const segments = useMemo(() => splitLinkSegments(text), [text]);
  return (
    <span className={className}>
      {segments.map((seg) =>
        seg.node === "url" && seg.href ? (
          <a
            key={seg.key}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inspector-resource-inline-link"
            title={seg.href}
            aria-label={`打开链接: ${seg.href}`}
          >
            <LinkOutlined className="inspector-resource-inline-link__icon" aria-hidden />
            <span>链接</span>
          </a>
        ) : (
          <span key={seg.key} className="inspector-resource-text-chunk">
            {seg.value}
          </span>
        )
      )}
    </span>
  );
}

export function resourceDisplayText(resource: { url: string; description: string }): string {
  const primary = resource.description?.trim() || "";
  const u = resource.url?.trim() ?? "";
  if (u && u !== "#" && !primary.includes(u)) {
    return primary ? `${primary}\n${u}` : u;
  }
  return primary;
}
