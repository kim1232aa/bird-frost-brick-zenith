import { createFileRoute } from "@tanstack/react-router";
import { EcommerceSuitePage } from "@/pages/ecommerce-suite-page";

export const Route = createFileRoute("/ecommerce")({
  ssr: false,
  component: EcommerceSuitePage,
});
