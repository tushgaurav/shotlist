import { ClapperboardIcon } from "lucide-react";
import Link from "next/link";

export function Brand({ href = "/projects" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <ClapperboardIcon className="size-4" />
      </span>
      Shotlist
    </Link>
  );
}
