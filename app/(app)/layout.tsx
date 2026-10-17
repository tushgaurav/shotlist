import { Suspense } from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

import { AppSidebar } from "./app-sidebar";
import { CloseMobileSidebarOnNavigate } from "./sidebar-nav";

// From md up the inset is a fixed card that scrolls inside, so sticky bars stick to its top.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider className="md:h-svh">
      <AppSidebar />
      <SidebarInset className="@container md:overflow-y-auto">{children}</SidebarInset>
      <Suspense>
        <CloseMobileSidebarOnNavigate />
      </Suspense>
    </SidebarProvider>
  );
}
