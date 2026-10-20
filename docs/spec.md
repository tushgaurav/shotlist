# Shotlist — Product & Technical Spec

Status: draft for review · v0.1 · Oct 17, 2026

## 1. What we're building

A web app for planning video productions. Version 1 covers two features that are deliberately connected:

1. **Scripts** — write a properly formatted screenplay in the browser, save named versions, compare and restore them.
2. **Shot lists** — plan shots for each scene of the script, then organise them into shoot days.

The connection is the point: every shot belongs to a scene, shots stay attached to their scene through edits and versions, and when the script changes you can see which shots are affected.

Alongside them, **notes**: quick, free-form notes per project. Not every project starts with a script. Many (music videos, commercials, YouTube videos) start as a pile of ideas and references and go straight to shots. Notes give them somewhere to start, and will feed the AI writer (see 7a).

Built for one user first. Structured so it can become a multi-user product later without a rewrite.

### Goals for v1

- Write a screenplay with correct formatting and fast keyboard flow.
- Save named versions; compare any two (or a version against the current draft); restore safely.
- Scenes from the script appear automatically in the shot list.
- Plan shoot days: group shots into setups, order them, see time estimates.
- Export a shot list (CSV, PDF) and use it on set from a phone.

### Not in v1

- Multiple users, sharing, comments, real-time co-editing.
- Revision colors, locked pages, locked scene numbers (designed for, not built — see 3.4).
- Script breakdown (tagging cast, props, wardrobe), stripboards, call sheets, budgets.
- Importing PDF or Final Draft files (Fountain import only).

## 2. Concepts

| Term | Meaning |
| --- | --- |
| Project | One production (short, music video, commercial, feature). Has one script and one shot list. |
| Project type | A label for the kind of project, with an icon. Each user has their own list ("Short Film", "YouTube Video"…), seeded with four defaults at sign-up. |
| Details | A project's optional metadata: logline, synopsis, genre, tone, target runtime, aspect ratio, language, and a header image. Everything but the image is given to the AI writer as context (see 5, AI writing). |
| Note | A free-form note in a project: ideas, references, research, things to shoot. Its first line is its title. |
| Script | The screenplay. Has one **working draft** (what you edit, autosaved) and many **versions**. |
| Version | An immutable, named snapshot of the script, e.g. "Draft 2" or "Shooting Script". |
| Scene | A section of the script that starts with a scene heading (`INT. KITCHEN - NIGHT`). Has a permanent ID. |
| Shot | One planned camera shot. Usually belongs to a scene; can be standalone (B-roll, inserts, pickups). |
| Setup | One camera position and lighting arrangement. Several shots are filmed per setup. The main cost of time on set. |
| Shoot day | A day of filming, containing setups in order. |

**Story order vs shooting order.** The script and shot list are in story order. On set, shots are filmed in shooting order — grouped by location and setup to avoid moving lights and camera. The app keeps both orders.

## 3. Key design decisions

### 3.1 Scenes have permanent IDs stored in the document

The document is a flat sequence of screenplay elements (heading, action, character, dialogue…). A scene is a heading plus everything up to the next heading. Each scene heading node carries a `sceneId` attribute, generated in the browser when the heading is created.

The ID travels with the heading through typing, cut and paste, reordering, and into every saved version. On every save, the server extracts scenes from the document and upserts them into the `scenes` table keyed by `sceneId`. Shots reference that row.

Why: scene numbers change (insert one scene and everything after it renumbers) and headings change (`INT. KITCHEN` becomes `INT. DINER`). Neither can be used to link shots. A permanent ID can.

Edge cases:

- **Copy and paste.** A pasted heading whose ID already exists elsewhere in the document gets a new ID. An editor plugin enforces this on every transaction. Cut and paste (a move) keeps the ID because the original is gone.
- **Deleting a heading.** The scene's row gets `removed_at` set. Its shots are kept and shown in an "Unlinked shots" group until you re-link or delete them. If the heading comes back (undo, or restoring a version), `removed_at` is cleared and the shots reappear in place. Scene rows are never hard-deleted.
- **Splitting a scene** (adding a heading in the middle). The new part is a new scene. Existing shots stay on the original; you move them if needed.
- **Text before the first heading** (e.g. `FADE IN:`) belongs to no scene.

