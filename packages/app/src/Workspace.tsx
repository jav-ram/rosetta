import type { AssetRef, Chapter, ProjectStore, ProjectSummary } from "@rosetta/contracts";
import type { OversizedBlock, PlacedImage, UnpairedSpread } from "@rosetta/preview";
import { useResolutionWarnings } from "./images/useResolutionWarnings";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ChapterSidebar } from "./components/ChapterSidebar";
import { EditorPane } from "./components/EditorPane";
import { oversizedMessage, PreviewPane, spreadMessage } from "./components/PreviewPane";
import { backupReminders, type BackupReminders } from "./backupReminder";
import { BackupBanner } from "./components/BackupBanner";
import { ImagePanel } from "./components/ImagePanel";
import type { MakePreview } from "./images/previewMaker";
import { useImages } from "./useImages";
import { imageSources } from "@rosetta/preview";
import { imageResolver, referenceFor } from "./images/resolveImage";
import { pageInfo } from "./pageNumbers";
import { saveProjectFile } from "./projectFile";
import { ProjectSession, type SaveStatus } from "./project";
import { useParsed } from "./useParsed";

interface Props {
  store: ProjectStore;
  project: ProjectSummary;
  /** Back to the list of projects. */
  onBack?: () => void;
  /** Saves the project as a file. The real one by default; tests give another. */
  saveFile?: typeof saveProjectFile;
  /** Where changes and backups are noted, for the backup reminder. */
  reminders?: BackupReminders;
  /** Makes the smaller copies of added images. The real one (a worker) by default; tests give another. */
  makePreview?: MakePreview;
}

