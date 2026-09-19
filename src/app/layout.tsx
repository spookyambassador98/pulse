import type { Metadata } from "next";
import { Space_Grotesk, Newsreader, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Grain } from "@/components/Grain";
import { GooDefs } from "@/components/GooDefs";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["italic"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pulse — the heartbeat of a web session",
  description:
    "Pulse translates raw traffic between your device and a target site into a live, human-readable heartbeat. Watch a session breathe — or flatline.",
};

// Runs before hydration to avoid a theme flash. Reads a previously
// stored preference; defaults to the dark stage (primary theme).
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
      className={`${spaceGrotesk.variable} ${newsreader.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <GooDefs />
        {children}
        <Grain />
      </body>
    </html>
  );
}
