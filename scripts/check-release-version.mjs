import { readFileSync } from "node:fs";

const tag = process.env.RELEASE_TAG ?? "";
const tagMatch = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$/.exec(tag);

if (!tagMatch) {
  console.error(`Release tag must use semantic version format such as v0.1.0; received: ${tag || "<empty>"}`);
  process.exit(1);
}

const expectedVersion = tagMatch[1];
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const tauriVersion = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version;
const cargoToml = readFileSync("src-tauri/Cargo.toml", "utf8");
const cargoVersion = /^\[package\]\s*$[\s\S]*?^version\s*=\s*"([^"]+)"\s*$/m.exec(cargoToml)?.[1];

const versions = {
  "package.json": packageVersion,
  "src-tauri/tauri.conf.json": tauriVersion,
  "src-tauri/Cargo.toml": cargoVersion,
};

const mismatches = Object.entries(versions).filter(([, version]) => version !== expectedVersion);
if (mismatches.length > 0) {
  console.error(`Release tag ${tag} does not match every application version:`);
  for (const [path, version] of Object.entries(versions)) {
    console.error(`- ${path}: ${version ?? "<missing>"}`);
  }
  process.exit(1);
}

console.log(`Release versions match ${tag}.`);
