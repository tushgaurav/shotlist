"use server";

import { z } from "zod";

import { updateTitlePage } from "@/lib/dal/scripts";
import type { TitlePage } from "@/lib/screenplay/types";

const line = z.string().trim().max(200);
const block = z.string().trim().max(1000);

const titlePageSchema = z.object({
  title: line,
  credit: line,
  author: line,
  source: block,
  draftDate: line,
  contact: block,
});

export async function updateTitlePageAction(
  scriptId: string,
  input: TitlePage,
): Promise<{ titlePage?: TitlePage; error?: string }> {
  const parsed = titlePageSchema.partial().safeParse(input);
  if (!parsed.success || typeof scriptId !== "string") {
    return { error: "Some fields are too long." };
  }

  const titlePage = Object.fromEntries(
    Object.entries(parsed.data).filter(([, value]) => value),
  ) as TitlePage;

  await updateTitlePage(scriptId, titlePage);
  return { titlePage };
}
