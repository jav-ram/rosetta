import type { OversizedBlock } from "@rosetta/preview";
import { useRef, useState } from "react";
import { ChapterSidebar } from "./components/ChapterSidebar";
import { EditorPane } from "./components/EditorPane";
import { oversizedMessage, PreviewPane } from "./components/PreviewPane";
import { sampleChapters, type Chapter } from "./sample";
import { useParsed } from "./useParsed";

interface Props {
  /** The project being worked on, shown in the top bar. */
  title?: string;
  /** Back to the list of projects. */
  onBack?: () => void;
}

/**
 * The editor for one project: chapter list, editor and preview.
 * The chapters are still the sample ones: they are not read from or saved to the project until T3.4.
 */
export function Workspace({ title, onBack }: Props) {
  const [chapters, setChapters] = useState<Chapter[]>(sampleChapters);
  const [activeId, setActiveId] = useState(sampleChapters[0]!.id);
  const active = chapters.find((c) => c.id === activeId) ?? chapters[0]!;
  const parsed = useParsed(active.markdown);

  // What the last layout found, for the chapter it was laid out for. It stays while that chapter is edited, until the next layout.
  const [layout, setLayout] = useState<{ chapterId: string; oversized: OversizedBlock[] } | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  // A layout of text that has been edited since is out of date: the next one will follow.
  const laidOut = (markdown: string, oversized: OversizedBlock[]) => {
    if (markdown === activeRef.current.markdown) setLayout({ chapterId: activeRef.current.id, oversized });
  };
  const layoutWarnings = layout?.chapterId === active.id ? layout.oversized.map((b) => ({ index: b.index, message: oversizedMessage(b) })) : [];

  const edit = (markdown: string, chapterId = active.id) => setChapters((all) => all.map((c) => (c.id === chapterId ? { ...c, markdown } : c)));

  return (
    <div className="shell">
      <header className="topbar">
        {onBack && (
          <button type="button" className="link" onClick={onBack}>
            ← Projects
          </button>
        )}
        <strong>Rosetta</strong>
        <span className="hint">{title ? `${title} · ${active.title}` : active.title}</span>
        {title && <span className="hint">Chapters shown are a sample: they are not saved to the project yet.</span>}
      </header>
      <ChapterSidebar chapters={chapters} activeId={active.id} onSelect={setActiveId} />
      <EditorPane chapterId={active.id} markdown={active.markdown} parsed={parsed} layoutWarnings={layoutWarnings} onChange={edit} />
      <PreviewPane parsed={parsed} onLayout={laidOut} />
    </div>
  );
}
