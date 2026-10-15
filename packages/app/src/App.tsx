import type { OversizedBlock } from "@rosetta/preview";
import { useRef, useState } from "react";
import { ChapterSidebar } from "./components/ChapterSidebar";
import { EditorPane } from "./components/EditorPane";
import { oversizedMessage, PreviewPane } from "./components/PreviewPane";
import { sampleChapters, type Chapter } from "./sample";
import { useParsed } from "./useParsed";

export function App() {
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
        <strong>Rosetta</strong>
        <span className="hint">{active.title}</span>
      </header>
      <ChapterSidebar chapters={chapters} activeId={active.id} onSelect={setActiveId} />
      <EditorPane chapterId={active.id} markdown={active.markdown} parsed={parsed} layoutWarnings={layoutWarnings} onChange={edit} />
      <PreviewPane parsed={parsed} onLayout={laidOut} />
    </div>
  );
}
