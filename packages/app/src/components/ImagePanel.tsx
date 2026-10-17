import type { AssetRef } from "@rosetta/contracts";
import { useRef } from "react";
import type { Images } from "../useImages";

const kilobytes = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} kB`);

/** The images of the project: add some (the button, or drop files anywhere on the editor), see what is there, and put one in the chapter as a figure or as a page of art. */
export function ImagePanel({ images, onInsert, onInsertPage }: { images: Images; onInsert?: (asset: AssetRef) => void; onInsertPage?: (asset: AssetRef) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const { assets, thumbnails, progress, problems } = images;
  return (
    <section className="images" aria-label="Images">
      <div className="sidebar-head">
        <h2>Images</h2>
        <button type="button" className="chapter-add" onClick={() => input.current?.click()} aria-label="Add images" title="Add images (or drop them on the editor)">
          +
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label="Choose images"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = ""; // choosing the same file again must work
          void images.add(files);
        }}
      />
      {progress && progress.total > 0 && (
        <p className="hint" role="status">
          Adding images… {progress.stored} of {progress.total}
          {progress.previewed < progress.stored ? " (preparing previews)" : ""}
        </p>
      )}
      {problems.length > 0 && (
        <div role="alert" className="image-problems">
          {problems.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <button type="button" className="link" onClick={images.clearProblems}>
            Dismiss
          </button>
        </div>
      )}
      {assets.length === 0 && !progress && <p className="hint">No images yet.</p>}
      <ul>
        {assets.map((a) => (
          <li key={a.id} title={`${a.name ?? a.id} · ${kilobytes(a.size)}`}>
            {thumbnails.get(a.id) ? <img src={thumbnails.get(a.id)} alt="" loading="lazy" /> : <span className="image-placeholder" aria-hidden="true" />}
            <span className="image-name">{a.name ?? a.id}</span>
            {onInsert ? (
              <span className="image-actions">
              <button type="button" className="image-insert" onClick={() => onInsert(a)} aria-label={`Insert ${a.name ?? a.id} as a figure`} title="Add it to the end of the chapter as a figure">
                Insert
              </button>
              {onInsertPage && (
                <button type="button" className="image-insert" onClick={() => onInsertPage(a)} aria-label={`Insert ${a.name ?? a.id} as a page of art`} title="Add it to the end of the chapter as a full page of art">
                  Page
                </button>
              )}
              </span>
            ) : (
              <span className="image-size">{kilobytes(a.size)}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
