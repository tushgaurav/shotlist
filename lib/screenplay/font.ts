import { Courier_Prime } from "next/font/google";

/** The screenplay's typeface, as the --font-screenplay variable that screenplay.css uses. */
export const courierPrime = Courier_Prime({
  weight: ["400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-screenplay",
});
