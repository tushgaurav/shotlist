"use client";

import { cn } from "cn";
import { ImagePlusIcon, LoaderCircleIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { ProjectCover } from "@/components/project-cover";
import { Button } from "@/components/ui/button";
import { ImageTooLargeError, prepareImage } from "@/lib/images/prepare";
import { IMAGE_ERRORS, sendForm } from "@/lib/images/upload";
import type { ImageUploadError } from "@/lib/shots/image-uploader";
import { MAX_SOURCE_BYTES, type PreparedImage } from "@/lib/shots/images";

import { confirmCoverUploadAction, removeCoverAction, startCoverUploadAction } from "../../actions";
import { useImageDrop, useImagePicker } from "../(workspace)/shots/shot-image";

async function prepare(file: File): Promise<PreparedImage | ImageUploadError> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return "not_image";
  if (file.size > MAX_SOURCE_BYTES) return "too_large";
  try {
    return await prepareImage(file);
  } catch (error) {
    return error instanceof ImageTooLargeError ? "too_large" : "unreadable";
  }
}

async function upload(projectId: string, image: PreparedImage): Promise<ImageUploadError | null> {
  try {
    const started = await startCoverUploadAction(projectId, image.contentType);
    if (!started.ok) return started.error;
    const sent = await Promise.all([
      sendForm(started.forms.full, image.full),
      sendForm(started.forms.thumb, image.thumb),
    ]);
    if (!sent.every(Boolean)) return "rejected";
    const confirmed = await confirmCoverUploadAction(projectId, {
      assetId: started.assetId,
      contentType: image.contentType,
      width: image.width,
      height: image.height,
    });
    return confirmed.ok ? null : confirmed.error;
  } catch {
    return "offline";
  }
}

/** The project's header image as a wide banner. Click or drop an image to set it. */
export function CoverField({
  projectId,
  coverImageId,
  enabled,
}: {
  projectId: string;
  coverImageId: string | null;
  enabled: boolean;
}) {
  // The new image, kept after it's uploaded so it doesn't flash while loading from S3.
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, startRemoving] = useTransition();
  const busy = uploading || removing;
  const hasImage = preview !== null || coverImageId !== null;

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function onFile(file: File) {
    if (!enabled || busy) return;
    setUploading(true);
    const prepared = await prepare(file);
    let error: ImageUploadError | null;
    if (typeof prepared === "string") {
      error = prepared;
    } else {
      setPreview(URL.createObjectURL(prepared.full));
      error = await upload(projectId, prepared);
    }
    setUploading(false);
    if (error) {
      setPreview(null);
      toast.error(IMAGE_ERRORS[error], { id: "cover-error" });
    } else {
      toast.success("Header image updated");
    }
  }

  function remove() {
    startRemoving(async () => {
      await removeCoverAction(projectId);
      setPreview(null);
    });
  }

  const picker = useImagePicker(onFile);
  const drop = useImageDrop(onFile);
  const dropping = enabled && drop.over;

  return (
    <section aria-label="Header Image" {...drop.props}>
      {picker.input}
      {hasImage ? (
        <ProjectCover
          src={preview}
          coverImageId={coverImageId}
          icon={null}
          variant="full"
          className={cn("aspect-3/1 rounded-xl ring-1 ring-foreground/10", dropping && "ring-2 ring-primary")}
        >
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-background/50">
              <LoaderCircleIcon className="size-5 animate-spin" aria-hidden />
              <span className="sr-only">Uploading image</span>
            </span>
          )}
          <div className="absolute right-3 bottom-3 flex gap-2">
            <Button size="sm" variant="secondary" disabled={!enabled || busy} onClick={picker.open}>
              <RefreshCwIcon data-icon="inline-start" />
              Change
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={remove}>
              <Trash2Icon data-icon="inline-start" />
              {removing ? "Removing…" : "Remove"}
            </Button>
          </div>
        </ProjectCover>
      ) : (
        <div
          className={cn(
            "flex aspect-3/1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 text-center transition-colors",
            dropping && "border-primary bg-primary/5",
          )}
        >
          <Button variant="outline" size="sm" disabled={!enabled || busy} onClick={picker.open}>
            {uploading ? (
              <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
            ) : (
              <ImagePlusIcon data-icon="inline-start" />
            )}
            {uploading ? "Uploading…" : "Add Header Image"}
          </Button>
          <p className="text-xs text-balance text-muted-foreground">
            {enabled ? "Or drop one here. It's shown on the project card." : IMAGE_ERRORS.unavailable}
          </p>
        </div>
      )}
    </section>
  );
}
