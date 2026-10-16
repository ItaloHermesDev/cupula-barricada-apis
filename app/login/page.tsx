import type { Metadata } from "next";
import { AuthShell } from "@/app/components/auth-shell";
import { LoginForm } from "@/app/login/login-form";

export const metadata: Metadata = {
  title: "Entrar",
};

export default function LoginPage() {
  return (
    <AuthShell
      title="Entrar"
      description="Use o e-mail e a senha da sua conta para acessar a cúpula."
    >
      <LoginForm />
    </AuthShell>
  );
}
