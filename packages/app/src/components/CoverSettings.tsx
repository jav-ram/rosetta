import type { AssetRef, Manifest } from "@rosetta/contracts";

interface Props {
  /** The book's cover setting: absent when there is no cover. */
  cover: Manifest["cover"];
  /** What the cover says when it has no title of its own. */
  bookTitle: string;
  /** The project's images, to pick the cover's picture from. */
  images: readonly AssetRef[];
  onChange: (cover: Manifest["cover"] | null) => void;
  onClose: () => void;
}

/** A cover is a page, not a file: the title is plain text, the picture is one of the images already in the project. */
export function CoverSettings({ cover, bookTitle, images, onChange, onClose }: Props) {
  const enabled = cover !== undefined;
  const pictures = images.filter((a) => a.mediaType.startsWith("image/"));
  const pictureId = cover?.image?.id ?? "";
  /** Keys with nothing in them are left out, because the manifest does not allow them empty. */
  const update = (patch: { title?: string; image?: AssetRef | null }) => {
    const { title: oldTitle, image: oldImage } = cover ?? {};
    const title = "title" in patch ? patch.title : oldTitle;
    const image = "image" in patch ? patch.image : oldImage;
    onChange({ ...(title ? { title } : {}), ...(image ? { image } : {}) });
  };
  return (
    <div className="export-overlay">
      <div className="export-dialog" role="dialog" aria-modal="true" aria-label="Cover">
        <h2>Front cover</h2>
        <label className="cover-row">
          <input type="checkbox" checked={enabled} onChange={(e) => onChange(e.target.checked ? {} : null)} />
          Print a cover as the first page of the PDF
        </label>
        <p className="hint">The cover is followed by a blank page, so the first chapter is page 1 on a right-hand page, as in print. The cover and the blank page have no number.</p>
        <label className="cover-field">
          Title on the cover
          <input type="text" value={cover?.title ?? ""} placeholder={bookTitle} disabled={!enabled} onChange={(e) => update({ title: e.target.value })} />
        </label>
        <label className="cover-field">
          Picture
          <select value={pictureId} disabled={!enabled} onChange={(e) => update({ image: pictures.find((a) => a.id === e.target.value) ?? null })}>
            <option value="">No picture (a plain color)</option>
            {pictures.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name ?? a.id}
              </option>
            ))}
          </select>
        </label>
        {enabled && pictures.length === 0 && <p className="hint">Add an image to the project first (Images, +) to use it on the cover.</p>}
        <div className="export-actions">
          <button type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
