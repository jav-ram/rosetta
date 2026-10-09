import { useState } from "react";
import { ChapterSidebar } from "./components/ChapterSidebar";
import { EditorPane } from "./components/EditorPane";
import { PreviewPane } from "./components/PreviewPane";
import { sampleChapters, type Chapter } from "./sample";
import { useParsed } from "./useParsed";

export function App() {
  const [chapters, setChapters] = useState<Chapter[]>(sampleChapters);
  const [activeId, setActiveId] = useState(sampleChapters[0]!.id);
  const active = chapters.find((c) => c.id === activeId) ?? chapters[0]!;
  const parsed = useParsed(active.markdown);

  const edit = (markdown: string) => setChapters((all) => all.map((c) => (c.id === active.id ? { ...c, markdown } : c)));

  return (
    <div className="shell">
      <header className="topbar">
        <strong>Rosetta</strong>
        <span className="hint">{active.title}</span>
      </header>
      <ChapterSidebar chapters={chapters} activeId={active.id} onSelect={setActiveId} />
      <EditorPane markdown={active.markdown} parsed={parsed} onChange={edit} />
      <PreviewPane parsed={parsed} />
    </div>
  );
}
