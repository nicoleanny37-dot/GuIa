/**
 * Gera worker.js a partir de src/worker.js.
 *
 * Observação: esta é uma estrutura inicial mínima.
 * Quando os arquivos reais src/comum.js e src/bot-responsavel.js forem recuperados,
 * adapte este construtor para incorporá-los. Não substitua o bot antigo por esta
 * base sem comparar as rotas e os recursos existentes.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const sourcePath = resolve("src/worker.js");
const outputPath = resolve("worker.js");

const source = await readFile(sourcePath, "utf8");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, source, "utf8");

console.log(`Arquivo gerado: ${outputPath}`);
