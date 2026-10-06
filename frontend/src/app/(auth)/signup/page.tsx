import type { Metadata } from "next";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return <AuthFrame><SignupForm /></AuthFrame>;
}
