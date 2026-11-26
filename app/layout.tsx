import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { APP_LOCK_PREPAINT_SCRIPT } from "@/lib/app-lock";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: "Expense Tracker",
  description: "Personal finance tracker — fast, private, cross-device",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Expenses",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: the pre-paint app-lock script may add
    // data-locked to <html> before React hydrates.
    <html lang="en" className={`dark ${jakarta.variable}`} suppressHydrationWarning>
      <head>
        {/* Fingerprint app lock (installed PWA only): hide the app shell before
            first paint on a cold launch — see lib/app-lock.ts. */}
        <script dangerouslySetInnerHTML={{ __html: APP_LOCK_PREPAINT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
