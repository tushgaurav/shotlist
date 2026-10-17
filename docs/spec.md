# Shotlist — Product & Technical Spec

Status: draft for review · v0.1 · Oct 17, 2026

## 1. What we're building

A web app for planning video productions. Version 1 covers two features that are deliberately connected:

1. **Scripts** — write a properly formatted screenplay in the browser, save named versions, compare and restore them.
2. **Shot lists** — plan shots for each scene of the script, then organise them into shoot days.

The connection is the point: every shot belongs to a scene, shots stay attached to their scene through edits and versions, and when the script changes you can see which shots are affected.

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
- A new shot gets the next unused letter in its scene. Letters I and O are skipped (they read as 1 and 0 on a slate).
- Reordering shots does **not** relabel them, because people refer to shot numbers in notes and on slates. An explicit "Renumber shots in this scene" action exists.
- Standalone shots use a free-text label (e.g. "BR1").

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
  kind                text        -- short | feature | commercial | music_video | other
  created_at          timestamptz
  updated_at          timestamptz
  archived_at         timestamptz null

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
  id                  text pk
  project_id          text → projects.id
  scene_id            text null   -- with the project's script, → scenes (script_id, id); null = standalone shot
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
  subjects            text null   -- who or what is in frame
  equipment           text null
  sound               text null   -- sync, MOS, notes
  est_shoot_minutes   integer null
  status              text        -- planned | shot | omitted
  notes               text null
  image_id            text → assets.id, null
  setup_id            text → setups.id, null   -- null = not scheduled
  setup_position      text null   -- order within its setup (shooting order)
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

assets
  id                  text pk
  project_id          text → projects.id
  storage_key         text
  content_type        text
  width               integer null
  height              integer null
  byte_size           integer
  created_at          timestamptz
```

A scene shows a **"scene changed"** badge in the shot list when `content_hash ≠ shots_reviewed_hash`. Editing that scene's shots, or clicking "Mark reviewed", updates `shots_reviewed_hash`.

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

Rendered as pages on screen in Courier Prime 12 pt with standard screenplay margins, so it looks like the printed page. A sidebar lists scenes (number, heading, shot count); click to jump, drag to move a whole scene. A side panel shows the shot list for the scene the cursor is in.

### Saving

- Autosave sends the full document and `draft_revision` to a Route Handler (`PUT /api/scripts/[scriptId]/draft`). A Route Handler rather than a Server Action because Server Actions are capped at 1 MB per request by default, and a long script's JSON can approach that.
- If `draft_revision` doesn't match (the script was saved from another tab), the save is rejected and the editor asks you to reload.
- Unsaved changes are mirrored to `localStorage` so a crash or lost connection doesn't lose work.
- Status indicator: "Saving…", "Saved", "Offline — changes kept on this device", "Couldn't save — changes kept on this device".
- On the next visit, a local copy based on the current revision is restored automatically. A local copy based on an older revision isn't merged; it's offered as a Fountain download.

### Pagination (later)

Courier is monospaced, so pagination is deterministic line counting: standard element widths, about 55 lines per page, dialogue split across pages with (MORE) and (CONT'D). This gives page count and scene length in eighths of a page, which schedules use. Approximate is fine for planning; exact parity with Final Draft is not a goal.

## 6. Versions UI

- **History:** list of versions (number, name, date). Actions: view read-only, compare, restore.
- **Compare:** choose A and B (default: latest version vs current draft). Left column: scenes with added / removed / changed / moved badges. Right: word-level diff of the selected scene. Header: "N scenes changed · M shots affected", linking to those shots.

## 7. Shot list

### Table view (default)

- Grouped by scene in story order. Each group header shows scene number, heading, shot count and the "scene changed" badge.
- Spreadsheet-style: inline editing, arrow-key navigation, Enter on the last row adds a shot.
- Drag to reorder within a scene or move a shot to another scene.
- Show/hide columns; column choice remembered per project.
- Standalone shots in a group at the end. Unlinked shots (scene removed) in a group at the top with a warning.

### Storyboard view

Cards in the same order: image, label, size and movement, description. Images can be uploaded, dropped or pasted.

### Export

CSV, and PDF in table or storyboard layout — whole project, per scene, or per shoot day.

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
  (app)/projects/[projectId]/layout.tsx                project nav: Script · Shots · Schedule
  (app)/projects/[projectId]/script/page.tsx           editor
  (app)/projects/[projectId]/script/versions/page.tsx  history and compare (?a=&b=)
  (app)/projects/[projectId]/shots/page.tsx            table or storyboard (?view=)
  (app)/projects/[projectId]/schedule/page.tsx         shoot-day planning
  (app)/projects/[projectId]/schedule/[dayId]/page.tsx on-set view
  api/auth/[...all]/route.ts                           Better Auth
  api/scripts/[scriptId]/draft/route.ts                autosave
  api/uploads/route.ts                                 signed upload URLs
  api/projects/[projectId]/export/route.ts             CSV, PDF, Fountain
lib/
  db/            Drizzle schema and client
  dal/           server-only data access; every function checks session and ownership
  screenplay/    TipTap nodes, keyboard flow, sceneId plugin, scene extraction,
                 Fountain import/export — shared by browser and server
  diff/          scene-level and word-level comparison
proxy.ts         optimistic redirect to sign-in only (Next 16's name for middleware)
```

- Mutations are Server Actions that call the data access layer, except autosave and uploads.
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
| Shot table | TanStack Table, dnd-kit, fractional-indexing |
| Fountain import | fountain-js |
| Diffs | diff (jsdiff) |
| Images | Cloudflare R2 (S3-compatible) |
| PDF | @react-pdf/renderer |
| Validation | zod |
| Tests | Vitest — scene extraction, sceneId plugin, Fountain round-trip, diff, shot numbering |

## 11. Milestones

1. **Foundation** — database, auth, projects (create, rename, archive), app shell.
2. **Script editor** — element nodes, keyboard flow, autocomplete, page layout, autosave with revision check, sceneId plugin, scene extraction, scene sidebar, title page, Fountain export.
3. **Versions** — save version, history, read-only view, compare (scene and word level), restore with safety snapshot, Fountain import.
4. **Shot list** — table view, inline editing, reordering, numbering, images, storyboard view, unlinked shots, "scene changed" badges, script side panel, CSV export.
5. **Planning** — shoot days, setups, drag-to-schedule, time totals, PDF export, on-set view.
6. **Polish** — pagination and eighths, screenplay PDF export, lock scene numbers, revision colors.

After v1, if it becomes a product: project members and roles, share links, comments, real-time co-editing (Yjs), script breakdown, call sheets, Final Draft import.

Write a real short script in the editor after milestone 2, before building on top of it. The editor is what you'll spend the most time in, and problems there are cheapest to fix early.

## 12. Risks

- **Editor effort.** Keyboard behavior, paste handling and page layout will take longer than they look. Milestone 2 is the largest.
- **Scene ID edge cases** (paste, split, merge, undo, restore). Covered by unit tests on the plugin and extraction, which are pure functions.
- **Pagination accuracy.** Approximate is acceptable for planning; don't promise identical page breaks to Final Draft.
- **Full-document autosave** is fine for one user. Revisit when adding collaboration.

## 13. Open questions (defaults in bold)

1. ~~Database hosting~~ — decided: AWS RDS.
2. Image storage: **Cloudflare R2**, Vercel Blob, or UploadThing?
3. Sign-in: **email and password**, magic link, or Google?
4. Deployment: **Vercel**, or somewhere else?
5. One script per project — OK? (A series would be one project per episode.)
