import { Brand } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-muted/40 px-4 py-16">
      <Brand />
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
