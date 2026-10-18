"use client";

import type { Editor } from "@tiptap/core";
import { DownloadIcon } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadBlob, downloadText, safeFileName } from "@/lib/download";
import { toFountain } from "@/lib/screenplay/fountain";
import { layoutScreenplay, PAPER_SIZES, type PaperSize } from "@/lib/screenplay/pagination";
import type { ScreenplayDocJSON, TitlePage } from "@/lib/screenplay/types";
import { useLocalStorage, writeLocalStorage } from "@/lib/use-local-storage";

const PDF_OPTIONS_KEY = "shotlist:script-pdf";

/** Where US Letter is the usual paper size; A4 everywhere else. */
const LETTER_REGIONS = new Set(["US", "CA", "MX", "PH", "CL", "CO", "VE", "PR", "GT", "CR", "PA", "DO", "SV", "NI"]);

type PdfOptions = { paper: PaperSize; titlePage: boolean; sceneNumbers: boolean };

type Props = {
  editor: Editor | null;
  projectTitle: string;
  titlePage: TitlePage;
};

export function ExportMenu({ editor, projectTitle, titlePage }: Props) {
  const [pdfOpen, setPdfOpen] = useState(false);
  const fileName = safeFileName(projectTitle, "Script");
  const cover = exportTitlePage(titlePage, projectTitle);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={!editor}>
            <DownloadIcon data-icon="inline-start" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={() => setPdfOpen(true)}>PDF…</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => editor && downloadText(toFountain(currentDoc(editor), cover), `${fileName}.fountain`)}
          >
            Fountain
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {editor && (
        <Dialog open={pdfOpen} onOpenChange={setPdfOpen}>
          <DialogContent className="sm:max-w-md">
            <PdfForm editor={editor} cover={cover} fileName={fileName} onDone={() => setPdfOpen(false)} />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function PdfForm({
  editor,
  cover,
  fileName,
  onDone,
}: {
  editor: Editor;
  cover: TitlePage;
  fileName: string;
  onDone: () => void;
}) {
  const [options, setOptions] = usePdfOptions();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  // The dialog is modal, so the script can't change while it's open.
  const pageCount = useMemo(
    () => layoutScreenplay(currentDoc(editor), { paper: options.paper }).pages.length,
    [editor, options.paper],
  );

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    startTransition(async () => {
      try {
        const layout = layoutScreenplay(currentDoc(editor), {
          paper: options.paper,
          sceneNumbers: options.sceneNumbers,
          titlePage: options.titlePage ? cover : undefined,
        });
        const { renderScreenplayPdf } = await import("@/lib/screenplay/pdf");
        const blob = await renderScreenplayPdf(layout, { title: cover.title || fileName, author: cover.author });
        downloadBlob(blob, `${fileName}.pdf`);
        onDone();
      } catch (cause) {
        console.error(cause);
        setError("Couldn't create the PDF. Check your connection and try again.");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle>Export PDF</DialogTitle>
        <DialogDescription>
          {pageCount} {pageCount === 1 ? "page" : "pages"}
          {options.titlePage && ", plus the title page"}. Includes changes that haven&apos;t saved yet.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="pdf-paper">Paper Size</FieldLabel>
          <Select value={options.paper} onValueChange={(paper) => setOptions({ ...options, paper: paper as PaperSize })}>
            <SelectTrigger id="pdf-paper" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PAPER_SIZES).map(([value, { label }]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id="pdf-title-page"
            checked={options.titlePage}
            onCheckedChange={(checked) => setOptions({ ...options, titlePage: checked === true })}
          />
          <FieldLabel htmlFor="pdf-title-page">Title Page</FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id="pdf-scene-numbers"
            checked={options.sceneNumbers}
            onCheckedChange={(checked) => setOptions({ ...options, sceneNumbers: checked === true })}
          />
          <FieldContent>
            <FieldLabel htmlFor="pdf-scene-numbers">Scene Numbers</FieldLabel>
            <FieldDescription>In both margins, as in a shooting script.</FieldDescription>
          </FieldContent>
        </Field>
        <FieldError>{error}</FieldError>
      </FieldGroup>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating PDF…" : "Download PDF"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function currentDoc(editor: Editor) {
  return editor.getJSON() as ScreenplayDocJSON;
}

function usePdfOptions() {
  const raw = useLocalStorage(PDF_OPTIONS_KEY);
  const options = useMemo(() => parsePdfOptions(raw), [raw]);
  return [options, (next: PdfOptions) => writeLocalStorage(PDF_OPTIONS_KEY, JSON.stringify(next))] as const;
}

function parsePdfOptions(raw: string | null): PdfOptions {
  let saved: Partial<PdfOptions> = {};
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") saved = parsed;
  } catch {
    // A damaged value just falls back to the defaults.
  }
  return {
    paper: saved.paper === "letter" || saved.paper === "a4" ? saved.paper : defaultPaper(),
    titlePage: saved.titlePage !== false,
    sceneNumbers: saved.sceneNumbers === true,
  };
}

function defaultPaper(): PaperSize {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    return region && !LETTER_REGIONS.has(region) ? "a4" : "letter";
  } catch {
    return "letter";
  }
}

function exportTitlePage(titlePage: TitlePage, projectTitle: string): TitlePage {
  return {
    ...titlePage,
    title: titlePage.title || projectTitle,
    credit: titlePage.credit || (titlePage.author ? "Written by" : undefined),
  };
}
