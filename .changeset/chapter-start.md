---
"@rosetta/preview": minor
"@rosetta/theme-classic": patch
"@rosetta/app": minor
---

Chapter start rules: `render({ startPage, startOn })` in the preview. A chapter that starts on a right-hand page gets a blank page before it when it would start on a left-hand one, and page numbers count from the chapter's first book page. The theme styles blank pages (`@page :blank`: no header, no page number). Chapters get a "start on a right-hand page" toggle (manifest `start`).
