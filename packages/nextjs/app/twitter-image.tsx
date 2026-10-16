// Same card as the Open Graph one; Next looks for this file name for twitter:image. The segment
// config must be declared here, not re-exported, so the build can read it statically.
export { default } from "./opengraph-image";

export const runtime = "edge";
export const alt = "Ciphernode Console: run Interfold ciphernodes from a Safe";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
