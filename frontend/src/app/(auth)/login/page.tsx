import type { Metadata } from "next";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { LoginForm } from "@/components/auth/LoginForm";
import { DemoLoginForm } from "@/components/auth/DemoLoginForm";
import { DEMO_MODE } from "@/lib/http";
export const metadata: Metadata = { title: "Log in", description: "Continue your RivalPulse research." };
export default function LoginPage() {
  return <AuthFrame>{DEMO_MODE ? <DemoLoginForm /> : <LoginForm />}</AuthFrame>;
}
