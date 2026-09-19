import { existsSync, rmSync, cpSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const source = resolve(root, "node_modules", "@fontsource-variable", "vazirmatn");
const target = resolve(root, "dist", "vendor", "vazirmatn");

if (!existsSync(source)) {
  throw new Error("Vazirmatn package is missing. Run npm install first.");
}

rmSync(target, { recursive: true, force: true });
mkdirSync(dirname(target), { recursive: true });
cpSync(source, target, { recursive: true });
console.log("Vazirmatn bundled for offline use:", target);
