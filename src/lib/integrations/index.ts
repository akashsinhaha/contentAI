import { mockInstagram, mockMetaAds, mockWhatsApp } from "./mock";
import { realInstagram, realMetaAds, realWhatsApp } from "./real";

const useReal = () => process.env.INTEGRATIONS_MODE === "real";
export const getInstagram = () => (useReal() ? realInstagram : mockInstagram);
export const getMetaAds = () => (useReal() ? realMetaAds : mockMetaAds);
export const getWhatsApp = () => (useReal() ? realWhatsApp : mockWhatsApp);
