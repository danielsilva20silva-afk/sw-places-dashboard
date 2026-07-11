// Selects the data adapter for the active client's dataSource (see api/_config.js).
// Adding a new backend (e.g. Airtable) = create ./airtable.js exposing the same
// interface and register it in ADAPTERS; endpoints need zero changes.
// dataSource "composite" merges several sources (config.sources) behind the same
// interface — see ./composite.js.
import serverConfig from "../_config.js";
import * as sheets from "./sheets.js";
import * as supabase from "./supabase.js";
import * as metaLeadsSheet from "./metaLeadsSheet.js";
import { createComposite } from "./composite.js";

const ADAPTERS = {
  sheets,
  supabase,
  metaLeadsSheet,
};

let adapter;
if (serverConfig.dataSource === "composite") {
  const sources = (serverConfig.sources || []).map((key) => {
    const a = ADAPTERS[key];
    if (!a) throw new Error(`Unknown composite source: ${key}`);
    return { key, adapter: a };
  });
  adapter = createComposite(sources);
} else {
  adapter = ADAPTERS[serverConfig.dataSource];
  if (!adapter) throw new Error(`Unknown dataSource: ${serverConfig.dataSource}`);
}

export default adapter;
