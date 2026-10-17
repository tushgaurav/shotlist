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

/** The mark is as wide as the collapsed sidebar, so only the wordmark gets clipped. */
export function SidebarBrand() {
  return (
    <NavLink
      href="/projects"
      className="flex h-8 items-center gap-2 overflow-hidden rounded-lg ring-sidebar-ring outline-hidden focus-visible:ring-2"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <ClapperboardIcon className="size-4" />
      </span>
      {/* The SVG is drawn in white, so it's used as a mask and painted in the theme's color. */}
      <span
        role="img"
        aria-label="Shotlist"
        className="aspect-73/17 h-4.5 shrink-0 bg-sidebar-foreground mask-[url(/shotlist.svg)] mask-contain mask-no-repeat"
      />
    </NavLink>
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
              <SidebarMenuButton asChild isActive={isActive} tooltip={section.label}>
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
