import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ritmo — tus hábitos de aprendizaje",
  description: "Un pequeño espacio para aprender algo nuevo cada día.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
