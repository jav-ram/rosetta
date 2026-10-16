import type { ProjectStore } from "@rosetta/contracts";
import { openLocalStore } from "@rosetta/store-local";
import { useEffect, useState } from "react";

export type StoreState = { state: "loading" } | { state: "ready"; store: ProjectStore } | { state: "error"; message: string };

/** What the app needs from a store: a ProjectStore it can close. */
export type ClosableStore = ProjectStore & { close(): void };

/** Opens the browser's project store once, and closes it when the app goes away. `open` is for tests. */
export function useStore(open: () => Promise<ClosableStore> = openLocalStore): StoreState {
  const [state, setState] = useState<StoreState>({ state: "loading" });
  useEffect(() => {
    let closed = false;
    let store: ClosableStore | null = null;
    open().then(
      (s) => {
        if (closed) return s.close();
        store = s;
        setState({ state: "ready", store: s });
      },
      (e: unknown) => !closed && setState({ state: "error", message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      closed = true;
      store?.close();
    };
    // The store is opened once; `open` is not expected to change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}
