import Link from "next/link";

import { SidebarWordmark } from "@/app/(app)/sidebar-wordmark";

export function Brand({ href = "/projects" }: { href?: string }) {
  return (
    <Link href={href} className="rounded-md outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
      <SidebarWordmark className="h-7" />
    </Link>
  );
}
