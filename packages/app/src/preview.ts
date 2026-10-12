import { createPreview, type Preview } from "@rosetta/preview";
// pagedjs only exports its sources, not the browser build, so the file is reached by path.
import pagedUrl from "../node_modules/pagedjs/dist/paged.polyfill.min.js?url";

/** The preview the app uses: pages made by Paged.js, shown in an iframe in `host`. */
export const createAppPreview = (host: HTMLElement): Preview => createPreview(host, { pagedUrl });
