import { Geist, Geist_Mono } from "next/font/google";
import "@rainbow-me/rainbowkit/styles.css";
import "@scaffold-ui/components/styles.css";
import { ScaffoldEthAppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";
import { ThemeProvider } from "~~/components/ThemeProvider";
import "~~/styles/globals.css";
import "~~/styles/interfold.css";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", weight: ["300", "400", "500", "600"] });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", weight: ["400", "500"] });

export const metadata = getMetadata({
  title: "Interfold Operator Console",
  description: "Bond, register, ticket, monitor and exit Interfold ciphernodes from a Safe",
});

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <html suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {/* The console mirrors dashboard.theinterfold.com, which is light-only. */}
        <ThemeProvider forcedTheme="light" enableSystem={false}>
          <ScaffoldEthAppWithProviders>{children}</ScaffoldEthAppWithProviders>
        </ThemeProvider>
      </body>
    </html>
  );
};

export default ScaffoldEthApp;
