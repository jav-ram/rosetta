import type { ProjectSummary } from "@rosetta/contracts";
import { useState } from "react";
import { ProjectsScreen } from "./components/ProjectsScreen";
import { useStore, type ClosableStore } from "./useStore";
import { Workspace } from "./Workspace";

interface Props {
  /** How to open the project store. The browser's IndexedDB by default; tests give another. */
  openStore?: () => Promise<ClosableStore>;
}

/** The app starts on the list of projects; opening one shows its editor. */
export function App({ openStore }: Props) {
  const store = useStore(openStore);
  const [project, setProject] = useState<ProjectSummary | null>(null);

  if (store.state === "loading") return <main className="projects"><p className="hint">Opening your projects…</p></main>;
  if (store.state === "error") {
    return (
      <main className="projects">
        <h1>Rosetta</h1>
        <p role="alert" className="projects-error">
          Your projects cannot be opened: {store.message}. The browser may be blocking site storage (a private window, or storage turned off).
        </p>
      </main>
    );
  }
  if (project) return <Workspace store={store.store} project={project} onBack={() => setProject(null)} />;
  return <ProjectsScreen store={store.store} onOpen={setProject} />;
}
