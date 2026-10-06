import type { Metadata, Viewport } from "next";
import { THEME_KEY } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Universo Musical",
  description: "Reproductor experimental basado en una lista doblemente enlazada — Taller de Estructuras de Datos",
};

export const viewport: Viewport = {
  themeColor: "#090A0F",
};

// Runs before the first paint so a saved light theme never flashes dark
const THEME_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(THEME_KEY)})==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
