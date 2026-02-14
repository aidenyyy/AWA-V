import type { Metadata } from "next";
import { InterventionPanel } from "@/components/intervention/intervention-panel";
import "./globals.css";

export const metadata: Metadata = {
  title: "AWA-V | AI Workflow Automation",
  description: "Cyberpunk industrial visualization platform for AI workflow orchestration",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-void antialiased">
        {children}
        <InterventionPanel />
      </body>
    </html>
  );
}
