import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

import { AppHeader } from "../app-header";
import { SettingsCrumb, SettingsNav } from "./settings-nav";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <>
      <AppHeader>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>Settings</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <SettingsCrumb />
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </AppHeader>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Account settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your profile, password, signed-in devices and project types.
          </p>
        </div>
        <div className="flex flex-col gap-6 @3xl:flex-row @3xl:items-start @3xl:gap-10">
          <SettingsNav />
          <div className="@container/settings flex min-w-0 flex-1 flex-col gap-6">{children}</div>
        </div>
      </main>
    </>
  );
}
