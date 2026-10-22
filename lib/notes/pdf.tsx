import { Document, Font, Link, Page, Path, pdf, Rect, StyleSheet, Svg, Text, View, type Styles } from "@react-pdf/renderer";
import type { Mark, Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { ReactNode } from "react";

import { PAPER_SIZES, type PaperSize } from "../screenplay/pagination";

type Style = Styles[string];

export const SANS = "Geist";
export const MONO = "Geist Mono";
const POINTS_PER_INCH = 72;

const INK = "#171717";
const MUTED = "#737373";
const RULE = "#d4d4d4";
const TINT = "#f4f4f5";
const LINK = "#0e7490";

let fontsRegistered = false;

/** Geist, as in the app. Mood board PDFs use it too. */
export function registerFonts(baseUrl: string) {
  if (fontsRegistered) return;
  Font.register({
    family: SANS,
    fonts: [
      { src: `${baseUrl}/Geist-Regular.ttf` },
      { src: `${baseUrl}/Geist-Italic.ttf`, fontStyle: "italic" },
      { src: `${baseUrl}/Geist-SemiBold.ttf`, fontWeight: 600 },
      { src: `${baseUrl}/Geist-SemiBoldItalic.ttf`, fontWeight: 600, fontStyle: "italic" },
      { src: `${baseUrl}/Geist-Bold.ttf`, fontWeight: "bold" },
      { src: `${baseUrl}/Geist-BoldItalic.ttf`, fontWeight: "bold", fontStyle: "italic" },
    ],
  });
  // Code never combines with other marks, so one weight is enough.
  Font.register({ family: MONO, src: `${baseUrl}/GeistMono-Regular.ttf` });
  fontsRegistered = true;
}

const LONG_WORD = 30;
const CHUNK = 15;

/**
 * react-pdf only breaks lines at spaces and hyphenation points. Notes aren't hyphenated, but a
 * word too long for any line (usually a link) may break after a URL separator, or every few
 * characters if it has none. react-pdf marks such a break with a hyphen.
 */
export function breakLongWord(word: string): string[] {
  if (word.length <= LONG_WORD) return [word];
  return word
    .split(/(?<=[/?&=#.,;_-])/)
    .flatMap((part) => (part.length <= CHUNK ? [part] : (part.match(new RegExp(`.{1,${CHUNK}}`, "gsu")) ?? [part])));
}

export type NotesPdfOptions = {
  paper: PaperSize;
  /** The document's title, e.g. the note's or "Rooftop Video Notes". */
  title: string;
  /** Shown at the foot of every page. */
  projectTitle: string;
};

/** One or more notes as a PDF, each starting on a new page. Laid out like the editor shows them. */
export async function renderNotesPdf(
  notes: ProseMirrorNode[],
  options: NotesPdfOptions,
  fontBaseUrl = "/fonts/geist",
): Promise<Blob> {
  registerFonts(fontBaseUrl);
  // The callback is shared by every PDF, so each sets its own before rendering.
  Font.registerHyphenationCallback(breakLongWord);
  return pdf(<NotesDocument notes={notes} {...options} />).toBlob();
}

function NotesDocument({ notes, paper, title, projectTitle }: { notes: ProseMirrorNode[] } & NotesPdfOptions) {
  const { width, height } = PAPER_SIZES[paper];
  const size: [number, number] = [width * POINTS_PER_INCH, height * POINTS_PER_INCH];

  return (
    <Document title={title} creator="Shotlist" producer="Shotlist">
      {notes.map((doc, index) => (
        <Page key={index} size={size} style={styles.page}>
          {/* The first line is the title, as in the editor. */}
          <View style={styles.body}>{blocks(doc, true)}</View>
          <View fixed style={styles.footer}>
            <Text>{projectTitle}</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      ))}
    </Document>
  );
}

function blocks(parent: ProseMirrorNode, topLevel = false): ReactNode[] {
  const result: ReactNode[] = [];
  parent.forEach((node, _, index) => result.push(block(node, index, topLevel && index === 0)));
  return result;
}

function block(node: ProseMirrorNode, key: number, title: boolean): ReactNode {
  switch (node.type.name) {
    case "paragraph":
      return (
        <Text key={key} style={title ? styles.title : undefined}>
          {inline(node)}
        </Text>
      );
    case "heading":
      return (
        <Text key={key} minPresenceAhead={title ? undefined : 24} style={title ? styles.title : HEADINGS[node.attrs.level]}>
          {inline(node)}
        </Text>
      );
    case "bulletList":
    case "orderedList":
    case "taskList":
      return (
        <View key={key} style={styles.list}>
          {listItems(node)}
        </View>
      );
    case "blockquote":
      return (
        <View key={key} style={styles.quote}>
          {blocks(node)}
        </View>
      );
    case "codeBlock":
      return (
        <View key={key} style={styles.codeBlock}>
          <Text style={styles.code}>{node.textContent || " "}</Text>
        </View>
      );
    case "horizontalRule":
      return <View key={key} style={styles.rule} />;
    default:
      return node.isTextblock ? <Text key={key}>{inline(node)}</Text> : <View key={key}>{blocks(node)}</View>;
  }
}

function listItems(list: ProseMirrorNode): ReactNode[] {
  const kind = list.type.name;
  const result: ReactNode[] = [];
  list.forEach((item, _, index) => {
    const checked = kind === "taskList" && item.attrs.checked === true;
    result.push(
      <View key={index} style={styles.item}>
        <View style={kind === "orderedList" ? styles.numberMarker : styles.marker}>
          {kind === "taskList" ? (
            <Checkbox checked={checked} />
          ) : (
            <Text style={styles.markerText}>{kind === "orderedList" ? `${(list.attrs.start ?? 1) + index}.` : "•"}</Text>
          )}
        </View>
        <View style={checked ? [styles.itemBody, styles.done] : styles.itemBody}>{blocks(item)}</View>
      </View>,
    );
  });
  return result;
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <Svg width={9} height={9} viewBox="0 0 9 9" style={styles.checkbox}>
      <Rect
        x={0.5}
        y={0.5}
        width={8}
        height={8}
        rx={1.5}
        stroke={checked ? INK : MUTED}
        strokeWidth={0.8}
        fill={checked ? INK : "white"}
      />
      {checked && (
        <Path d="M2.2 4.6 L3.8 6.2 L6.9 2.9" stroke="white" strokeWidth={1.1} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </Svg>
  );
}

/** A textblock's runs of text. An empty one still takes up a line. */
function inline(node: ProseMirrorNode): ReactNode {
  if (node.childCount === 0) return " ";
  const runs: ReactNode[] = [];
  node.forEach((child, _, index) => {
    if (child.type.name === "hardBreak") runs.push("\n");
    else if (child.isText) runs.push(textRun(child, index));
  });
  return runs;
}

function textRun(node: ProseMirrorNode, key: number) {
  const style = markStyle(node.marks);
  const link = node.marks.find((mark) => mark.type.name === "link");
  return link ? (
    <Link key={key} src={String(link.attrs.href)} style={{ ...style, ...styles.link }}>
      {node.text}
    </Link>
  ) : (
    <Text key={key} style={style}>
      {node.text}
    </Text>
  );
}

function markStyle(marks: readonly Mark[]): Style {
  const names = new Set(marks.map((mark) => mark.type.name));
  if (names.has("code")) return styles.inlineCode;

  const style: Style = {};
  if (names.has("bold")) style.fontWeight = "bold";
  if (names.has("italic")) style.fontStyle = "italic";
  if (names.has("underline") && names.has("strike")) style.textDecoration = "underline line-through";
  else if (names.has("underline")) style.textDecoration = "underline";
  else if (names.has("strike")) style.textDecoration = "line-through";
  return style;
}

const styles = StyleSheet.create({
  page: { paddingTop: 64, paddingBottom: 72, paddingHorizontal: 64, color: INK, fontFamily: SANS },
  // Not on the page: react-pdf then puts the footer's page numbers off the page. The line
  // height is worked out from the font size set alongside it.
  body: { fontSize: 10.5, lineHeight: 1.5 },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 64,
    right: 64,
    flexDirection: "row",
    justifyContent: "space-between",
    color: MUTED,
    fontSize: 8,
  },
  title: { marginBottom: 8, fontSize: 20, fontWeight: 600, lineHeight: 1.3 },
  list: { marginVertical: 2 },
  item: { flexDirection: "row" },
  marker: { width: 14 },
  numberMarker: { width: 18 },
  markerText: { color: MUTED },
  checkbox: { marginTop: 3.5 },
  itemBody: { flex: 1 },
  done: { color: MUTED, textDecoration: "line-through" },
  quote: { marginVertical: 4, borderLeftWidth: 2, borderLeftColor: RULE, paddingLeft: 10, color: MUTED },
  codeBlock: { marginVertical: 4, borderRadius: 4, padding: 8, backgroundColor: TINT },
  code: { fontFamily: MONO, fontSize: 9, fontStyle: "normal", fontWeight: 400, lineHeight: 1.45 },
  inlineCode: { fontFamily: MONO, fontSize: 9.5, fontStyle: "normal", fontWeight: 400, backgroundColor: TINT },
  rule: { marginVertical: 10, borderBottomWidth: 0.75, borderBottomColor: RULE },
  link: { color: LINK, textDecoration: "underline" },
});

const heading = { marginTop: 10, marginBottom: 2, fontWeight: 600, lineHeight: 1.3 } as const;

const HEADINGS: Record<number, Style> = {
  1: { ...heading, fontSize: 15.5 },
  2: { ...heading, fontSize: 13.5 },
  3: { ...heading, fontSize: 12 },
};
