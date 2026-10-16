import type { Chapter } from "@rosetta/contracts";
import { useState, type FormEvent } from "react";

interface Props {
  chapters: Chapter[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd?: () => void;
  onRename?: (id: string, title: string) => void;
  onDelete?: (id: string) => void;
  /** Moves a chapter to a position (0 is first), counted in the list as it is now. */
  onMove?: (id: string, index: number) => void;
}

/** The chapters of the project: open one, add, rename, delete, and reorder (drag a chapter, or use the arrows). */
export function ChapterSidebar({ chapters, activeId, onSelect, onAdd, onRename, onDelete, onMove }: Props) {
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
                {(onRename || onDelete || onMove) && (
                  <span className="chapter-actions">
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
