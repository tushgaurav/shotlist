/** Where the reader's eyes rest, as a share of the screen height. The list's top padding matches. */
export const READING_LINE = 0.35;

// scrollTop can be whole pixels, so a line scrolled onto the reading line may stop a fraction short.
const SLOP_PX = 1;

type Anchor = { block: number; fraction: number };

type Events = {
  onScene: (sceneId: string | null) => void;
  onEnd: () => void;
};

/**
 * Scrolls the teleprompter at a steady reading pace, and keeps the reader's place when the text
 * reflows (resize, rotation, character filter, reloaded script).
 *
 * Expects a scroll container whose list items are direct children of `list`, with the container
 * as their offsetParent. Items carry `data-block` and `data-scene`; reading text also has
 * `data-words`, and scene headings `data-heading`.
 */
export class Autoscroll {
  private scroller: HTMLElement | null = null;
  private list: HTMLElement | null = null;
  // Kept as a float: scrollTop rounds, and at reading speed a frame moves less than a pixel.
  private position = 0;
  private anchor: Anchor | null = null;
  private pixelsPerWord = 0;
  private wpm = 0;
  private frame = 0;
  private trackFrame = 0;

  constructor(private readonly events: Events) {}

  attach(scroller: HTMLElement, list: HTMLElement) {
    this.scroller = scroller;
    this.list = list;

    const onScroll = () => {
      if (this.trackFrame) return;
      this.trackFrame = requestAnimationFrame(() => {
        this.trackFrame = 0;
        this.track();
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(() => this.reflow());
    observer.observe(scroller);
    observer.observe(list);

    return () => {
      scroller.removeEventListener("scroll", onScroll);
      observer.disconnect();
      this.pause();
      cancelAnimationFrame(this.trackFrame);
      this.trackFrame = 0;
      this.scroller = this.list = null;
    };
  }

  setSpeed(wpm: number) {
    this.wpm = wpm;
  }

  /** Re-measures the pace and puts the reader's place back on the reading line. */
  reflow() {
    const { scroller, list } = this;
    if (!scroller || !list) return;
    this.pixelsPerWord = measurePace(list);
    const top = this.anchorTop(scroller, list);
    if (top !== null) this.scrollTo(top);
  }

  play() {
    if (this.frame) return;
    let last: number | null = null;
    const tick = (now: number) => {
      const scroller = this.scroller;
      if (!scroller) return;
      // Wheel, touch and keys move the page too; carry on from wherever it is now.
      if (Math.abs(scroller.scrollTop - this.position) >= 1) this.position = scroller.scrollTop;
      if (last !== null) {
        const seconds = Math.min(now - last, 100) / 1000;
        this.position += ((this.pixelsPerWord * this.wpm) / 60) * seconds;
      }
      last = now;

      const end = maxScroll(scroller);
      if (this.position >= end - 0.5) {
        this.scrollTo(end);
        this.frame = 0;
        this.events.onEnd();
        return;
      }
      scroller.scrollTop = this.position;
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  pause() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  atEnd() {
    return this.scroller ? this.scroller.scrollTop >= maxScroll(this.scroller) - 1 : false;
  }

  /** Moves by a share of the screen height; negative goes back. */
  nudge(screens: number) {
    if (!this.scroller) return;
    this.scrollTo(this.scroller.scrollTop + this.scroller.clientHeight * screens, !this.frame);
  }

  /** Puts a scene's heading on the reading line, or the top of the script for null. */
  jumpToScene(sceneId: string | null) {
    const { scroller, list } = this;
    if (!scroller || !list) return;
    if (sceneId === null) return this.scrollTo(0, !this.frame);
    const heading = items(list).find((item) => item.dataset.heading === sceneId);
    if (heading) this.scrollTo(heading.offsetTop - readingOffset(scroller), !this.frame);
  }

  scrollTo(top: number, smooth = false) {
    const scroller = this.scroller;
    if (!scroller) return;
    this.position = Math.min(Math.max(top, 0), maxScroll(scroller));
    scroller.scrollTo({ top: this.position, behavior: smooth ? "smooth" : "instant" });
  }

  /** Remembers which line is on the reading line, and how far through it. */
  private track() {
    const { scroller, list } = this;
    if (!scroller || !list) return;
    const all = list.children;
    if (all.length === 0) {
      this.anchor = null;
      this.events.onScene(null);
      return;
    }
    const y = scroller.scrollTop + readingOffset(scroller);
    const item = all[lineAt(all, y + SLOP_PX)] as HTMLElement;
    const fraction = (y - item.offsetTop) / Math.max(item.offsetHeight, 1);
    this.anchor = { block: Number(item.dataset.block), fraction: Math.min(Math.max(fraction, 0), 1) };
    this.events.onScene(item.dataset.scene || null);
  }

  private anchorTop(scroller: HTMLElement, list: HTMLElement) {
    const anchor = this.anchor;
    if (!anchor) return null;
    // The anchored line may be gone (e.g. a name hidden by the filter); use the next one.
    const item = items(list).find((item) => Number(item.dataset.block) >= anchor.block);
    if (!item) return null;
    const fraction = Number(item.dataset.block) === anchor.block ? anchor.fraction : 0;
    return item.offsetTop + fraction * item.offsetHeight - readingOffset(scroller);
  }
}

function items(list: HTMLElement) {
  return Array.from(list.children) as HTMLElement[];
}

function readingOffset(scroller: HTMLElement) {
  return scroller.clientHeight * READING_LINE;
}

function maxScroll(scroller: HTMLElement) {
  return Math.max(scroller.scrollHeight - scroller.clientHeight, 0);
}

/** Index of the last item that starts at or above `y`; items are in document order. */
function lineAt(all: HTMLCollection, y: number) {
  let low = 0;
  let high = all.length - 1;
  let found = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((all[middle] as HTMLElement).offsetTop <= y) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/** Pixels of scrolling per spoken word, from the height of the reading text on screen. */
function measurePace(list: HTMLElement) {
  let height = 0;
  let words = 0;
  for (const item of list.querySelectorAll<HTMLElement>("[data-words]")) {
    height += item.offsetHeight;
    words += Number(item.dataset.words);
  }
  if (words > 0) return height / words;
  // Nothing to read: assume a line of reading text holds six words.
  return (parseFloat(getComputedStyle(list).lineHeight) || 40) / 6;
}
