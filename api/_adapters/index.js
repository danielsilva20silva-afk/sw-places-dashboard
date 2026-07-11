// Selects the data adapter for the active client's dataSource (see api/_config.js).
// Adding a new backend (e.g. Airtable) = create ./airtable.js exposing the same
// interface and register it here; endpoints need zero changes.
import serverConfig from "../_config.js";
import * as sheets from "./sheets.js";
import * as supabase from "./supabase.js";

const ADAPTERS = {
  sheets,
  supabase,
};

const adapter = ADAPTERS[serverConfig.dataSource];
if (!adapter) throw new Error(`Unknown dataSource: ${serverConfig.dataSource}`);

export default adapter;
