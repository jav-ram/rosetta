import type { Chapter, ProjectStore, ProjectSummary } from "@rosetta/contracts";
import type { OversizedBlock } from "@rosetta/preview";
import { useEffect, useReducer, useRef, useState } from "react";
import { ChapterSidebar } from "./components/ChapterSidebar";
import { EditorPane } from "./components/EditorPane";
import { oversizedMessage, PreviewPane } from "./components/PreviewPane";
import { ProjectSession, type SaveStatus } from "./project";
import { useParsed } from "./useParsed";

interface Props {
  store: ProjectStore;
  project: ProjectSummary;
  /** Back to the list of projects. */
  onBack?: () => void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The editor for one project: it opens the project, and shows the chapter list, editor and preview once it is open. */
export function Workspace({ store, project, onBack }: Props) {
  const [session, setSession] = useState<ProjectSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let opened: ProjectSession | null = null;
    ProjectSession.open(store, project.id).then(
      (s) => {
        if (cancelled) return void s.flush();
        opened = s;
        setSession(s);
      },
      (e: unknown) => !cancelled && setError(message(e)),
    );
    // Leaving the project writes what is waiting. A late edit from the editor closing is still saved (it has its own timer).
    return () => {
      cancelled = true;
      void opened?.flush();
    };
  }, [store, project.id]);

  if (error) {
    return (
      <main className="projects">
        <button type="button" className="link" onClick={onBack}>
          ← Projects
        </button>
        <p role="alert" className="projects-error">
          This project cannot be opened: {error}
        </p>
      </main>
    );
  }
  if (!session) return <main className="projects"><p className="hint">Opening {project.title}…</p></main>;
  return <ProjectEditor session={session} title={project.title} onBack={onBack} />;
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  return (
    <span className="save-status" role="status" aria-live="polite" data-state={status.state}>
      {status.state === "saved" && "✓ Saved"}
      {status.state === "saving" && "Saving…"}
      {status.state === "error" && (
        <>
          ⚠ Not saved: {status.message}{" "}
          <button type="button" className="link" onClick={onRetry}>
            Retry
          </button>
        </>
      )}
    </span>
  );
}

function ProjectEditor({ session, title, onBack }: { session: ProjectSession; title: string; onBack?: () => void }) {
  const [, update] = useReducer((n: number) => n + 1, 0);
  useEffect(() => session.subscribe(update), [session]);
  const chapters = session.manifest.chapters;

  // The chapter being edited and its text. It changes only when the next chapter's text has arrived, so the editor never
  // shows a chapter with the wrong text, and text that is waiting to be saved is never replaced by an older copy.
  const [active, setActive] = useState<{ id: string; markdown: string } | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const wanted = useRef<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const open = async (id: string) => {
    wanted.current = id;
    if (activeRef.current?.id === id) return;
    try {
      const markdown = await session.chapterText(id);
      if (wanted.current === id) setActive({ id, markdown }); // not if another chapter was asked for meanwhile
    } catch (e) {
      setProblem(`Could not open the chapter: ${message(e)}`);
    }
  };

  useEffect(() => {
    if (chapters[0]) void open(chapters[0].id);
    // Only the first chapter of the project, once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Not losing anything when the page closes or is hidden: write what is waiting.
  useEffect(() => {
    const leaving = (e: BeforeUnloadEvent) => {
      if (session.hasUnsaved) e.preventDefault();
    };
    const hidden = () => document.hidden && void session.flush();
    window.addEventListener("beforeunload", leaving);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("beforeunload", leaving);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [session]);

  const parsed = useParsed(active?.markdown ?? "");

  // What the last layout found, for the chapter it was laid out for. It stays while that chapter is edited, until the next layout.
  const [layout, setLayout] = useState<{ chapterId: string; oversized: OversizedBlock[] } | null>(null);
  // A layout of text that has been edited since is out of date: the next one will follow.
  const laidOut = (markdown: string, oversized: OversizedBlock[]) => {
    const now = activeRef.current;
    if (now && markdown === now.markdown) setLayout({ chapterId: now.id, oversized });
  };
  const layoutWarnings = active && layout?.chapterId === active.id ? layout.oversized.map((b) => ({ index: b.index, message: oversizedMessage(b) })) : [];

  /** The editor gives the new text and the chapter it belongs to (the chapter can change while a save is pending). */
  const edit = (markdown: string, chapterId = activeRef.current?.id) => {
    if (!chapterId) return;
    session.edit(chapterId, markdown);
    setActive((a) => (a && a.id === chapterId ? { ...a, markdown } : a));
  };

  const add = () => {
    const chapter = session.addChapter(`Chapter ${chapters.length + 1}`);
    void open(chapter.id);
  };

  const remove = (id: string) => {
    const index = chapters.findIndex((c) => c.id === id);
    const next: Chapter | undefined = chapters[index + 1] ?? chapters[index - 1];
    session.deleteChapter(id);
    if (activeRef.current?.id !== id) return;
    if (next) void open(next.id);
    else {
      wanted.current = null;
      setActive(null);
    }
  };

  return (
    <div className="shell">
      <header className="topbar">
        {onBack && (
          <button type="button" className="link" onClick={onBack}>
            ← Projects
          </button>
        )}
        <strong>Rosetta</strong>
        <span className="hint">{[title, chapters.find((c) => c.id === active?.id)?.title].filter(Boolean).join(" · ")}</span>
        <SaveIndicator status={session.status} onRetry={() => void session.retry()} />
      </header>
      <ChapterSidebar
        chapters={chapters}
        activeId={active?.id ?? null}
        onSelect={(id) => void open(id)}
        onAdd={add}
        onRename={(id, t) => session.renameChapter(id, t)}
        onDelete={remove}
        onMove={(id, index) => session.moveChapter(id, index)}
      />
      {active ? (
        <>
          <EditorPane chapterId={active.id} markdown={active.markdown} parsed={parsed} layoutWarnings={layoutWarnings} onChange={edit} />
          <PreviewPane parsed={parsed} onLayout={laidOut} />
        </>
      ) : (
        <section className="pane editor empty-project" aria-label="Editor">
          <p className="hint">{problem ?? (chapters.length ? "Opening the chapter…" : "This project has no chapters. Add one with + in the chapter list.")}</p>
        </section>
      )}
    </div>
  );
}
