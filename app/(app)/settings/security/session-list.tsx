"use client";

import { MonitorIcon, SmartphoneIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { FormattedDate } from "@/components/formatted-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeDevice, deviceLabel } from "@/lib/user-agent";

import { revokeOtherSessionsAction, revokeSessionAction } from "../actions";
import { SettingsCard } from "../settings-card";

export type SessionItem = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  current: boolean;
};

export function SessionList({ sessions }: { sessions: SessionItem[] }) {
  const [pending, startTransition] = useTransition();
  const others = sessions.filter((session) => !session.current).length;

  function signOutOthers() {
    startTransition(async () => {
      await revokeOtherSessionsAction();
      toast.success(others === 1 ? "Signed out of 1 other device" : `Signed out of ${others} other devices`);
    });
  }

  return (
    <SettingsCard
      title="Signed-in devices"
      description="Sign out of any you don't recognise, or no longer use."
      action={
        others > 0 && (
          <Button variant="outline" size="sm" disabled={pending} onClick={signOutOthers}>
            {pending ? "Signing out…" : "Sign out all others"}
          </Button>
        )
      }
    >
      {sessions.map((session) => (
        <SessionRow key={session.id} session={session} disabled={pending} />
      ))}
    </SettingsCard>
  );
}

function SessionRow({ session, disabled }: { session: SessionItem; disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const device = describeDevice(session.userAgent);
  const Icon = device.mobile ? SmartphoneIcon : MonitorIcon;
  const label = deviceLabel(device);

  function signOut() {
    startTransition(async () => {
      await revokeSessionAction(session.id);
      toast.success(`Signed out of ${label}`);
    });
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{label}</span>
          {session.current && (
            <Badge variant="outline" className="border-primary/30 text-primary">
              This device
            </Badge>
          )}
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {session.ipAddress && <>{session.ipAddress} · </>}
          Signed in <FormattedDate value={session.createdAt} />
        </p>
      </div>
      {!session.current && (
        <Button variant="outline" size="sm" disabled={disabled || pending} onClick={signOut}>
          {pending ? "Signing out…" : "Sign out"}
        </Button>
      )}
    </div>
  );
}
