import { cn } from "cn";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { getSharedView, type SharedDocument } from "@/lib/dal/shares";
import { noteSchema } from "@/lib/notes/schema";
import { screenplaySchema } from "@/lib/screenplay/editor/schema";
import { courierPrime } from "@/lib/screenplay/font";
import type { TitlePage } from "@/lib/screenplay/types";
import { renderDoc } from "@/lib/share/render";

import { PasswordGate } from "./password-gate";
import { ShareView } from "./share-view";

import "@/app/(app)/projects/[projectId]/(workspace)/script/screenplay.css";
import "@/app/(app)/projects/[projectId]/notes/notes.css";
import "./share.css";

export async function generateMetadata({ params }: PageProps<"/s/[token]">): Promise<Metadata> {
  const { token } = await params;
  const view = await getSharedView(token);
  // A password-protected link doesn't give its title away, even to link previews.
  const title =
    view.status === "ok"
      ? view.document.title
      : view.status === "locked"
        ? `Shared ${view.kind === "script" ? "Script" : "Note"}`
        : "Link Not Available";
  return { title, robots: { index: false, follow: false } };
}

// Outside the (app) group: people with the link have no account, sidebar or header.
export default function SharedPage({ params }: PageProps<"/s/[token]">) {
  return (
    <div className={cn("flex min-h-svh flex-col", courierPrime.variable)}>
      <Suspense fallback={<SharedSkeleton />}>
        <SharedLoader params={params} />
      </Suspense>
    </div>
  );
}

async function SharedLoader({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getSharedView(token);
  if (view.status === "not_found") notFound();
  if (view.status === "locked") return <PasswordGate token={token} kind={view.kind} />;

  const { document } = view;
  return (
    <ShareView
      key={token}
      token={token}
      kind={document.kind}
      title={document.title}
      projectTitle={view.projectTitle}
      owner={view.owner}
      enabled={view.enabled}
      allowComments={view.allowComments}
      comments={view.comments}
    >
      {document.kind === "script" ? <ScriptBody document={document} /> : <NoteBody document={document} />}
    </ShareView>
  );
}

// The editors' stylesheets hang off .ProseMirror and .note-content, so the same markup,
// rendered read-only here, looks the same.
function ScriptBody({ document }: { document: Extract<SharedDocument, { kind: "script" }> }) {
  const doc = screenplaySchema().nodeFromJSON(document.draft);
  return (
    <>
      {hasTitlePage(document.titlePage) && <TitleSheet title={document.title} titlePage={document.titlePage} />}
      <article aria-label="Script" className="screenplay-page">
        <div className="ProseMirror" data-share-body>
          {renderDoc(doc)}
        </div>
      </article>
    </>
  );
}

function hasTitlePage(titlePage: TitlePage) {
  return Object.values(titlePage).some((value) => typeof value === "string" && value.trim());
}

/** Laid out like the PDF's: title a third of the way down, contact and draft date at the foot. */
function TitleSheet({ title, titlePage }: { title: string; titlePage: TitlePage }) {
  const credit = titlePage.credit || (titlePage.author ? "Written by" : undefined);
  return (
    <section aria-label="Title Page" className="screenplay-page share-title-page">
      <div className="share-title-main">
        <p>{title}</p>
        {credit && <p>{credit}</p>}
        {titlePage.author && <p>{titlePage.author}</p>}
        {titlePage.source && <p className="share-title-source">{titlePage.source}</p>}
      </div>
      <div className="share-title-foot">
        <p>{titlePage.contact}</p>
        <p>{titlePage.draftDate}</p>
      </div>
    </section>
  );
}

function NoteBody({ document }: { document: Extract<SharedDocument, { kind: "note" }> }) {
  const doc = noteSchema().nodeFromJSON(document.content);
  return (
    <article aria-label="Note" className="mx-auto w-full max-w-2xl px-6 py-8 sm:px-10 sm:py-10">
      <div className="note-content" data-share-body>
        {renderDoc(doc)}
      </div>
    </article>
  );
}

function SharedSkeleton() {
  return (
    <div aria-hidden className="flex flex-1 flex-col">
      <div className="flex h-12 items-center gap-3 border-b px-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="mx-auto w-full max-w-2xl space-y-3 px-6 py-10">
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}
