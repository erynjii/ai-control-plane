import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "AI Control Plane",
  description: "MVP control plane for AI content workflows"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