### 3.2 Document storage

- Editor: **TipTap** (built on ProseMirror). The document is stored as ProseMirror JSON in a Postgres `jsonb` column.
- Each saved version also stores a plain-text **Fountain** rendering, used for diffs, search and export.
- Fountain is the import/export format. Importing creates a new script with new scene IDs; it's for bringing scripts in, not for syncing with other tools.

Why TipTap: each screenplay element is a custom node with its own keyboard behavior, and it has a known path to real-time co-editing (Yjs) if this becomes a multi-user product.

### 3.3 Versioning

- The working draft **autosaves** continuously (debounced ~1.5 s). Autosave never creates versions.
- **Save version** creates an immutable snapshot with a sequence number, name and optional note.
- **Restore** copies a version's content into the working draft. Before overwriting, the current draft is saved automatically as a version named "Before restoring vN", so a restore can always be undone.
- **Compare** any two versions, or a version against the current draft:
  - Scene level, matched by `sceneId`: added, removed, changed, moved.
  - Inside changed scenes: word-level diff of the Fountain text.
  - **Shots affected:** shots attached to changed or removed scenes, with links.
- Later: revision colors (white, blue, pink, yellow, green, goldenrod, buff, salmon, cherry) and change marks in the margin. This only needs a nullable `color` column on versions.

### 3.4 Scene numbering

v1 numbers scenes automatically by position (1, 2, 3…), recomputed on every save.

Later, **lock scene numbers**: existing numbers freeze, a scene inserted between 12 and 13 becomes 12A, and deleted scenes leave an "OMITTED" placeholder. Productions lock numbers once the shooting script goes out. `scenes.number` is text so "12A" fits without a migration.

### 3.5 Shot numbering

A shot's label is its scene number plus a letter: 12A, 12B, 12C.

- The shot stores only the letter (`suffix`). The scene number comes from the scene, so if scenes renumber before shooting, shot labels follow automatically.
- A new shot gets the letter after the highest one in its scene, so it never takes the label of a shot before it. Letters I and O are skipped (they read as 1 and 0 on a slate). After Z comes AA.
- Moving a shot to another scene gives it the next letter there.
- Reordering shots does **not** relabel them, because people refer to shot numbers in notes and on slates. An explicit "Renumber shots in this scene" action exists. It previews the label changes before applying them.
- Any shot can have a custom label, which replaces the automatic one. Standalone shots have only a custom label (e.g. "BR1").
- Labels are assigned on the server under a lock on the project row, so two quick adds can't get the same letter.

### 3.6 Time estimates

Most time on set goes into setups, not into rolling camera. So:

- A setup has `est_setup_minutes` (moving camera, lighting).
- A shot has `est_shoot_minutes` (rehearsal and takes).
- A day's total = all its setup minutes + all its shot minutes, compared against call-to-wrap time.

### 3.7 Single user now, product-ready later

- Every project has an `owner_id`.
- All data access goes through a server-only data access layer. One function, `requireProject(projectId)`, checks the session and ownership. Adding team members later means changing that one check to a membership-and-role check.
- Server Actions can be called by direct POST, so every one of them goes through the data access layer. Page, layout and proxy checks are never relied on for authorization.
- IDs are random strings, not sequential integers, so they're safe in public URLs later.

## 4. Data model

Postgres with Drizzle. Better Auth manages its own tables (`user`, `session`, `account`, `verification`), not listed here.

Columns like shot size and movement are `text`, not database enums. The UI offers presets but accepts custom values, and adding a preset needs no migration.

Ordering columns (`position`) use fractional indexing, so dragging one row updates only that row.

