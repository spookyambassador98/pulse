import type { Metadata } from "next";
import { Syne, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Grain } from "@/components/Grain";

const syne = Syne({
  variable: "--font-site",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pulse — Windows installer",
  description:
    "Free Windows app. A live neuron map of real device traffic. Download Pulse-Setup.",
  applicationName: "Pulse",
};

const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('pulse-theme');
    var theme = stored === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${syne.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-ink">
        {children}
        <Grain />
      </body>
    </html>
  );
}
