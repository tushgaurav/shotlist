<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/shotlist.svg">
    <img src="public/shotlist-black.svg" alt="shotlist" width="280">
  </picture>
</p>

<p align="center">
  <b>Write the script. Plan the shots. Wrap on time.</b><br>
  <sub>A screenplay editor and a shot list that actually talk to each other.</sub>
</p>

---

Your script lives in one app, your shot list lives in a spreadsheet, and the second someone rewrites scene 12 they stop agreeing. Shotlist pins every shot to its scene with a permanent ID. Renumber, rename, cut and paste all you want. The shots stay with their scene, and when the scene's text changes you get a **scene changed** badge so you know to check them.

## In the can

- **Screenplay editor**: real formatting in Courier Prime, Enter/Tab keyboard flow, `INT.`/`EXT.` auto-detect, autocomplete for characters and locations.
- **Autosave that won't eat your pages**: keeps a local copy when you're offline, refuses stale saves from other tabs, exports to Fountain.
- **Shot list**: a spreadsheet-style table *or* storyboard cards, grouped by scene and labeled 12A, 12B, 12C. It skips I and O, like a real slate.
- **Reference frames**: drop, paste or click to add an image to any shot. The browser shrinks it, then it goes straight to your own S3 bucket.
- **Shots next to the script**: a side panel shows the shots for whatever scene your cursor is in, and you can add more from there.
- **AI writing that knows your project**: press ⌘K to write or rewrite at the cursor, draft a whole script from your logline and synopsis, chat with an assistant that proposes edits, or Tab through inline suggestions. It reads your project details and the script, and nothing lands until you accept it.
- **CSV export** for the AD who lives in Sheets.

## On the call sheet

Script versions and diffs · shoot days and setups · PDF export · a phone-friendly on-set view. The whole plan is in [`docs/spec.md`](docs/spec.md).

## Rolling

You need Node 22+ and a Postgres database. S3 is optional and only needed for shot images. AI writing is optional too: set `OPENROUTER_API_KEY` (from [openrouter.ai/keys](https://openrouter.ai/keys)) to turn it on.

```bash
git clone git@github.com:tushgaurav/shotlist.git && cd shotlist
npm install
cp .env.example .env.local   # set DATABASE_URL and BETTER_AUTH_SECRET at minimum
npm run db:migrate
npm run dev
```

Open [localhost:3000](http://localhost:3000) and create your account. Then set `DISABLE_SIGNUP=true` so nobody else can.

`npm test` runs the Vitest suite and `npm run typecheck` runs the type checker.

## Built with

Next.js 16 · React 19 · TipTap · Drizzle + Postgres · Better Auth · Tailwind 4 + shadcn/ui · S3 · AI SDK + OpenRouter

<p align="center"><sub>That's a wrap.</sub></p>
