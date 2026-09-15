import type { Metadata } from "next";

import "./globals.css";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Leitor de WhatsApp | Assistente pessoal",
  description:
    "Assistente pessoal de WhatsApp que monitora grupos e conversas e entrega resumos inteligentes gerados por IA.",
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
