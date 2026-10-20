/** Each theme is a class on <html>, styled in globals.css. "system" follows the OS between light and dark. */
export const THEMES = ["light", "dark", "studio"];

/** Studio is dark, for anything that only knows light and dark. */
export function colorScheme(theme: string | undefined) {
  return theme === "studio" ? "dark" : theme;
}