```text
projects
  id                  text pk
  owner_id            text → user.id
  title               text
  type_id             text → project_types.id, null  -- one of the owner's types; cleared if the type is deleted
  logline             text null
  synopsis            text null
  genre               text null   -- presets, comma-separated, custom allowed
  tone                text null   -- tone, style and references
  target_runtime_minutes integer null
  aspect_ratio        text null   -- e.g. 2.39:1, 9:16
  language            text null
  cover_image_id      text → assets.id, null       -- header image; cleared if the asset row is deleted
  created_at          timestamptz
  updated_at          timestamptz -- also set by every shot change; the shot list's version stamp
  archived_at         timestamptz null

project_types                       -- each user's own list
  id                  text pk
  owner_id            text → user.id
  name                text        -- unique per owner, ignoring case
  icon                text        -- key from a fixed icon set, e.g. film, video, megaphone
  created_at          timestamptz

scripts                             -- one per project in v1 (unique project_id)
  id                  text pk
  project_id          text → projects.id, unique
  title_page          jsonb       -- title, credit, author, draft date, contact
  draft               jsonb       -- working draft, ProseMirror JSON
  draft_revision      integer     -- +1 on every save; stale saves (another tab) are rejected
  updated_at          timestamptz

script_versions                     -- immutable once written
  id                  text pk
  script_id           text → scripts.id
  number              integer     -- 1, 2, 3… unique per script
  name                text
  note                text null
  kind                text        -- manual | before_restore
  content             jsonb       -- ProseMirror JSON snapshot
  fountain            text        -- plain-text rendering for diff, search, export
  created_at          timestamptz

scenes                              -- synced from the draft on every save
  script_id           text → scripts.id  -- pk is (script_id, id): IDs come from the
  id                  text               -- browser, so they're only unique per script
  position            integer     -- order in the current draft
  number              text        -- display number, e.g. "12"
  heading             text        -- full heading line
  int_ext             text null   -- INT | EXT | INT/EXT
  location            text null   -- e.g. KITCHEN
  time_of_day         text null   -- e.g. NIGHT
  content_hash        text        -- changes whenever the scene's text changes
  shots_reviewed_hash text null   -- content_hash when shots were last reviewed
  page_eighths        integer null -- filled in once pagination exists
  removed_at          timestamptz null
  updated_at          timestamptz

shots
  id                  text pk     -- generated in the browser, so creates can be retried safely
  project_id          text → projects.id
  script_id           text → scripts.id  -- always the project's script; lets scene_id
  scene_id            text null          -- reference scenes (script_id, id); null = standalone shot
  position            text        -- order within its scene (story order)
  suffix              text null   -- "A" → label "12A"
  custom_label        text null   -- standalone shots, or manual override
  description         text
  size                text null   -- EWS, WS, MWS, MS, MCU, CU, ECU, Insert
  shot_type           text null   -- single, two-shot, OTS, POV, establishing
  angle               text null   -- eye level, high, low, dutch, overhead
  movement            text null   -- static, pan, tilt, dolly, truck, crane, handheld, gimbal, drone, zoom
  lens                text null   -- e.g. 35mm
  camera              text null   -- A, B
  frame_rate          text null   -- e.g. 24, 60 (slow motion)
  subjects            text null   -- who or what is in frame
  equipment           text null
  sound               text null   -- sync, MOS, notes
  location_note       text null   -- set or spot within the scene's location
  vfx                 boolean     -- default false
  est_shoot_minutes   integer null
  status              text        -- planned | shot | omitted
  notes               text null
  image_id            text → assets.id, null       -- cleared if the asset row is deleted
  setup_id            text → setups.id, null       -- milestone 5; null = not scheduled
  setup_position      text null   -- order within its setup (shooting order)
  deleted_at          timestamptz null  -- soft delete, so Undo can bring a shot back
  created_at          timestamptz
  updated_at          timestamptz

shoot_days
  id                  text pk
  project_id          text → projects.id
  position            text
  label               text        -- "Day 1"
  date                date null
  call_time           time null
  wrap_time           time null
  notes               text null

setups
  id                  text pk
  shoot_day_id        text → shoot_days.id
  position            text
  name                text        -- e.g. "Kitchen wide, facing window"
  location            text null
  est_setup_minutes   integer null
  notes               text null

notes
  id                  text pk     -- generated in the browser; the row is written by the note's first save
  project_id          text → projects.id
  content             jsonb       -- ProseMirror JSON
  text                text        -- plain-text rendering with Markdown-style markers, for the list, search and the AI
  revision            integer     -- +1 on every save; stale saves (another tab) are rejected
  deleted_at          timestamptz null  -- soft delete, so Undo can bring a note back
  created_at          timestamptz
  updated_at          timestamptz -- last edit; deleting and restoring don't change it

assets                              -- uploaded images; the files live in S3
  id                  text pk
  project_id          text → projects.id
  content_type        text        -- image/webp or image/jpeg (re-encoded in the browser)
  storage_key         text        -- full size, longest edge ≤ 2048 px
  thumb_key           text        -- thumbnail, longest edge ≤ 640 px
  width               integer     -- of the full-size copy
  height              integer
  byte_size           integer     -- both copies together
  created_at          timestamptz
```

