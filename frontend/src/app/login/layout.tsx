import type { Metadata } from "next";

// The dashboard should not be what search engines surface for "prompting
// realities" — the framework page at / is.
export const metadata: Metadata = {
  title: "Prompting Realities Control Hub",
  description: "Configure and monitor Prompting Realities LLM things",
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
