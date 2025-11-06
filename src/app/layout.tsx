import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Item Description Matcher",
  description: "Match descriptions between Item Master and Gen-Consumables",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
