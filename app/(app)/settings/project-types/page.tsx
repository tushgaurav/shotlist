import type { Metadata } from "next";
import { Suspense } from "react";

import { listProjectTypes } from "@/lib/dal/project-types";

import { SettingsCardSkeleton } from "../settings-card";
import { ProjectTypeList } from "./project-type-list";

export const metadata: Metadata = { title: "Project Types" };

export default function ProjectTypesPage() {
  return (
    <Suspense fallback={<SettingsCardSkeleton rows={4} />}>
      <ProjectTypesLoader />
    </Suspense>
  );
}

async function ProjectTypesLoader() {
  const types = await listProjectTypes();
  return (
    <ProjectTypeList types={types.map(({ id, name, icon, projectCount }) => ({ id, name, icon, projectCount }))} />
  );
}
