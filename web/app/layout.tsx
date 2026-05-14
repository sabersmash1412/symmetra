import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Symmetra",
  description: "Facial movement analysis and progress tracking"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
