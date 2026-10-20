"use client";

import { createContext, use } from "react";

import type { ScriptWorkspaceProps } from "./script/script-workspace";

/** What the script page needs. The shot list uses part of it. */
export type Workspace = ScriptWorkspaceProps;

const WorkspaceContext = createContext<Promise<Workspace> | null>(null);

export function WorkspaceProvider({
  workspace,
  children,
}: {
  workspace: Promise<Workspace>;
  children: React.ReactNode;
}) {
  return <WorkspaceContext value={workspace}>{children}</WorkspaceContext>;
}

/** Suspends until the layout's data arrives. Pages shown after the first don't wait. */
export function useWorkspace() {
  const workspace = use(WorkspaceContext);
  if (!workspace) throw new Error("useWorkspace must be used inside the workspace layout.");
  return use(workspace);
}
