import { SearchXIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";

import { AppHeader } from "../app-header";

export default function ProjectNotFound() {
  return (
    <>
      <AppHeader>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/projects">Projects</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </AppHeader>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-16 sm:px-6">
        <EmptyState
          icon={SearchXIcon}
          title="Project not found"
          description="It may have been removed, or it belongs to a different account."
        >
          <Button asChild variant="outline">
            <Link href="/projects">Back to projects</Link>
          </Button>
        </EmptyState>
      </main>
    </>
  );
}
