export type PresetOption = { value: string; hint?: string };

const options = (values: string[]): PresetOption[] => values.map((value) => ({ value }));

export const SHOT_SIZES: PresetOption[] = [
  { value: "EWS", hint: "Extreme wide" },
  { value: "WS", hint: "Wide" },
  { value: "MWS", hint: "Medium wide" },
  { value: "MS", hint: "Medium" },
  { value: "MCU", hint: "Medium close-up" },
  { value: "CU", hint: "Close-up" },
  { value: "ECU", hint: "Extreme close-up" },
  { value: "Insert", hint: "Detail of an object" },
];

export const SHOT_TYPES = options([
  "Single",
  "Two-shot",
  "Group",
  "OTS",
  "POV",
  "Establishing",
  "Insert",
  "Cutaway",
  "Reaction",
]);

export const SHOT_ANGLES = options([
  "Eye level",
  "High",
  "Low",
  "Dutch",
  "Overhead",
  "Bird's eye",
  "Worm's eye",
  "Shoulder",
]);

export const SHOT_MOVEMENTS = options([
  "Static",
  "Pan",
  "Tilt",
  "Push in",
  "Pull out",
  "Dolly",
  "Truck",
  "Tracking",
  "Crane",
  "Handheld",
  "Gimbal",
  "Steadicam",
  "Drone",
  "Zoom",
]);

export const SHOT_LENSES = options(["14mm", "18mm", "24mm", "35mm", "50mm", "85mm", "100mm", "135mm", "Zoom"]);

export const SHOT_CAMERAS = options(["A", "B", "C"]);

export const SHOT_FRAME_RATES: PresetOption[] = [
  { value: "23.976" },
  { value: "24" },
  { value: "25" },
  { value: "30" },
  { value: "48", hint: "Slow motion at 24" },
  { value: "50" },
  { value: "60", hint: "Slow motion" },
  { value: "120", hint: "Slow motion" },
];

export const SHOT_SOUND = options(["Sync", "MOS", "Wild track", "Playback"]);

export const SHOT_EQUIPMENT = options([
  "Tripod",
  "Slider",
  "Dolly",
  "Gimbal",
  "Steadicam",
  "Jib",
  "Crane",
  "Drone",
  "Car mount",
  "Shoulder rig",
]);
