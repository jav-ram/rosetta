import type { AssetRef, ProjectStore } from "@rosetta/contracts";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { importImages, type ImportProgress } from "./images/importImages";
import { makePreview as defaultMakePreview, type MakePreview } from "./images/previewMaker";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface Images {
  assets: AssetRef[];
  /** For each asset id, an address the browser can show (the preview copy, or the original while there is none). */
  thumbnails: ReadonlyMap<string, string>;
  /** Changes whenever a thumbnail address does, so what shows an image knows to draw again. */
  version: number;
  /** While images are being added. */
  progress: ImportProgress | null;
  /** What could not be added or listed, to tell the person. */
  problems: string[];
  add: (files: File[]) => Promise<void>;
  clearProblems: () => void;
}

/** The images of a project: the list, a thumbnail of each, and adding more. Previews are made in the background. */
export function useImages(store: ProjectStore, projectId: string, onChanged?: () => void, makePreview: MakePreview = defaultMakePreview): Images {
  const [assets, setAssets] = useState<AssetRef[]>([]);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [version, redraw] = useReducer((n: number) => n + 1, 0);
  const urls = useRef(new Map<string, string>());
  const alive = useRef(true);
  const changed = useRef(onChanged);
  changed.current = onChanged;

  const showThumbnail = useCallback(
    async (ref: AssetRef) => {
      try {
        const url = URL.createObjectURL(await store.getAsset(projectId, ref, "preview"));
        if (!alive.current) return void URL.revokeObjectURL(url);
        const old = urls.current.get(ref.id);
        urls.current.set(ref.id, url);
        if (old) URL.revokeObjectURL(old);
        redraw();
      } catch {
        // No thumbnail: the name is still listed.
      }
    },
    [store, projectId],
  );

  useEffect(() => {
    alive.current = true;
    const known = urls.current;
    store.listAssets(projectId).then(
      (list) => {
        if (!alive.current) return;
        setAssets((now) => [...list, ...now.filter((a) => !list.some((l) => l.id === a.id))]);
        for (const ref of list) if (!known.has(ref.id)) void showThumbnail(ref);
      },
      (e: unknown) => alive.current && setProblems((p) => [...p, `Could not list the images: ${message(e)}`]),
    );
    return () => {
      alive.current = false;
      for (const url of known.values()) URL.revokeObjectURL(url);
      known.clear();
    };
  }, [store, projectId, showThumbnail]);

  const add = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const result = await importImages(store, projectId, files, {
        makePreview,
        onProgress: (p) => alive.current && setProgress(p),
        onAdded: (ref) => {
          if (!alive.current) return;
          setAssets((a) => [...a, ref]);
          void showThumbnail(ref);
        },
        onPreview: (ref) => void showThumbnail(ref),
      });
      if (result.added.length) changed.current?.();
      if (!alive.current) return;
      setProgress(null);
      if (result.skipped.length) setProblems((p) => [...p, ...result.skipped.map((s) => `${s.name} was not added: ${s.reason}`)]);
    },
    [store, projectId, makePreview, showThumbnail],
  );

  return { assets, thumbnails: urls.current, version, progress, problems, add, clearProblems: () => setProblems([]) };
}