Project types are rows rather than presets so they can be renamed, given an icon, and counted. New types can be added in the new-project dialog, on the Details page, or in Settings › Project types. The new-project dialog preselects the type used most recently. Deleting a type leaves its projects without one. The header image is an ordinary project asset, uploaded the same way as shot images, and the project cards show its thumbnail.

A scene shows a **"scene changed"** badge in the shot list when it has shots and `content_hash ≠ shots_reviewed_hash`. Adding, editing or moving that scene's shots, or clicking "Mark reviewed", sets `shots_reviewed_hash` to the current `content_hash`.

## 5. Script editor

### Elements

Scene heading, Action, Character, Parenthetical, Dialogue, Transition. Later: dual dialogue, centered text, notes, sections and synopses for outlining, forced page breaks.

Text is stored as typed. Headings, character names and transitions are displayed and exported in uppercase.

### Keyboard flow (proposed defaults)

| Current line | Enter creates |
| --- | --- |
| Scene heading | Action |
| Action | Action |
| Character | Dialogue |
| Parenthetical | Dialogue |
| Dialogue | Character (next speaker) |
| Transition | Scene heading |
| Any empty line | Converts the line to Action |

So a conversation is Enter, type, Enter, type…, and pressing Enter on an empty Character line drops back to Action.

- **Tab / Shift+Tab** cycles the current line's type: Action → Character → Parenthetical → Dialogue → Transition → Scene heading.
- **Cmd/Ctrl + Option/Alt + 1–6** sets the type directly (heading, action, character, parenthetical, dialogue, transition). Plain Cmd/Ctrl + 1–6 switches browser tabs, so it can't be used.
- **Auto-detect:** a line starting with `INT.`, `EXT.`, `INT./EXT.`, `I/E.` or `EST.` becomes a scene heading; typing `(` at the start of a line after Character or Dialogue makes a parenthetical; an all-caps line ending in `TO:` becomes a transition.
- **Autocomplete:** character names from earlier in the script; locations and times of day (DAY, NIGHT, CONTINUOUS, LATER, MORNING, EVENING) in headings. Shown as grey text after the cursor; Tab, → or Enter accepts, Esc dismisses.

### Layout

Rendered as pages on screen in Courier Prime 12 pt with standard screenplay margins, so it looks like the printed page. A sidebar lists scenes (number, heading, shot count); click to jump, drag to move a whole scene. A side panel shows the shot list for the scene the cursor is in (see section 7).

### Saving

