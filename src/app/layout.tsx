import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { PwaServiceWorkerRegistration } from "@/shared/components/layout/PwaServiceWorkerRegistration";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Master Dashboard",
  description: "E-Commerce BI Dashboard",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Dashboard",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/brand/petrhein-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
        <PwaServiceWorkerRegistration />
      </body>
    </html>
  );
}
