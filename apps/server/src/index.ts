import { criarServidor } from "./servidor.js";

const host = process.env.HOST ?? "127.0.0.1";
const porta = Number(process.env.PORT ?? 8765);
const pastaWeb = process.env.PASTA_WEB;

const app = await criarServidor(pastaWeb ? { pastaWeb } : {});
await app.listen({ host, port: porta });
process.stdout.write(`CleanTXT em http://${host}:${porta}\n`);
