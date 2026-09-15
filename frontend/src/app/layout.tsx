import type { Metadata } from "next";

import "./globals.css";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Nexo | Seu assistente pessoal",
  description:
    "Leia, organize e responda suas conversas por voz com a Luna, sua assistente pessoal no Nexo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">

      <body
        className={cn(
          "font-sans antialiased bg-[#0b1326] text-[#dae2fd] selection:bg-primary/30"
        )}
      >
        {children}
      </body>
    </html>
  );
}
