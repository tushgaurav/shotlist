import type { ImageUploadError } from "@/lib/shots/image-uploader";
import type { UploadForm } from "@/lib/shots/images";

export const IMAGE_ERRORS: Record<ImageUploadError, string> = {
  not_image: "That file isn't an image.",
  too_large: "That image is too large. Use one under 40 MB and 20,000 pixels wide.",
  unreadable: "This image couldn't be read. Try a JPEG, PNG or WebP.",
  unavailable: "Image uploads aren't set up on this server yet.",
  rejected: "The image couldn't be uploaded. Try again.",
  offline: "Couldn't reach the server. Check your connection and try again.",
  unauthorized: "You've been signed out. Sign in again to upload images.",
  not_found: "The image couldn't be uploaded. Try again.",
  invalid: "The image couldn't be uploaded. Try again.",
};

/** POSTs one file straight to the bucket with its presigned form. */
export async function sendForm(form: UploadForm, file: Blob) {
  const body = new FormData();
  for (const [name, value] of Object.entries(form.fields)) body.append(name, value);
  body.append("file", file);
  const response = await fetch(form.url, { method: "POST", body });
  return response.ok;
}
