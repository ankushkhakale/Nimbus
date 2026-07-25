import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { LocaleProvider } from "@/lib/i18n";
import { PreferencesInit } from "@/components/PreferencesInit";

// One sans family carries the whole hierarchy through size and weight;
// there is no display counter-voice. Mono is only for commands and keys.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-jb",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nimbus — your files, your bucket",
  description:
    "An open-source Drive and Photos replacement that runs in your own AWS account. Files go straight from your browser to your S3 bucket.",
};

// Explicit so the app scales to the device width and the dark UI extends
// into the phone's status-bar area rather than showing a white strip.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* Apply the stored theme synchronously, before first paint, so
            there's no flash of the wrong theme on load. PreferencesInit
            keeps it in sync afterwards. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('nimbus:theme')||'system';var r=t==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):t;document.documentElement.dataset.theme=r;}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <PreferencesInit />
        <LocaleProvider>
          <AuthProvider>{children}</AuthProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
