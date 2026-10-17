import { requireUser } from "@/lib/dal/session";

import { UserMenuDropdown } from "./user-menu-dropdown";

export async function UserMenu() {
  const user = await requireUser();
  return <UserMenuDropdown name={user.name} email={user.email} />;
}
