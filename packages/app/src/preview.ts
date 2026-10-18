import { createBookLayout, createPreview, type BookLayout, type Preview } from "@rosetta/preview";
// pagedjs only exports its sources, not the browser build, so the file is reached by path.
import pagedUrl from "../node_modules/pagedjs/dist/paged.polyfill.min.js?url";

/** The preview the app uses: pages made by Paged.js, shown in an iframe in `host`. `resolveImage` finds the files of the project's images. */
export const createAppPreview = (host: HTMLElement, resolveImage?: (src: string) => string): Preview => createPreview(host, { pagedUrl, resolveImage });

/** The layout of a whole book, for printing: in a frame in `host` that is not seen. */
export const createAppBookLayout = (host: HTMLElement): BookLayout => createBookLayout(host, { pagedUrl });
