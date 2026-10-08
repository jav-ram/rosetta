import type { Chapter } from "../sample";

interface Props {
  chapters: Chapter[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function ChapterSidebar({ chapters, activeId, onSelect }: Props) {
  return (
    <nav className="sidebar" aria-label="Chapters">
      <h2>Chapters</h2>
      <ol>
        {chapters.map((c) => (
          <li key={c.id}>
            <button type="button" aria-current={c.id === activeId ? "true" : undefined} onClick={() => onSelect(c.id)}>
              {c.title}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
