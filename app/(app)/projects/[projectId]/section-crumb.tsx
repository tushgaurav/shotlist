"use client";

import { useSelectedLayoutSegments } from "next/navigation";

import { BreadcrumbPage } from "@/components/ui/breadcrumb";

import { PROJECT_SECTIONS } from "./sections";

export function SectionCrumb() {
  // Route groups like (workspace) come back as segments too.
  const segment = useSelectedLayoutSegments().find((item) => !item.startsWith("("));
  const section = PROJECT_SECTIONS.find((item) => item.segment === segment);
  return section ? <BreadcrumbPage>{section.label}</BreadcrumbPage> : null;
}
