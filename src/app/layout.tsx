import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "ReleaseIQ",
  description: "AI release-intelligence: agentic release notes + semantic PR search",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto",
          margin: 0,
          background: "#0d1117",
          color: "#e6edf3",
        }}
      >
        {children}
      </body>
    </html>
  );
}
