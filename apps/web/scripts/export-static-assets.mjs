import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const source = fs.readFileSync(path.join(root, "js/data.js"), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const assets = sandbox.window.PARKWISE_ASSETS;
if (!Array.isArray(assets) || assets.length < 1) {
  throw new Error("PARKWISE_ASSETS missing");
}
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "seed-data.json");
fs.writeFileSync(out, JSON.stringify(assets, null, 2));
console.log(`Wrote ${assets.length} assets to ${out}`);
