import type { Metadata } from "next";

import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create Account" };

export default function SignUpPage() {
  return <AuthForm mode="sign-up" />;
}
