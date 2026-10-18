import { Suspense } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/dal/session";

import { NavUser } from "./nav-user";
import { SectionNav, SidebarBrand, SidebarNav } from "./sidebar-nav";

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarBrand />
      </SidebarHeader>
      <SidebarContent>
        <Suspense fallback={<SectionNav />}>
          <SidebarNav />
        </Suspense>
      </SidebarContent>
      <SidebarFooter>
        <Suspense fallback={<NavUserSkeleton />}>
          <NavUserLoader />
        </Suspense>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

async function NavUserLoader() {
  const { name, email, image } = await requireUser();
  return <NavUser name={name} email={email} image={image} />;
}

function NavUserSkeleton() {
  return (
    <div aria-hidden className="flex h-12 items-center gap-2 p-2">
      <Skeleton className="size-8 rounded-lg bg-sidebar-accent" />
      <div className="grid flex-1 gap-1.5">
        <Skeleton className="h-3 w-20 bg-sidebar-accent" />
        <Skeleton className="h-3 w-32 bg-sidebar-accent" />
      </div>
    </div>
  );
}
