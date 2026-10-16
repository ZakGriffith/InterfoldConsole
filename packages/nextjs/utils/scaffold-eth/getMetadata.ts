import type { Metadata } from "next";

const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : `http://localhost:${process.env.PORT || 3000}`;
const titleTemplate = "%s | Ciphernode Console";

/**
 * Title, description and icon for the whole site. The link-preview image is not set here: Next
 * generates it from app/opengraph-image.tsx (and app/twitter-image.tsx), which takes precedence
 * over anything configured in this object.
 */
export const getMetadata = ({ title, description }: { title: string; description: string }): Metadata => ({
  metadataBase: new URL(baseUrl),
  title: {
    default: title,
    template: titleTemplate,
  },
  description: description,
  openGraph: {
    title: {
      default: title,
      template: titleTemplate,
    },
    description: description,
    siteName: "Ciphernode Console",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: {
      default: title,
      template: titleTemplate,
    },
    description: description,
  },
  icons: {
    icon: [{ url: "/favicon.png", sizes: "32x32", type: "image/png" }],
  },
});
