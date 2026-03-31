import type { ReactNode } from "react";
import { JetBrains_Mono } from "next/font/google";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export default function LaunchChecklistLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className={`${jetbrainsMono.variable} w-full`}>{children}</div>
  );
}
