import { filledDetails } from "@/lib/ai/context";
import { aiEnabled } from "@/lib/ai/provider";
import { getProject } from "@/lib/dal/projects";
import { getOrCreateScript } from "@/lib/dal/scripts";
import { getShotList } from "@/lib/dal/shots";
import { storageEnabled } from "@/lib/storage/s3";

import { WorkspaceProvider, type Workspace } from "./workspace";

/**
 * The script and the shot list load their data here, once, rather than in their pages.
 * Switching between them then doesn't wait for the server: a layout doesn't re-render on
 * navigations between its own pages. The pages catch up in the background when shown.
 */
export default function WorkspaceLayout({ children, params }: LayoutProps<"/projects/[projectId]">) {
  // Not awaited, so the pages' skeletons show while it loads.
  const workspace = params.then(({ projectId }) => loadWorkspace(projectId));
  return <WorkspaceProvider workspace={workspace}>{children}</WorkspaceProvider>;
}

async function loadWorkspace(projectId: string): Promise<Workspace> {
  const [project, script, shots] = await Promise.all([
    getProject(projectId),
    getOrCreateScript(projectId),
    getShotList(projectId),
  ]);

  return {
    projectId,
    projectTitle: project.title,
    script: {
      id: script.id,
      draft: script.draft,
      draftRevision: script.draftRevision,
      titlePage: script.titlePage,
    },
    shots,
    imagesEnabled: storageEnabled(),
    ai: {
      enabled: aiEnabled(),
      details: filledDetails({ ...project, typeName: project.type?.name ?? null }),
      targetRuntimeMinutes: project.targetRuntimeMinutes,
    },
  };
}
