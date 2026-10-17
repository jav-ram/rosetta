import type { Chapter } from "@rosetta/contracts";
import { useState, type FormEvent } from "react";
import { pageLabel, type PageInfo } from "../pageNumbers";

interface Props {
  chapters: Chapter[];
  /** For each chapter, in the same order: its page numbers, and whether they may be out of date. */
  pages?: PageInfo[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd?: () => void;
  onRename?: (id: string, title: string) => void;
  onDelete?: (id: string) => void;
  /** Turns "start on a right-hand page" on or off for a chapter. */
  onStart?: (id: string, start: NonNullable<Chapter["start"]>) => void;
  /** Moves a chapter to a position (0 is first), counted in the list as it is now. */
  onMove?: (id: string, index: number) => void;
}

/** The chapters of the project: open one, add, rename, delete, and reorder (drag a chapter, or use the arrows). */
export function ChapterSidebar({ chapters, pages, activeId, onSelect, onAdd, onRename, onDelete, onStart, onMove }: Props) {
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const rename = (e: FormEvent) => {
    e.preventDefault();
    if (renaming && renaming.value.trim()) onRename?.(renaming.id, renaming.value);
    setRenaming(null);
  };

  return (
    <nav className="sidebar" aria-label="Chapters">
      <div className="sidebar-head">
        <h2>Chapters</h2>
        {onAdd && (
          <button type="button" className="chapter-add" onClick={onAdd} aria-label="Add chapter" title="Add chapter">
            +
          </button>
        )}
      </div>
      {chapters.length === 0 && <p className="hint">No chapters yet.</p>}
      <ol>
        {chapters.map((c, i) => (
          <li
            key={c.id}
            className={over === c.id && dragging !== c.id ? "drop-target" : undefined}
            draggable={!!onMove && renaming?.id !== c.id}
            onDragStart={(e) => {
              setDragging(c.id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", c.id);
            }}
            onDragOver={(e) => {
              if (!dragging) return;
              e.preventDefault();
              setOver(c.id);
            }}
            onDragLeave={() => setOver((o) => (o === c.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging && dragging !== c.id) onMove?.(dragging, i);
              setDragging(null);
              setOver(null);
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
          >
            {renaming?.id === c.id ? (
              <form className="chapter-rename" onSubmit={rename}>
                <input
                  type="text"
                  value={renaming.value}
                  onChange={(e) => setRenaming({ id: c.id, value: e.target.value })}
                  onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                  onBlur={rename}
                  onFocus={(e) => e.target.select()}
                  aria-label={`New title for ${c.title}`}
                  autoFocus
                />
              </form>
            ) : deleting === c.id ? (
              <div className="chapter-confirm" role="group" aria-label={`Delete ${c.title}`}>
                <span>Delete “{c.title}” and its text?</span>
                <button type="button" className="danger" onClick={() => (onDelete?.(c.id), setDeleting(null))}>
                  Delete
                </button>
                <button type="button" onClick={() => setDeleting(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <button type="button" className="chapter-open" aria-current={c.id === activeId ? "true" : undefined} onClick={() => onSelect(c.id)}>
                  {c.title}
                </button>
                {pages?.[i] && (
                  <span
                    className="chapter-pages"
                    data-stale={pages[i]!.stale ? "true" : undefined}
                    title={pages[i]!.stale ? "Page numbers may be out of date: this chapter or one before it changed, or has not been laid out yet. Open the chapters before it to update them." : undefined}
                  >
                    {pages[i]!.stale && "⚠ "}
                    {pageLabel(pages[i]!)}
                  </span>
                )}
                {c.start === "right-page" && (
                  <span className="chapter-badge" title="Starts on a right-hand page" aria-label="Starts on a right-hand page">
                    R
                  </span>
                )}
                {(onRename || onDelete || onMove || onStart) && (
                  <span className="chapter-actions">
                    {onStart && (
                      <button
                        type="button"
                        aria-label={`Start ${c.title} on a right-hand page`}
                        aria-pressed={c.start === "right-page"}
                        title="Start on a right-hand page"
                        onClick={() => onStart(c.id, c.start === "right-page" ? "next-page" : "right-page")}
                      >
                        R
                      </button>
                    )}
                    {onMove && (
                      <>
                        <button type="button" aria-label={`Move ${c.title} up`} title="Move up" disabled={i === 0} onClick={() => onMove(c.id, i - 1)}>
                          ↑
                        </button>
                        <button type="button" aria-label={`Move ${c.title} down`} title="Move down" disabled={i === chapters.length - 1} onClick={() => onMove(c.id, i + 1)}>
                          ↓
                        </button>
                      </>
                    )}
                    {onRename && (
                      <button type="button" aria-label={`Rename ${c.title}`} title="Rename" onClick={() => setRenaming({ id: c.id, value: c.title })}>
                        ✎
                      </button>
                    )}
                    {onDelete && (
                      <button type="button" aria-label={`Delete ${c.title}`} title="Delete" onClick={() => setDeleting(c.id)}>
                        ×
                      </button>
                    )}
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