const NO_IMAGES: PlacedImage[] = [];
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The editor for one project: it opens the project, and shows the chapter list, editor and preview once it is open. */
export function Workspace({ store, project, onBack, saveFile, reminders = backupReminders, makePreview }: Props) {
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
  return <ProjectEditor session={session} store={store} project={project} onBack={onBack} saveFile={saveFile ?? saveProjectFile} reminders={reminders} makePreview={makePreview} />;
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

function ProjectEditor({ session, store, project, onBack, saveFile, reminders, makePreview }: { session: ProjectSession; store: ProjectStore; project: ProjectSummary; onBack?: () => void; saveFile: typeof saveProjectFile; reminders: BackupReminders; makePreview?: MakePreview }) {
  const title = project.title;
  const [exporting, setExporting] = useState<"idle" | "working" | "done" | string>("idle");
  /** Writes what is waiting to the store, then saves a copy as a file: the file is what is on screen. */
  const exportFile = async () => {
    setExporting("working");
    try {
      await session.flush();
      if (session.status.state === "error") throw new Error("The project could not be saved first");
      const outcome = await saveFile(store, project);
      if (outcome === "saved") reminders.noteBackup(project.id);
      setExporting(outcome === "saved" ? "done" : "idle");
    } catch (e) {
      setExporting(`error:${message(e)}`);
    }
  };
  const [, update] = useReducer((n: number) => n + 1, 0);
  useEffect(() => session.subscribe(update), [session]);
  // The backup reminder counts from the first change that is in no backup.
  useEffect(() => {
    reminders.noteOpened(project.id);
    return session.onWritten(() => {
      reminders.noteChange(project.id);
      update();
    });
  }, [session, reminders, project.id]);
  const images = useImages(store, project.id, () => reminders.noteChange(project.id), makePreview);
  // Files dragged over the window are dropped to add images. Dragging a chapter in the list is not that: it carries no files.
  const [droppable, setDroppable] = useState(false);
  const hasFiles = (e: React.DragEvent) => !!e.dataTransfer?.types?.includes("Files");
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
  // The project's images, found by the name or id a chapter gives. The pages and the editor draw again when one the chapter shows becomes available.
  const resolveImage = imageResolver(images.assets, images.thumbnails);
  const imagesKey = useMemo(
    () => (parsed.state === "ready" ? imageSources(parsed.html) : []).map((src) => resolveImage(src)).join("\n"),
    // `resolveImage` is made from these two
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parsed, images.assets, images.version],
  );

  // What the last layout found, for the chapter it was laid out for. It stays while that chapter is edited, until the next layout.
  const [layout, setLayout] = useState<{ chapterId: string; oversized: OversizedBlock[]; spreads: UnpairedSpread[]; images: PlacedImage[]; startPage: number } | null>(null);
  // A layout of text that has been edited since is out of date: the next one will follow.
  const laidOut = (markdown: string, oversized: OversizedBlock[], result: { pages: number; startPage: number; spreads: UnpairedSpread[]; images: PlacedImage[] }) => {
    const now = activeRef.current;
    if (!now || markdown !== now.markdown) return;
    setLayout({ chapterId: now.id, oversized, spreads: result.spreads, images: result.images, startPage: result.startPage });
    session.setPageCount(now.id, result.pages, result.startPage); // the page numbers of the chapters after it follow from this
  };
  // Images too small for print: judged from where the preview placed them and the pixel size of their files.
  const placed = active && layout?.chapterId === active.id ? layout.images : NO_IMAGES;
  const resolution = useResolutionWarnings(store, project.id, images.assets, placed, layout?.startPage ?? 1);
  const layoutWarnings =
    active && layout?.chapterId === active.id
      ? [
          ...layout.oversized.map((b) => ({ index: b.index, message: oversizedMessage(b) })),
          ...layout.spreads.map((s) => ({ index: s.index, message: spreadMessage(s, layout.startPage) })),
          ...resolution.flatMap((w) => (w.index === null ? [] : [{ index: w.index, message: w.message }])),
        ]
      : [];

  /** The editor gives the new text and the chapter it belongs to (the chapter can change while a save is pending). */
  const edit = (markdown: string, chapterId = activeRef.current?.id) => {
    if (!chapterId) return;
    session.edit(chapterId, markdown);
    setActive((a) => (a && a.id === chapterId ? { ...a, markdown } : a));
  };

  /** Puts a component that shows the image at the end of the chapter that is open: `directive` is written with the image's reference in `{ref}`. */
  const insertImage = (asset: AssetRef, directive: (reference: string) => string) => {
    const now = activeRef.current;
    if (!now) return;
    let reference = referenceFor(asset, images.assets);
    if (/["\\\n]/.test(reference)) reference = asset.id; // a name that cannot be written in quotes: the id always can
    const text = now.markdown.trimEnd();
    edit(`${text}${text ? "\n\n" : ""}${directive(reference)}\n`, now.id);
  };
  const insertFigure = (asset: AssetRef) => insertImage(asset, (src) => `::figure{src="${src}"}`);
  const insertPage = (asset: AssetRef) => insertImage(asset, (art) => `::page{template="art-full" art="${art}"}`);

  const numbers = pageInfo(chapters);
  const activeIndex = chapters.findIndex((c) => c.id === active?.id);

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
    <div
      className="shell"
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDroppable(true);
      }}
      onDragLeave={(e) => !e.relatedTarget && setDroppable(false)}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDroppable(false);
        void images.add([...e.dataTransfer.files]);
      }}
    >
      {droppable && (
        <div className="drop-overlay" aria-hidden="true">
          Drop images to add them to “{title}”
        </div>
      )}
      <header className="topbar">
        {onBack && (
          <button type="button" className="link" onClick={onBack}>
            ← Projects
          </button>
        )}
        <strong>Rosetta</strong>
        <span className="hint">{[title, chapters.find((c) => c.id === active?.id)?.title].filter(Boolean).join(" · ")}</span>
        <SaveIndicator status={session.status} onRetry={() => void session.retry()} />
        <button type="button" className="link" onClick={() => void exportFile()} disabled={exporting === "working"} title="Save a copy as a .rosetta file">
          {exporting === "working" ? "Exporting…" : exporting === "done" ? "Exported ✓" : "Export"}
        </button>
        {exporting.startsWith("error:") && (
          <span role="alert" className="save-status" data-state="error">
            Could not export: {exporting.slice(6)}
          </span>
        )}
      </header>
      {reminders.isDue(project.id) && (
        <BackupBanner
          title={title}
          days={reminders.daysUnbacked(project.id) ?? 0}
          lastBackupAt={reminders.state(project.id).lastBackupAt}
          busy={exporting === "working"}
          onExport={() => void exportFile()}
          onDismiss={() => {
            reminders.dismiss(project.id);
            update();
          }}
        />
      )}
      <aside className="side">
      <ChapterSidebar
        chapters={chapters}
        pages={numbers}
        activeId={active?.id ?? null}
        onSelect={(id) => void open(id)}
        onAdd={add}
        onRename={(id, t) => session.renameChapter(id, t)}
        onDelete={remove}
        onStart={(id, start) => session.setChapterStart(id, start)}
        onMove={(id, index) => session.moveChapter(id, index)}
      />
      <ImagePanel images={images} onInsert={active ? insertFigure : undefined} onInsertPage={active ? insertPage : undefined} />
      </aside>
      {active ? (
        <>
          <EditorPane chapterId={active.id} markdown={active.markdown} parsed={parsed} layoutWarnings={layoutWarnings} resolveImage={resolveImage} imagesKey={imagesKey} onChange={edit} />
          <PreviewPane parsed={parsed} onLayout={laidOut} startOn={chapters[activeIndex]?.start ?? "next-page"} startPage={numbers[activeIndex]?.start ?? 1} stale={activeIndex > 0 && numbers[activeIndex - 1]?.stale} resolveImage={resolveImage} imagesKey={imagesKey} imageProblems={resolution.map((w) => w.message)} />
        </>
      ) : (
        <section className="pane editor empty-project" aria-label="Editor">
          <p className="hint">{problem ?? (chapters.length ? "Opening the chapter…" : "This project has no chapters. Add one with + in the chapter list.")}</p>
        </section>
      )}
    </div>
  );
}
