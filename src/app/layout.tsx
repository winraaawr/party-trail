import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Jersey_10, Pixelify_Sans } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const display = Jersey_10({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const pixel = Pixelify_Sans({ subsets: ["latin"], variable: "--font-pixel" });
const body = Atkinson_Hyperlegible_Next({ subsets: ["latin", "latin-ext"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Party Trail",
  description: "A shared map for trips with friends: where everyone is, what's next, and where you're sleeping tonight.",
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/icon.svg` },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2B2145" },
    { media: "(prefers-color-scheme: dark)", color: "#0C0915" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${pixel.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
