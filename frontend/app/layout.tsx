import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConduitGuard — Validasi perubahan jaringan",
  description: "Validasi perubahan kebijakan firewall melalui simulasi offline dan temuan keamanan yang dapat dijelaskan.",
  applicationName: "ConduitGuard",
  icons: {
    icon: "/conduitguard-team-logo-cropped.png",
    apple: "/conduitguard-team-logo-cropped.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}
