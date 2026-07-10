// Server-side client config, selected by process.env.CLIENT (default "swplaces").
// NOTE: this is a SEPARATE variable from the frontend's VITE_CLIENT. Both must be
// set to the same client key per deployment (VITE_CLIENT drives the built UI,
// CLIENT drives the API). An unknown CLIENT throws so a misconfig fails loud.
const CLIENT = process.env.CLIENT || "swplaces";

const CONFIGS = {
  swplaces: { dataSource: "sheets" },
  brandon: { dataSource: "sheets" },
};

const serverConfig = CONFIGS[CLIENT];
if (!serverConfig) throw new Error(`Unknown CLIENT: ${CLIENT}`);

export default serverConfig;
export { CLIENT };
