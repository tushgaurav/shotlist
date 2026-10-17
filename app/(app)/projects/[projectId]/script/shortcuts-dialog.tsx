"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { shortcutLabel, useIsMac } from "@/lib/keyboard";
import { ELEMENT_LABELS, SHORTCUT_ORDER } from "@/lib/screenplay/elements";

type Row = { keys: string[][]; action: string };

export function ShortcutsDialog({ children }: { children: React.ReactNode }) {
  const isMac = useIsMac();

  const sections: { title: string; rows: Row[] }[] = [
    {
      title: "Writing",
      rows: [
        { keys: [["Enter"]], action: "Start the next element, e.g. character → dialogue" },
        { keys: [["Enter"]], action: "On an empty line: change it to action" },
        { keys: [["Tab"], ["Shift", "Tab"]], action: "Cycle the element type forwards / backwards" },
        ...SHORTCUT_ORDER.map((type, index) => ({
          keys: [["Mod", "Alt", String(index + 1)]],
          action: ELEMENT_LABELS[type],
        })),
      ],
    },
    {
      title: "Suggestions",
      rows: [
        { keys: [["Tab"], ["→"], ["Enter"]], action: "Accept a character, location or time suggestion" },
        { keys: [["Esc"]], action: "Dismiss the suggestion" },
      ],
    },
    {
      title: "Formatting",
      rows: [
        { keys: [["Mod", "B"], ["Mod", "I"], ["Mod", "U"]], action: "Bold, italic, underline" },
        { keys: [["Mod", "Z"], ["Mod", "Shift", "Z"]], action: "Undo, redo" },
      ],
    },
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Start a line with INT. or EXT. for a scene heading. Type ( under a character for a
            parenthetical. An all-caps line ending in TO: becomes a transition when you press Enter.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          {sections.map((section) => (
            <section key={section.title}>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {section.title}
              </h3>
              <dl className="flex flex-col gap-1.5 text-sm">
                {section.rows.map((row, index) => (
                  <div key={index} className="flex items-baseline justify-between gap-4">
                    <dt className="text-foreground/90">{row.action}</dt>
                    <dd className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      {row.keys.map((combo, comboIndex) => (
                        <KbdGroup key={comboIndex}>
                          {comboIndex > 0 && <span className="mr-1">/</span>}
                          <Kbd>{shortcutLabel(combo, isMac)}</Kbd>
                        </KbdGroup>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
