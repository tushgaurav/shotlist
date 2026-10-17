import type { KeyboardEvent } from "react";

const CONTROL = "[data-cell-control]";
const ROW = "[data-shot-row]";

type GridActions = {
  /** Enter on the last shot of a group. */
  addAfter: (shotId: string, field: string) => void;
  nudge: (shotId: string, direction: -1 | 1, field: string) => void;
};

/**
 * Spreadsheet keys for the shot grid. Arrows leave a text cell only when the caret is
 * already at its edge, so they still move the caret inside text.
 */
export function handleGridKeyDown(event: KeyboardEvent<HTMLElement>, actions: GridActions) {
  if (event.defaultPrevented || event.nativeEvent.isComposing) return;
  const control = event.target as HTMLElement;
  if (!control.matches(CONTROL)) return;
  const row = control.closest<HTMLElement>(ROW);
  const field = control.closest<HTMLElement>("[data-col]")?.dataset.col;
  if (!row || !field) return;

  const { key, altKey, shiftKey, metaKey, ctrlKey } = event;
  if (metaKey || ctrlKey) return;
  const shotId = row.dataset.shotRow!;

  if (altKey) {
    if (!shiftKey && (key === "ArrowUp" || key === "ArrowDown")) {
      event.preventDefault();
      actions.nudge(shotId, key === "ArrowUp" ? -1 : 1, field);
    }
    return;
  }

  if ((key === "ArrowUp" || key === "ArrowDown") && !shiftKey) {
    const direction = key === "ArrowUp" ? -1 : 1;
    if (!atVerticalEdge(control, direction)) return;
    event.preventDefault();
    const rows = [...event.currentTarget.querySelectorAll<HTMLElement>(ROW)];
    const next = rows[rows.indexOf(row) + direction];
    if (next) focusIn(next, field);
  } else if ((key === "ArrowLeft" || key === "ArrowRight") && !shiftKey) {
    const direction = key === "ArrowLeft" ? -1 : 1;
    if (!atHorizontalEdge(control, direction)) return;
    const controls = [...row.querySelectorAll<HTMLElement>(CONTROL)];
    const next = controls[controls.indexOf(control) + direction];
    if (next) {
      event.preventDefault();
      focusControl(next);
    }
  } else if (key === "Enter" && !shiftKey) {
    event.preventDefault();
    const next = row.nextElementSibling;
    if (next instanceof HTMLElement && next.matches(ROW)) focusIn(next, field);
    else actions.addAfter(shotId, field);
  } else if (key === "Escape") {
    control.blur();
  }
}

export function focusShotCell(root: HTMLElement | null, shotId: string, field: string) {
  const row = root?.querySelector<HTMLElement>(`[data-shot-row="${CSS.escape(shotId)}"]`);
  if (row) focusIn(row, field);
}

function focusIn(row: HTMLElement, field: string) {
  focusControl(
    row.querySelector<HTMLElement>(`[data-col="${CSS.escape(field)}"] ${CONTROL}`) ??
      row.querySelector<HTMLElement>(CONTROL),
  );
}

function focusControl(control: HTMLElement | null) {
  if (!control) return;
  control.focus();
  if (isText(control)) {
    const end = control.value.length;
    control.setSelectionRange(end, end);
  }
}

function isText(el: HTMLElement): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === "text");
}

function atVerticalEdge(control: HTMLElement, direction: -1 | 1) {
  if (!(control instanceof HTMLTextAreaElement)) return true;
  const { value, selectionStart, selectionEnd } = control;
  return direction === -1
    ? !value.slice(0, selectionStart).includes("\n")
    : !value.slice(selectionEnd).includes("\n");
}

function atHorizontalEdge(control: HTMLElement, direction: -1 | 1) {
  if (!isText(control)) return true;
  const { value, selectionStart, selectionEnd } = control;
  if (selectionStart !== selectionEnd) return false;
  return direction === -1 ? selectionStart === 0 : selectionEnd === value.length;
}
