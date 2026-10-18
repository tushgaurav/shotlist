"use client";

import { cn } from "cn";
import {
  ArrowLeftIcon,
  MaximizeIcon,
  MinimizeIcon,
  MinusIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RotateCwIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { TextRun } from "@/lib/screenplay/pagination";
import { prompterScript, type PrompterLine } from "@/lib/screenplay/prompter";
import type { ScreenplayDocJSON } from "@/lib/screenplay/types";
import { useLocalStorage, writeLocalStorage } from "@/lib/use-local-storage";

import { Autoscroll } from "./autoscroll";

import "./teleprompter.css";

const SPEED_KEY = "shotlist:prompter-wpm";
const characterKey = (projectId: string) => `shotlist:prompter-character:${projectId}`;

/** Words per minute. Presenters usually read at 130–160. */
const SPEED = { default: 140, min: 60, max: 300, step: 10 };
const COUNTDOWN_FROM = 3;
const CONTROLS_HIDE_MS = 2500;

type Mode = "paused" | "countdown" | "playing";
type Action = "toggle" | "back" | "up" | "down" | "slower" | "faster" | "start" | "fullscreen";

// Presentation clickers send PageDown/PageUp, or the arrow keys, for forward and back.
const KEY_ACTIONS: Record<string, Action> = {
  " ": "toggle",
  k: "toggle",
  PageDown: "toggle",
  ArrowRight: "toggle",
  PageUp: "back",
  ArrowLeft: "back",
  ArrowUp: "up",
  ArrowDown: "down",
  "-": "slower",
  "=": "faster",
  "+": "faster",
  Home: "start",
  f: "fullscreen",
};

type Props = { projectId: string; draft: ScreenplayDocJSON };

export function Teleprompter({ projectId, draft }: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [speed, setSpeed] = useSpeed();
  const [savedCharacter, setCharacter] = useCharacter(projectId);
  const fullscreen = useFullscreen();
  useWakeLock();

  const everyone = useMemo(() => prompterScript(draft), [draft]);
  // A saved name drops out if the character was renamed or cut.
  const character = savedCharacter && everyone.characters.includes(savedCharacter) ? savedCharacter : null;
  const script = useMemo(
    () => (character ? prompterScript(draft, character) : everyone),
    [draft, character, everyone],
  );

  const [mode, setMode] = useState<Mode>("paused");
  const [count, setCount] = useState(COUNTDOWN_FROM);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [autoscroll] = useState(() => new Autoscroll({ onScene: setSceneId, onEnd: () => setMode("paused") }));

  const scroller = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    if (!scroller.current || !list.current) return;
    return autoscroll.attach(scroller.current, list.current);
  }, [autoscroll]);
  useLayoutEffect(() => autoscroll.reflow(), [autoscroll, script]);
  useEffect(() => autoscroll.setSpeed(speed), [autoscroll, speed]);

  useEffect(() => {
    if (mode !== "playing") return;
    autoscroll.play();
    return () => autoscroll.pause();
  }, [autoscroll, mode]);

  useEffect(() => {
    if (mode !== "countdown") return;
    const timer = setTimeout(() => (count > 1 ? setCount(count - 1) : setMode("playing")), 1000);
    return () => clearTimeout(timer);
  }, [mode, count]);

  const empty = script.lines.length === 0;
  const toggle = () => {
    if (mode !== "paused") {
      setMode("paused");
    } else if (!empty) {
      if (autoscroll.atEnd()) autoscroll.scrollTo(0);
      setCount(COUNTDOWN_FROM);
      setMode("countdown");
    }
  };

  const run = (action: Action) => {
    switch (action) {
      case "toggle":
        return toggle();
      case "back":
        return autoscroll.nudge(-0.25);
      case "up":
        return autoscroll.nudge(-0.1);
      case "down":
        return autoscroll.nudge(0.1);
      case "slower":
        return setSpeed(speed - SPEED.step);
      case "faster":
        return setSpeed(speed + SPEED.step);
      case "start":
        setMode("paused");
        autoscroll.pause();
        return autoscroll.jumpToScene(null);
      case "fullscreen":
        return fullscreen.toggle();
    }
  };

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    // A focused control keeps its own keys.
    if (event.target instanceof Element && event.target.closest("a, button, input, select, textarea")) return;
    const action = KEY_ACTIONS[event.key];
    if (!action) return;
    event.preventDefault();
    if (event.repeat && (action === "toggle" || action === "fullscreen")) return;
    run(action);
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const reload = () => startRefresh(() => router.refresh());
  // Coming back from editing in another tab picks up what was saved there.
  const onVisibilityChange = useEffectEvent(() => {
    if (document.visibilityState === "visible" && mode === "paused") reload();
  });
  useEffect(() => {
    const listener = () => onVisibilityChange();
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  }, []);

  const [pointerMoved, setPointerMoved] = useState(false);
  const [hovering, setHovering] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  const onPointerMove = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    setPointerMoved(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setPointerMoved(false), CONTROLS_HIDE_MS);
  };
  const controlsShown = mode === "paused" || pointerMoved || hovering;

  return (
    <div
      className={cn("dark fixed inset-0 bg-black text-white [color-scheme:dark]", !controlsShown && "cursor-none")}
      onPointerMove={onPointerMove}
    >
      <div
        ref={scroller}
        aria-label="Script"
        className="relative h-full overflow-y-auto overscroll-none select-none [scrollbar-width:none]"
        onClick={toggle}
      >
        <div className="prompter">
          <ol ref={list}>
            {script.lines.map((line) => (
              <Line key={line.block} line={line} />
            ))}
          </ol>
          {!empty && <p className="prompter-end">End of script</p>}
        </div>
      </div>

      {empty && (
        <div className="pointer-events-none fixed inset-0 grid place-content-center gap-2 p-6 text-center">
          <p className="text-xl font-medium">Nothing to read yet</p>
          <p className="text-white/60">Write some dialogue in the script, then reload.</p>
        </div>
      )}

      {mode === "countdown" && (
        <div aria-live="assertive" className="pointer-events-none fixed inset-0 grid place-items-center bg-black/50">
          <span
            key={count}
            className="animate-in text-[min(40vw,40vh)] leading-none font-semibold tabular-nums duration-300 fade-in zoom-in-75"
          >
            {count}
          </span>
        </div>
      )}

      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-linear-to-t from-black via-black/85 to-transparent p-3 pt-12 transition-opacity duration-300 sm:p-5 sm:pt-16",
          controlsShown ? "opacity-100" : "opacity-0 focus-within:opacity-100",
        )}
      >
        {!empty && script.words === 0 && (
          <p className="text-sm text-white/60">
            {character ? `${character} has no dialogue` : "This script has no dialogue"}, so it’s all cues.
          </p>
        )}
        <div
          role="toolbar"
          aria-label="Teleprompter"
          className={cn(
            "flex max-w-full flex-wrap items-center justify-center gap-1 rounded-2xl border border-white/10 bg-neutral-900/90 p-1.5 shadow-lg backdrop-blur",
            controlsShown && "pointer-events-auto",
          )}
          onPointerEnter={() => setHovering(true)}
          onPointerLeave={() => setHovering(false)}
        >
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/projects/${projectId}/script`} aria-label="Back to script" title="Back to script">
              <ArrowLeftIcon />
            </Link>
          </Button>
          <Separator orientation="vertical" className="mx-1 h-5!" />
          <Button
            className="w-24"
            disabled={empty}
            title="Play or pause (Space)"
            onMouseDown={keepFocus}
            onClick={toggle}
          >
            {mode === "paused" ? <PlayIcon data-icon="inline-start" /> : <PauseIcon data-icon="inline-start" />}
            {mode === "paused" ? "Play" : "Pause"}
          </Button>
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Slower"
              title="Slower (−)"
              disabled={speed <= SPEED.min}
              onMouseDown={keepFocus}
              onClick={() => setSpeed(speed - SPEED.step)}
            >
              <MinusIcon />
            </Button>
            <span className="w-20 text-center text-sm tabular-nums" title="Words per minute">
              {speed} wpm
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Faster"
              title="Faster (+)"
              disabled={speed >= SPEED.max}
              onMouseDown={keepFocus}
              onClick={() => setSpeed(speed + SPEED.step)}
            >
              <PlusIcon />
            </Button>
          </div>
          <Separator orientation="vertical" className="mx-1 h-5!" />
          <ToolbarSelect
            aria-label="Jump to scene"
            value={sceneId ?? ""}
            disabled={script.scenes.length === 0}
            onChange={(event) => autoscroll.jumpToScene(event.target.value || null)}
          >
            <option value="">Start of script</option>
            {script.scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.number}. {scene.heading || "Untitled scene"}
              </option>
            ))}
          </ToolbarSelect>
          {everyone.characters.length > 0 && (
            <ToolbarSelect
              aria-label="Whose lines to read"
              value={character ?? ""}
              onChange={(event) => setCharacter(event.target.value || null)}
            >
              <option value="">Everyone’s lines</option>
              {everyone.characters.map((name) => (
                <option key={name} value={name}>
                  {name}’s lines
                </option>
              ))}
            </ToolbarSelect>
          )}
          <Separator orientation="vertical" className="mx-1 h-5!" />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Reload script"
            title="Get the latest saved script"
            disabled={refreshing}
            onMouseDown={keepFocus}
            onClick={reload}
          >
            <RotateCwIcon className={cn(refreshing && "animate-spin")} />
          </Button>
          {fullscreen.supported && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={fullscreen.active ? "Exit full screen" : "Full screen"}
              title={fullscreen.active ? "Exit full screen (F)" : "Full screen (F)"}
              onMouseDown={keepFocus}
              onClick={fullscreen.toggle}
            >
              {fullscreen.active ? <MinimizeIcon /> : <MaximizeIcon />}
            </Button>
          )}
        </div>
        <p className="hidden text-xs text-white/40 lg:block">
          Space or click to play and pause · ↑ ↓ to nudge · − + to change speed · Page Up to step back
        </p>
      </div>
    </div>
  );
}

function Line({ line }: { line: PrompterLine }) {
  const props = {
    "data-block": line.block,
    "data-scene": line.sceneId ?? undefined,
    className: cn("prompter-line", line.continues && "prompter-continues"),
  };
  switch (line.kind) {
    case "scene":
      return (
        <li {...props} data-heading={line.sceneId} className={cn(props.className, "prompter-scene")}>
          <span className="prompter-scene-number">{line.number}</span>
          {line.heading}
        </li>
      );
    case "speaker":
      return (
        <li {...props} className={cn(props.className, "prompter-speaker")}>
          {line.name}
        </li>
      );
    case "cue":
      return (
        <li {...props} className={cn(props.className, "prompter-cue", `prompter-${line.type}`)}>
          <Runs runs={line.runs} />
        </li>
      );
    case "read":
      return (
        <li {...props} data-words={line.words} className={cn(props.className, "prompter-read")}>
          <Runs runs={line.runs} />
        </li>
      );
  }
}

function Runs({ runs }: { runs: TextRun[] }) {
  return runs.map((run, index) => {
    let content: React.ReactNode = run.text;
    if (run.underline) content = <u>{content}</u>;
    if (run.italic) content = <em>{content}</em>;
    if (run.bold) content = <strong>{content}</strong>;
    return <Fragment key={index}>{content}</Fragment>;
  });
}

/** Native, so phones and tablets show their own pickers. Gives focus back so Space still plays. */
function ToolbarSelect({ className, onChange, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      {...props}
      onChange={(event) => {
        onChange?.(event);
        event.currentTarget.blur();
      }}
      className={cn(
        "h-8 max-w-56 truncate rounded-lg border border-white/15 bg-white/5 px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-white/30 disabled:opacity-50",
        className,
      )}
    />
  );
}

/** Clicking a control shouldn't focus it, or Space would press it instead of playing. */
function keepFocus(event: React.MouseEvent) {
  event.preventDefault();
}

function useSpeed() {
  const raw = useLocalStorage(SPEED_KEY);
  const saved = raw === null ? NaN : Number(raw);
  const speed = Number.isFinite(saved) ? clampSpeed(saved) : SPEED.default;
  return [speed, (next: number) => writeLocalStorage(SPEED_KEY, String(clampSpeed(next)))] as const;
}

function clampSpeed(wpm: number) {
  return Math.min(Math.max(Math.round(wpm / SPEED.step) * SPEED.step, SPEED.min), SPEED.max);
}

function useCharacter(projectId: string) {
  const key = characterKey(projectId);
  const saved = useLocalStorage(key);
  return [saved || null, (name: string | null) => writeLocalStorage(key, name)] as const;
}

const subscribeNever = () => () => {};

function subscribeFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

function useFullscreen() {
  const supported = useSyncExternalStore(subscribeNever, () => document.fullscreenEnabled === true, () => false);
  const active = useSyncExternalStore(subscribeFullscreen, () => Boolean(document.fullscreenElement), () => false);

  // Leaving the teleprompter for another page leaves full screen too.
  useEffect(
    () => () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    },
    [],
  );

  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  return { supported, active, toggle };
}

/** Keeps the screen on while the teleprompter is open and visible, so a tablet doesn't sleep between takes. */
function useWakeLock() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let active = true;
    const request = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (active) lock = next;
        else void next.release();
      } catch {
        // Refused, e.g. in battery saver: the screen can sleep as usual.
      }
    };
    // Browsers release the lock whenever the tab is hidden.
    const onVisibilityChange = () => void request();
    void request();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void lock?.release();
    };
  }, []);
}
