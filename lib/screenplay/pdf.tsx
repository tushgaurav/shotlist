import { Document, Font, Page, pdf, Text } from "@react-pdf/renderer";
import { Fragment } from "react";

import {
  CHARS_PER_INCH,
  LINES_PER_INCH,
  PAGE_MARGINS,
  PAPER_SIZES,
  plain,
  type LayoutLine,
  type LayoutPage,
  type ScreenplayLayout,
} from "./pagination";

const FAMILY = "Courier Prime";
const POINTS_PER_INCH = 72;
const CHAR_WIDTH = POINTS_PER_INCH / CHARS_PER_INCH;
const LINE_HEIGHT = POINTS_PER_INCH / LINES_PER_INCH;

/** Page numbers sit half an inch from the top; scene numbers 0.3 inch outside the text. */
const PAGE_NUMBER_ROW = -(PAGE_MARGINS.top - 0.5) * LINES_PER_INCH;
const SCENE_NUMBER_GAP = 3;

let fontsRegistered = false;

function registerFonts(baseUrl: string) {
  if (fontsRegistered) return;
  Font.register({
    family: FAMILY,
    fonts: [
      { src: `${baseUrl}/CourierPrime-Regular.ttf` },
      { src: `${baseUrl}/CourierPrime-Bold.ttf`, fontWeight: "bold" },
      { src: `${baseUrl}/CourierPrime-Italic.ttf`, fontStyle: "italic" },
      { src: `${baseUrl}/CourierPrime-BoldItalic.ttf`, fontWeight: "bold", fontStyle: "italic" },
    ],
  });
  // Lines are already broken to fit, so react-pdf must never hyphenate them.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

export type PdfInfo = { title: string; author?: string };

export async function renderScreenplayPdf(
  layout: ScreenplayLayout,
  info: PdfInfo,
  fontBaseUrl = "/fonts/courier-prime",
): Promise<Blob> {
  registerFonts(fontBaseUrl);
  return pdf(<ScreenplayDocument layout={layout} info={info} />).toBlob();
}

function ScreenplayDocument({ layout, info }: { layout: ScreenplayLayout; info: PdfInfo }) {
  const { width, height } = PAPER_SIZES[layout.paper];
  const size: [number, number] = [width * POINTS_PER_INCH, height * POINTS_PER_INCH];

  return (
    <Document title={info.title} author={info.author} creator="Shotlist" producer="Shotlist">
      {layout.titlePage && <ScreenplayPage size={size} columns={layout.columns} page={layout.titlePage} />}
      {layout.pages.map((page, index) => (
        <ScreenplayPage
          key={index}
          size={size}
          columns={layout.columns}
          page={page}
          // The first page of a script isn't numbered.
          number={index > 0 ? `${index + 1}.` : undefined}
        />
      ))}
    </Document>
  );
}

function ScreenplayPage({
  size,
  columns,
  page,
  number,
}: {
  size: [number, number];
  columns: number;
  page: LayoutPage;
  number?: string;
}) {
  return (
    <Page size={size} style={{ fontFamily: FAMILY, fontSize: 12, lineHeight: 1 }}>
      {number && <PageLine row={PAGE_NUMBER_ROW} column={columns - number.length} runs={plain(number)} />}
      {page.lines.map((line, index) => (
        <Fragment key={index}>
          <PageLine {...line} />
          {line.sceneNumber && (
            <>
              <PageLine
                row={line.row}
                column={-SCENE_NUMBER_GAP - line.sceneNumber.length}
                runs={plain(line.sceneNumber)}
              />
              <PageLine row={line.row} column={columns + SCENE_NUMBER_GAP} runs={plain(line.sceneNumber)} />
            </>
          )}
        </Fragment>
      ))}
    </Page>
  );
}

function PageLine({ row, column, runs }: Pick<LayoutLine, "row" | "column" | "runs">) {
  return (
    <Text
      style={{
        position: "absolute",
        left: (PAGE_MARGINS.left * CHARS_PER_INCH + column) * CHAR_WIDTH,
        top: (PAGE_MARGINS.top * LINES_PER_INCH + row) * LINE_HEIGHT,
      }}
    >
      {runs.map((run, index) => (
        <Text
          key={index}
          style={{
            fontWeight: run.bold ? "bold" : "normal",
            fontStyle: run.italic ? "italic" : "normal",
            textDecoration: run.underline ? "underline" : "none",
          }}
        >
          {run.text}
        </Text>
      ))}
    </Text>
  );
}
