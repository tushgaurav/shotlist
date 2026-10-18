import type { Metadata } from "next";
import { Suspense } from "react";

import { requireUser } from "@/lib/dal/session";
import { storageEnabled } from "@/lib/storage/s3";

import { SettingsCardSkeleton } from "../settings-card";
import { ProfileSettings } from "./profile-settings";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <Suspense fallback={<SettingsCardSkeleton rows={3} />}>
      <ProfileLoader />
    </Suspense>
  );
}

async function ProfileLoader() {
  const { name, email, image } = await requireUser();
  return <ProfileSettings name={name} email={email} image={image} photosEnabled={storageEnabled()} />;
}
