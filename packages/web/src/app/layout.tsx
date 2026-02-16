import type { Metadata } from "next";
import { UpdateBanner } from "@/components/layout/update-banner";
import { NotificationToasts } from "@/components/layout/notification-toasts";
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
      <body className="min-h-screen bg-void antialiased" suppressHydrationWarning>
        <UpdateBanner />
        {children}
        <NotificationToasts />
      </body>
    </html>
  );
}
