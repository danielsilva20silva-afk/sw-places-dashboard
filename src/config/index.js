// Active client configuration, selected by VITE_CLIENT at build time.
// Defaults to "swplaces" so existing deploys keep working with no env change.
// An unknown VITE_CLIENT throws at startup so a misconfigured deploy fails loud.
import swplaces from "./swplaces.js";

const CONFIGS = {
  swplaces,
};

const CLIENT = import.meta.env.VITE_CLIENT || "swplaces";

const config = CONFIGS[CLIENT];
if (!config) throw new Error(`Unknown client: ${CLIENT}`);

export default config;
export const { branding, users } = config;
export const clientConstants = config.constants;
