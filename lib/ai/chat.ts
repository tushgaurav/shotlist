import type { UIMessage } from "ai";

import type { ProposeEditInput } from "./schema";

/** The scene an edit targets, resolved on the server from the scene number the model used. */
export type ProposeEditOutput = { ok: true; sceneId: string | null } | { ok: false; error: string };

export type AssistantMessage = UIMessage<
  never,
  never,
  { proposeEdit: { input: ProposeEditInput; output: ProposeEditOutput } }
>;
