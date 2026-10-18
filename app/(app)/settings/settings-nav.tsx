"use client";

import { cn } from "cn";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

import { BreadcrumbPage } from "@/components/ui/breadcrumb";

import { SETTINGS_SECTIONS } from "./sections";

/** A row of tabs on narrow screens, a column beside the page on wide ones. */
export function SettingsNav() {
  const segment = useSelectedLayoutSegment();
  return (
    <nav
      aria-label="Settings"
      className="-mx-1 flex gap-1 overflow-x-auto px-1 py-1 @3xl:mx-0 @3xl:w-48 @3xl:shrink-0 @3xl:flex-col @3xl:px-0"
    >
      {SETTINGS_SECTIONS.map((section) => {
        const isActive = section.segment === segment;
        return (
          <Link
            key={section.segment}
            href={`/settings/${section.segment}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-8 shrink-0 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-card/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0",
              isActive && "bg-card text-foreground shadow-xs ring-1 ring-foreground/10 hover:bg-card",
            )}
          >
            <section.icon />
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SettingsCrumb() {
  const segment = useSelectedLayoutSegment();
  const section = SETTINGS_SECTIONS.find((item) => item.segment === segment);
  return section ? <BreadcrumbPage>{section.label}</BreadcrumbPage> : null;
}