- Autosave sends the full document and `draft_revision` to a Route Handler (`PUT /api/scripts/[scriptId]/draft`). A Route Handler rather than a Server Action because Server Actions are capped at 1 MB per request by default, and a long script's JSON can approach that.
- If `draft_revision` doesn't match (the script was saved from another tab), the save is rejected and the editor asks you to reload.
- Unsaved changes are mirrored to `localStorage` so a crash or lost connection doesn't lose work.
- Status indicator: "Saving…", "Saved", "Offline — changes kept on this device", "Couldn't save — changes kept on this device".
- On the next visit, a local copy based on the current revision is restored automatically. A local copy based on an older revision isn't merged; it's offered as a Fountain download.

### AI writing

Optional; on when `OPENROUTER_API_KEY` is set. Inference goes through OpenRouter using the AI SDK. Every request sends the live script as Fountain, with scene numbers and a marker at the cursor, and the project's details (type, logline, synopsis, genre, tone, runtime, aspect ratio, language). Long scripts keep the scenes near the cursor in full and cut the rest to their headings. The model is picked in the UI (a short list in `lib/ai/models.ts`) and remembered per browser. A "Use Project Details" checkbox beside the model picker leaves the details out of every AI request when it's off (the AI writes from the script alone); it's remembered per browser and hidden when the project has no details.

- **Write (Cmd/Ctrl+K):** a composer at the cursor with suggestions for the line you're on (continue the scene, add dialogue, write the next scene), or for the selected lines (tighten, punch up the dialogue, make it more visual). Recent prompts are remembered.
- **Draft from details:** plan the scenes first (an editable outline sized to the target runtime), then write them one by one. Offered on an empty script, and from the AI menu to add scenes to the end.
- **Assistant (Cmd/Ctrl+J):** a chat in a sidebar beside the page, in the slot the shot panel uses, so the script stays editable while it's open. Drag its left edge to resize it (arrow keys work on the handle; double-click resets); the width is remembered per browser. On narrow screens it covers the page instead. It reads the whole script and can propose edits (rewrite scene N, add after scene N, insert at the cursor), which show as cards you can review in the script. Each project's conversation is kept in the browser.
- **Inline suggestions:** grey text continuing an action or dialogue line after a short pause. Tab accepts, typing the same letters keeps the rest, Esc dismisses. Uses a small, fast model; can be turned off in the AI menu.

Written lines stream into the page tinted, with a rule in the margin, and nothing is saved until you accept. Cmd/Ctrl+Enter or typing in them keeps them, Esc discards them (or stops writing), and "Ask for changes" revises them. Accepting is one undo step. A rewritten scene keeps its scene ID, so its shots stay attached; autosave always saves the script without the pending lines.

### Pagination (later)

