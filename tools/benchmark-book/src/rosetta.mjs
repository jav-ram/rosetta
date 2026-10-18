// Turns a generated book into a real `.rosetta` file (a zip: manifest.json, chapters/NN-title.md, assets/assets.json and
// assets/originals/<id>.<ext>), the format Rosetta imports and exports, so the large books can be opened in the app.
import { strToU8, zipSync } from "fflate";
import { illustration } from "./raster.mjs";

const slug = (title) => title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "") || "chapter";

/**
 * @param {{ files: Map<string, string>, manifest: { title: string, chapters: { file: string, title: string, startOn: string }[] } }} book
 * @param {{ raster?: boolean, rasterSize?: [number, number] }} [options] `raster`: the illustrations are PNG files (by default of an A4 page at 300 dpi, 2480 by 1754, about 3.7 MB each) instead of the small placeholder SVGs; `rasterSize` makes them another size
 * @returns {Uint8Array} the bytes of the `.rosetta` file
 */
export function toRosettaFile({ files, manifest }, { raster = false, rasterSize = [2480, 1754] } = {}) {
  const count = manifest.chapters.length;
  const digits = Math.max(2, String(count).length);
  const out = {};

  // Images are named in chapters by their file name; the generated text says `assets/originals/ill-001.svg`.
  const extension = raster ? "png" : "svg";
  const refs = [...files.keys()]
    .filter((path) => /^assets\/originals\/(ill-\d+|cover)\.svg$/.test(path))
    .map((path) => {
      const id = path.split("/").pop().replace(/\.svg$/, "");
      const bytes = raster ? new Uint8Array(illustration(id === "cover" ? 0 : Number(id.slice(4)), ...rasterSize)) : strToU8(files.get(path));
      return { id, name: `${id}.${extension}`, mediaType: raster ? "image/png" : "image/svg+xml", size: bytes.length, path, bytes };
    });
  for (const ref of refs) out[`assets/originals/${ref.id}.${extension}`] = ref.bytes;
  out["assets/assets.json"] = strToU8(`${JSON.stringify(refs.map(({ path, bytes, ...ref }) => ref), null, 2)}\n`);

  const chapters = manifest.chapters.map((chapter, i) => ({ id: `chapter-${i + 1}`, title: chapter.title, ...(chapter.startOn === "right" ? { start: "right-page" } : {}) }));
  manifest.chapters.forEach((chapter, i) => {
    const text = files.get(chapter.file).replace(/assets\/originals\/(ill-\d+)\.svg/g, `$1.${extension}`);
    out[`chapters/${String(i + 1).padStart(digits, "0")}-${slug(chapter.title)}.md`] = strToU8(text);
  });
  // The cover: the book's title over the cover picture, which is one of the assets.
  const coverRef = refs.find((ref) => ref.id === "cover");
  const cover = coverRef ? { title: manifest.cover?.title ?? manifest.title, image: (({ path, bytes, ...ref }) => ref)(coverRef) } : undefined;
  out["manifest.json"] = strToU8(`${JSON.stringify({ rosettaVersion: manifest.rosettaVersion ?? "0.1", title: manifest.title, system: "example", theme: "classic", ...(cover ? { cover } : {}), chapters }, null, 2)}\n`);
  return zipSync(out, { mtime: new Date(1980, 0, 1) });
}
