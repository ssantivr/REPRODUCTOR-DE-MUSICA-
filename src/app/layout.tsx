import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Universo Musical",
  description: "Reproductor experimental basado en una lista doblemente enlazada — Taller de Estructuras de Datos",
};

export const viewport: Viewport = {
  themeColor: "#090A0F",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="bg-[#090A0F] font-sans antialiased">{children}</body>
    </html>
  );
}