Courier is monospaced, so pagination is deterministic line counting: standard element widths, about 55 lines per page, dialogue split across pages with (MORE) and (CONT'D). This gives page count and scene length in eighths of a page, which schedules use. Approximate is fine for planning; exact parity with Final Draft is not a goal.

## 6. Versions UI

- **History:** list of versions (number, name, date). Actions: view read-only, compare, restore.
- **Compare:** choose A and B (default: latest version vs current draft). Left column: scenes with added / removed / changed / moved badges. Right: word-level diff of the selected scene. Header: "N scenes changed · M shots affected", linking to those shots.

## 7. Shot list

Built in two passes, both done. Pass 1 is the table; pass 2 adds images (Amazon S3), the storyboard view, the script side panel and shot counts in the script's scene sidebar.

### Table view (default)

- Grouped by scene in story order. Each group header shows scene number, heading, shot count, estimated minutes and the "scene changed" badge with a "Mark reviewed" button. A scene menu has Add shot and Renumber shots.
- Standalone shots in a group at the end. Unlinked shots (scene removed) in a group at the top with a warning; the menu's "Move to" puts them back in a scene.
- The label column and the column header stay visible while scrolling. Omitted shots are dimmed and left out of time totals.
- Show/hide columns; the choice is remembered per project in `localStorage`. Shown by default: image, description, size, type, movement, lens, subjects, minutes, status. Hidden by default: angle, camera, frame rate, equipment, sound, location note, VFX, notes.
- Toolbar: total shots and estimated time, how many scenes changed, save status, Table/Storyboard switch, columns (table only), CSV export, keyboard shortcuts. The view choice is remembered per project in `localStorage`.

**Editing**

- Spreadsheet-style inline editing. Preset columns (size, type, angle, movement, lens, camera, frame rate, equipment, sound) suggest values as you type but accept anything. Subjects suggests the scene's characters, comma-separated.
- **Enter** moves to the same column in the next row; on the last row of a group it adds a shot. **Shift+Enter** adds a line in long text. **↑/↓** move between rows (in long text, only from the first or last line). **←/→** move between cells at the edge of the text. **Alt+↑/↓** moves the shot up or down. **Ctrl+Space** opens suggestions. **Esc** leaves the cell.
- Row menu: insert shot below, duplicate (copies everything except label and status), move up/down, move to another scene or standalone, delete with Undo.
- Drag rows by the handle to reorder within a scene or move a shot to another scene.

**Saving**

- Changes show immediately. Edits are batched and saved about 0.7 s after typing stops; adds, moves and deletes are sent in order through one queue.
- Failed saves are retried after 1 s and 3 s, then every 10 s with the status "Offline — retrying". Server rejections show "Some changes weren't saved" and a toast. Leaving the page with unsaved changes, or while an image is uploading, asks first.
- The shot list and the script's shot panel share one in-memory store per project, so a change in one shows in the other at once.
- Pages stay mounted when you switch tabs in the project, so they take fresh data from the server each time you come back (e.g. scenes written meanwhile). Every shot change bumps `projects.updated_at` and returns it; fresh data only replaces the local shots when nothing is waiting to save and it isn't older than the last change this tab saved. Scenes are always taken.

### Storyboard view

- Cards grouped by scene in the same order: a 16:9 image, label, status, size · type · movement · lens, and an editable description. Each group ends with an "Add shot" card.
- Drag cards to reorder or move them to another scene; **Alt+arrows** move the focused card; **Esc** leaves the description. The card menu matches the table's row menu.

### Images

- One image per shot. Add one by clicking an empty thumbnail, dropping a file on it, or pasting onto a shot (a paste into a text field with text in it stays a text paste). A local preview with a spinner shows while it uploads. Clicking a thumbnail opens a viewer with Replace and Remove; Remove only unlinks the image, with Undo.
- The browser re-encodes every image first: a full copy up to 2048 px on the long edge and a thumbnail up to 640 px, as WebP (JPEG where the browser can't encode WebP), with transparency flattened onto white. Sources up to 40 MB and 20,000 px are accepted; SVG isn't.
- **Upload:** a Server Action checks ownership and returns two presigned POST forms whose policy fixes the key and content type and caps the size (8 MB full, 1 MB thumbnail), valid for 10 minutes. The browser posts both files straight to S3, then a second action checks both objects are there with the right type and records the `assets` row. Confirming twice is harmless.
- **Display:** `/api/assets/[assetId]/[variant]` checks ownership and redirects to a signed S3 URL. URLs are signed at the start of each hour and valid for two, so the same URL (and the browser's cached copy) is reused all hour; the redirect is `private` and cached until the next hour starts.
- The bucket stays private. It needs a CORS rule allowing POST from the app's origin, and the app's IAM user needs `s3:PutObject` and `s3:GetObject` on the bucket's objects. Without the S3 settings the app still runs and says image uploads aren't set up.

### Script side panel

- On screens 1280 px and wider, the script page can show the shots of the scene the cursor is in: thumbnail, label (from the live scene number), status, specs and an editable description. Images can be added there the same ways.
- A field at the bottom adds a shot to that scene. If the scene was only just typed, the script is saved first, because shots can only belong to saved scenes.
- Open by default from 1536 px; the toggle in the toolbar is remembered in `localStorage`.
- The scene sidebar shows each scene's shot count.

### Export

CSV (built): one row per shot with scene number and heading, generated in the browser. Cells that start with `=`, `+`, `-` or `@` are prefixed with `'` so spreadsheets don't run them as formulas.

PDF in table or storyboard layout — whole project, per scene, or per shoot day (milestone 5).

## 7a. Notes

Built (basic version):

- A Notes section in the project nav, listed first. Two panes: the notes list (most recently edited first, with title, time and a preview) and the open note. Phones show one pane at a time.
- The first line is the title, as in most notes apps, and is set larger. Rich text: headings, bold, italic, bulleted and numbered lists, checklists, quotes, code, links (pasted URLs link themselves). Markdown shortcuts work (`# `, `- `, `1. `, `[ ] `, `> `).
- "New Note" opens an empty note at once; nothing is written until there's something in it. A note left empty is removed when you leave it.
- Autosave works like the script's: debounced, offline backup in `localStorage`, restored after a crash, revision check against other tabs. A stale backup is offered back as a new note.
- Delete with Undo (soft delete). The open note is in the URL (`?note=`).
- The page loads every note of the project at once, so switching is instant. Revisit if projects end up with hundreds.
- **PDF:** "Download PDF" in a note's menu, and "Download All as PDF" above the list (empty notes left out, each note from a new page). Made in the browser like the script's PDF, in Geist like the app, laid out as the editor shows it: first line as the title, the project's name and page numbers at the foot. Paper size follows the browser's region (US Letter or A4); includes edits that haven't saved yet.

Next:

- **Draft from Notes**: plan and write a first draft from the notes, alongside "Draft from Details".
- **Turn into shots**: select lines in a note and get standalone shots, for projects that skip the script.
- Pinned notes given to the AI as context, the way Details are.
- A notes panel beside the script and the shot list, for quick capture without leaving the page.

## 8. Shoot-day planning

- Create days (label, optional date, call and wrap time).
- A day contains setups in order; a setup contains shots in order.
- Left: unscheduled shots, filterable by scene, location, INT/EXT and time of day. Right: days and setups. Drag shots into setups.
- Totals per setup and per day, with a warning when a day runs past wrap.
- Shot labels (12A) stay the same in shooting order.
- **On-set view:** a phone-friendly page for one day, in shooting order, with large buttons to mark each shot shot or omitted.

## 9. App structure (Next.js 16)

```text
app/
  (auth)/sign-in/page.tsx
  (app)/projects/page.tsx                              project list
  (app)/projects/[projectId]/layout.tsx                project nav: Notes · Script · Shots · Schedule · Details
  (app)/projects/[projectId]/notes/page.tsx            notes list and editor (?note=)
  (app)/projects/[projectId]/script/page.tsx           editor
  (app)/projects/[projectId]/script/versions/page.tsx  history and compare (?a=&b=)
  (app)/projects/[projectId]/shots/page.tsx            table or storyboard
  (app)/projects/[projectId]/schedule/page.tsx         shoot-day planning
  (app)/projects/[projectId]/schedule/[dayId]/page.tsx on-set view
  (app)/projects/[projectId]/details/page.tsx          header image, title, type, story and format details
  (app)/settings/project-types/page.tsx                add, rename, re-icon and delete project types
  api/auth/[...all]/route.ts                           Better Auth
  api/scripts/[scriptId]/draft/route.ts                autosave
  api/projects/[projectId]/notes/[noteId]/route.ts     note autosave; the first save creates the note
  api/assets/[assetId]/[variant]/route.ts              image redirect to S3 (owner only)
  api/projects/[projectId]/export/route.ts             PDF, Fountain
  api/projects/[projectId]/ai/{write,outline,chat,complete}/route.ts
                                                       AI writing (streamed lines, outline, assistant, inline)
lib/
  ai/            models, prompts, the script context builder, request schemas, OpenRouter provider
  db/            Drizzle schema and client
  dal/           server-only data access; every function checks session and ownership
  screenplay/    TipTap nodes, keyboard flow, sceneId plugin, scene extraction,
                 Fountain import/export — shared by browser and server
  notes/         note schema (TipTap StarterKit and checklists), plain-text rendering, PDF
  draft-saver.ts autosave for the script and notes: debounce, retry, localStorage backup
  shots/         shot types, label numbering, presets, grouping, CSV, the client shot store,
                 image uploader
  images/        browser-side resizing and encoding
  storage/       server-only S3 client: presigned POSTs, object checks, signed URLs
  diff/          scene-level and word-level comparison
proxy.ts         optimistic redirect to sign-in only (Next 16's name for middleware)
```

- Mutations are Server Actions that call the data access layer, except autosave. Image bytes go from the browser straight to S3; the upload actions only sign and confirm.
- Scene extraction runs on the server from the saved JSON, using the same code as the editor. The server's result is the source of truth for the `scenes` table.

## 10. Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16, React 19, Tailwind 4 (already set up) |
| UI components | shadcn/ui |
| Database | Postgres 18 on AWS RDS, verified SSL using the bundled RDS CA (`certs/rds-global-bundle.pem`) |
| ORM / migrations | Drizzle, drizzle-kit |
| Auth | Better Auth, email and password |
| Editor | TipTap |
| Shot table | Hand-rolled CSS grid, native HTML drag and drop, fractional-indexing |
| Fountain import | fountain-js |
| Diffs | diff (jsdiff) |
| Images | Amazon S3, private bucket, AWS SDK v3 |
| PDF | @react-pdf/renderer |
| AI | AI SDK (`ai`, `@ai-sdk/react`) with the OpenRouter provider; streamdown for the assistant's replies |
| Validation | zod |
| Tests | Vitest — scene extraction, sceneId plugin, Fountain round-trip, diff, shot numbering, shot store, image uploader, AI suggestions, inline suggestions, script context, autosave, note text, note PDF |

S3 settings come from `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` (not the `AWS_*` names, which Vercel reserves). `S3_ENDPOINT` is optional, for S3-compatible services such as MinIO, R2 or a local fake. AI writing needs `OPENROUTER_API_KEY`; the AI SDK packages need Node 22 or later.

## 11. Milestones

1. **Foundation** — database, auth, projects (create, rename, archive), app shell.
2. **Script editor** — element nodes, keyboard flow, autocomplete, page layout, autosave with revision check, sceneId plugin, scene extraction, scene sidebar, title page, Fountain export.
3. **Versions** — save version, history, read-only view, compare (scene and word level), restore with safety snapshot, Fountain import.
4. **Shot list**
   - Pass 1 (done): table view, inline editing, reordering, numbering, unlinked shots, "scene changed" badges, CSV export.
   - Pass 2 (done): images on S3, storyboard view, script side panel, shot counts in the scene sidebar.
5. **Planning** — shoot days, setups, drag-to-schedule, time totals, PDF export, on-set view.
6. **Polish** — pagination and eighths, screenplay PDF export, lock scene numbers, revision colors.

Added between 4 and 5: **Notes** (see 7a). Basic version done: notes section, editor, autosave. Next: Draft from Notes, Turn into shots.

After v1, if it becomes a product: project members and roles, share links, comments, real-time co-editing (Yjs), script breakdown, call sheets, Final Draft import.

Write a real short script in the editor after milestone 2, before building on top of it. The editor is what you'll spend the most time in, and problems there are cheapest to fix early.

## 12. Risks

- **Editor effort.** Keyboard behavior, paste handling and page layout will take longer than they look. Milestone 2 is the largest.
- **Scene ID edge cases** (paste, split, merge, undo, restore). Covered by unit tests on the plugin and extraction, which are pure functions.
- **Pagination accuracy.** Approximate is acceptable for planning; don't promise identical page breaks to Final Draft.
- **Full-document autosave** is fine for one user. Revisit when adding collaboration.

## 13. Open questions (defaults in bold)

1. ~~Database hosting~~ — decided: AWS RDS.
2. ~~Image storage~~ — decided: Amazon S3.
3. Sign-in: **email and password**, magic link, or Google?
4. Deployment: **Vercel**, or somewhere else?
5. One script per project — OK? (A series would be one project per episode.)
