"use client";

import { useSelectedLayoutSegment } from "next/navigation";

import { BreadcrumbPage } from "@/components/ui/breadcrumb";

import { PROJECT_SECTIONS } from "./sections";

export function SectionCrumb() {
  const segment = useSelectedLayoutSegment();
  const section = PROJECT_SECTIONS.find((item) => item.segment === segment);
  return section ? <BreadcrumbPage>{section.label}</BreadcrumbPage> : null;
}
