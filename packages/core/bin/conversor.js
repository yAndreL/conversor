#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const carregador = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
const entrada = fileURLToPath(new URL("./executar.mjs", import.meta.url));
const resultado = spawnSync(process.execPath, ["--import", carregador, entrada, ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(resultado.status ?? 1);
