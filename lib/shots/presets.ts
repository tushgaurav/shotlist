export type PresetOption = { value: string; hint?: string };

const options = (values: string[]): PresetOption[] => values.map((value) => ({ value }));

export const SHOT_SIZES: PresetOption[] = [
  { value: "EWS", hint: "Extreme Wide" },
  { value: "WS", hint: "Wide" },
  { value: "MWS", hint: "Medium Wide" },
  { value: "MS", hint: "Medium" },
  { value: "MCU", hint: "Medium Close-Up" },
  { value: "CU", hint: "Close-Up" },
  { value: "ECU", hint: "Extreme Close-Up" },
  { value: "Insert", hint: "Detail of an Object" },
];

export const SHOT_TYPES = options([
  "Single",
  "Two-Shot",
  "Group",
  "OTS",
  "POV",
  "Establishing",
  "Insert",
  "Cutaway",
  "Reaction",
]);

export const SHOT_ANGLES = options([
  "Eye Level",
  "High",
  "Low",
  "Dutch",
  "Overhead",
  "Bird's Eye",
  "Worm's Eye",
  "Shoulder",
]);

export const SHOT_MOVEMENTS = options([
  "Static",
  "Pan",
  "Tilt",
  "Push In",
  "Pull Out",
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
  { value: "48", hint: "Slow Motion at 24" },
  { value: "50" },
  { value: "60", hint: "Slow Motion" },
  { value: "120", hint: "Slow Motion" },
];

export const SHOT_SOUND = options(["Sync", "MOS", "Wild Track", "Playback"]);

export const SHOT_EQUIPMENT = options([
  "Tripod",
  "Slider",
  "Dolly",
  "Gimbal",
  "Steadicam",
  "Jib",
  "Crane",
  "Drone",
  "Car Mount",
  "Shoulder Rig",
]);
