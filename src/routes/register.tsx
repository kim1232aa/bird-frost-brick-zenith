import { createFileRoute } from "@tanstack/react-router";
import { RegisterPage } from "@/pages/login-page";

export const Route = createFileRoute("/register")({
  ssr: false,
  component: RegisterPage,
});
