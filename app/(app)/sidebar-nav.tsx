"use client";

import { ClapperboardIcon } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect } from "react";

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

import { PROJECT_SECTIONS } from "./projects/[projectId]/sections";

/** A link that also closes the sidebar sheet on small screens. */
function NavLink({ onClick, ...props }: React.ComponentProps<typeof Link>) {
  const { setOpenMobile } = useSidebar();
  return (
    <Link
      {...props}
      onClick={(event) => {
        onClick?.(event);
        setOpenMobile(false);
      }}
    />
  );
}

/** Closes the sidebar sheet after navigations that didn't start from one of its links. */
export function CloseMobileSidebarOnNavigate() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  useEffect(() => setOpenMobile(false), [pathname, setOpenMobile]);
  return null;
}

export function SidebarBrand() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild>
          <NavLink href="/projects">
            <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <ClapperboardIcon />
            </span>
            <span className="grid flex-1 text-left leading-tight">
              <span className="truncate font-semibold">Shotlist</span>
              <span className="truncate text-xs text-sidebar-foreground/70">Scripts & shot lists</span>
            </span>
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function SidebarNav() {
  const { projectId } = useParams<{ projectId?: string }>();
  const pathname = usePathname();
  return <SectionNav projectId={projectId ?? null} pathname={pathname} />;
}

/**
 * The current project's sections. Outside a project (`null`) they're disabled; while the
 * route is still streaming in (`undefined`) they look normal but don't link anywhere yet.
 */
export function SectionNav({ projectId, pathname }: { projectId?: string | null; pathname?: string }) {
  return (
    <SidebarGroup>
      <SidebarMenu>
        {PROJECT_SECTIONS.map((section) => {
          const label = (
            <>
              <section.icon />
              <span>{section.label}</span>
            </>
          );
          if (!projectId) {
            return (
              <SidebarMenuItem key={section.segment}>
                <SidebarMenuButton disabled={projectId === null}>{label}</SidebarMenuButton>
              </SidebarMenuItem>
            );
          }

          const href = `/projects/${projectId}/${section.segment}`;
          const isActive = pathname === href || Boolean(pathname?.startsWith(`${href}/`));
          return (
            <SidebarMenuItem key={section.segment}>
              <SidebarMenuButton asChild isActive={isActive}>
                <NavLink href={href} aria-current={isActive ? "page" : undefined}>
                  {label}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
