import type { ProjectStore, ProjectSummary } from "@rosetta/contracts";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { backupReminders, type BackupReminders } from "../backupReminder";
import { makePreview as defaultMakePreview, type MakePreview } from "../images/previewMaker";
import { rebuildPreviews } from "../images/rebuildPreviews";
import { openProjectFile, saveProjectFile } from "../projectFile";

interface Props {
  store: ProjectStore;
  onOpen: (project: ProjectSummary) => void;
  /** Saves a project as a file. The real one by default; tests give another. */
  saveFile?: typeof saveProjectFile;
  /** Where backups are noted, for the reminder. */
  reminders?: BackupReminders;
  /** Makes the preview copies of images in an imported file. The real one (a worker) by default; tests give another. */
  makePreview?: MakePreview;
  /** Where the app has moved to, when this is the old address. A note at the top says projects have to be exported here and imported there. */
  movedTo?: string;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The first chapter of a new project, so there is something to write in. */
const newManifest = (title: string) => ({
  rosettaVersion: "0.1",
  title,
  theme: "classic",
  chapters: [{ id: "chapter-1", title: "Chapter 1" }],
});

/** List, create, rename and delete projects. They are kept by the store, so they are here after the browser is closed and opened again. */
export function ProjectsScreen({ store, onOpen, saveFile = saveProjectFile, reminders = backupReminders, makePreview = defaultMakePreview, movedTo = import.meta.env.VITE_MOVED_TO }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => setProjects(await store.listProjects()), [store]);
  /** Runs a change, then shows the list again. A failure is shown and nothing else changes. */
  const change = async (work: () => Promise<void>) => {
    setError(null);
    try {
      await work();
      await refresh();
    } catch (e) {
      setError(message(e));
    }
  };

  useEffect(() => {
    refresh().catch((e) => setError(message(e)));
  }, [refresh]);

  const create = (e: FormEvent) => {
    e.preventDefault();
    const name = title.trim();
    if (!name) return;
    void change(async () => {
      await store.createProject(newManifest(name));
      setTitle("");
    });
  };

  const rename = (e: FormEvent) => {
    e.preventDefault();
    if (!renaming) return;
    const { id, value } = renaming;
    const name = value.trim();
    if (!name) return;
    void change(async () => {
      await store.saveManifest(id, { ...(await store.loadManifest(id)), title: name });
      setRenaming(null);
    });
  };

  const exportFile = (p: ProjectSummary) =>
    change(async () => {
      const outcome = await saveFile(store, p);
      if (outcome === "saved") reminders.noteBackup(p.id);
      setExported(outcome === "saved" ? p.id : null);
    });

  const importFile = (files: FileList | null) => {
    const file = files?.[0];
    if (picker.current) picker.current.value = ""; // so the same file can be chosen again
    if (!file) return;
    // A project that came from a file is, as it stands, in that file: no backup is due.
    void change(async () => {
      const imported = await openProjectFile(store, file);
      reminders.noteBackup(imported.id);
      void rebuildPreviews(store, imported.id, makePreview); // the file has only the originals; this goes on in the background
    });
  };

  const remove = (id: string) =>
    change(async () => {
      await store.deleteProject(id);
      reminders.forget(id);
      setDeleting(null);
    });

  return (
    <main className="projects">
      <h1>Rosetta</h1>
      {movedTo && (
        <p role="note" className="projects-moved">
          Rosetta has moved to <a href={movedTo}>{movedTo.replace(/^https?:\/\//, "")}</a>. Projects are kept in the browser, separately for each address, so the ones here are not there. To bring a project over: <strong>Export</strong> it here, then use <strong>Import…</strong> on the new address.
        </p>
      )}
      <form className="projects-new" onSubmit={create}>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title of a new project" aria-label="Title of a new project" />
        <button type="submit" disabled={!title.trim()}>
          Create project
        </button>
        <button type="button" onClick={() => picker.current?.click()}>
          Import…
        </button>
        <input ref={picker} type="file" accept=".rosetta,application/zip" hidden aria-label="Import a .rosetta file" onChange={(e) => importFile(e.target.files)} />
      </form>
      {error && (
        <p role="alert" className="projects-error">
          {error}
        </p>
      )}
      {projects === null ? (
        <p className="hint">Loading projects…</p>
      ) : projects.length === 0 ? (
        <p className="hint">No projects yet. Give one a title above.</p>
      ) : (
        <ul className="projects-list" aria-label="Projects">
          {projects.map((p) => (
            <li key={p.id}>
              {renaming?.id === p.id ? (
                <form className="projects-rename" onSubmit={rename}>
                  <input
                    type="text"
                    value={renaming.value}
                    onChange={(e) => setRenaming({ id: p.id, value: e.target.value })}
                    onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                    aria-label={`New title for ${p.title}`}
                    onFocus={(e) => e.target.select()}
                    autoFocus
                  />
                  <button type="submit" disabled={!renaming.value.trim()}>
                    Save
                  </button>
                  <button type="button" onClick={() => setRenaming(null)}>
                    Cancel
                  </button>
                </form>
              ) : deleting === p.id ? (
                <div className="projects-confirm" role="group" aria-label={`Delete ${p.title}`}>
                  <span>
                    Delete “{p.title}” with its chapters and images? This cannot be undone.
                  </span>
                  <button type="button" className="danger" onClick={() => void remove(p.id)}>
                    Delete
                  </button>
                  <button type="button" onClick={() => setDeleting(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <button type="button" className="projects-open" onClick={() => onOpen(p)}>
                    <strong>{p.title}</strong>
                    <span className="hint">Changed {new Date(p.updatedAt).toLocaleString()}</span>
                  </button>
                  <button type="button" onClick={() => void exportFile(p)} aria-label={`Export ${p.title}`} title="Save a copy as a .rosetta file">
                    {exported === p.id ? "Exported ✓" : "Export"}
                  </button>
                  <button type="button" onClick={() => setRenaming({ id: p.id, value: p.title })} aria-label={`Rename ${p.title}`}>
                    Rename
                  </button>
                  <button type="button" onClick={() => setDeleting(p.id)} aria-label={`Delete ${p.title}`}>
                    Delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
