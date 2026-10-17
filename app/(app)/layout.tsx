import { Suspense } from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

import { AppSidebar } from "./app-sidebar";
import { CloseMobileSidebarOnNavigate } from "./sidebar-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="@container">{children}</SidebarInset>
      <Suspense>
        <CloseMobileSidebarOnNavigate />
      </Suspense>
    </SidebarProvider>
  );
}
