import localFont from "next/font/local";
import "@rainbow-me/rainbowkit/styles.css";
import "@scaffold-ui/components/styles.css";
import { ScaffoldEthAppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";
import { ThemeProvider } from "~~/components/ThemeProvider";
import "~~/styles/globals.css";
import "~~/styles/interfold.css";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

// Self-hosted variable fonts (latin subset, from Google Fonts). next/font/google downloads at build
// time and a failed fetch fails the whole Vercel build.
const inter = localFont({ src: "./fonts/Inter-latin.woff2", variable: "--font-inter", weight: "400 700" });
const jetbrainsMono = localFont({
  src: "./fonts/JetBrainsMono-latin.woff2",
  variable: "--font-jetbrains-mono",
  weight: "400 600",
});

export const metadata = getMetadata({
  title: "Ciphernode Console",
  description:
    "BuidlGuidl's console for running Interfold ciphernodes funded from a Safe: bond, register, tickets, monitoring, exits",
});

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <html suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        {/* Single dark theme; daisyUI's "light" slot carries our palette so /debug matches. */}
        <ThemeProvider forcedTheme="light" enableSystem={false}>
          <ScaffoldEthAppWithProviders>{children}</ScaffoldEthAppWithProviders>
        </ThemeProvider>
      </body>
    </html>
  );
};

export default ScaffoldEthApp;
