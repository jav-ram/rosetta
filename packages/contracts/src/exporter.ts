/** What a book export is doing, for showing a person. */
export interface ExportProgress {
  stage: "reading" | "converting" | "images" | "layout" | "printing";
  /** What is happening, in a sentence, for example "Laying out page 37". */
  message: string;
  /** How far along the stage is, out of `total`. `total` is 0 when it is not known. */
  done: number;
  total: number;
}

export interface ExportOptions {
  /** Called as the export moves on. */
  onProgress?: (progress: ExportProgress) => void;
  /** Stops the export: it rejects with an `ExportError` whose code is `cancelled`. */
  signal?: AbortSignal;
}

export interface ExportResult {
  /** How many pages the book has, a blank page counted. */
  pages: number;
  /** Things that were wrong but did not stop the export, for showing a person: for example an image that is not in the project and was left as a placeholder. */
  warnings: string[];
}

export type ExportErrorCode =
  /** The project has no chapters, or no text in any of them. */
  | "empty"
  /** The person (or the caller's signal) stopped it. */
  | "cancelled"
  /** Something went wrong; the message says what. */
  | "failed";

export class ExportError extends Error {
  readonly code: ExportErrorCode;
  constructor(code: ExportErrorCode, message: string) {
    super(message);
    this.name = "ExportError";
    this.code = code;
  }
}

/**
 * Turns a whole project into a book to print or to keep as a PDF. `BrowserPrintExporter` (the browser's print dialog) implements it
 * in v1; a `ServerExporter` can later render on a server and give the PDF back.
 */
export interface Exporter {
  /** Exports the project's chapters, in order. */
  exportBook(projectId: string, options?: ExportOptions): Promise<ExportResult>;
}
