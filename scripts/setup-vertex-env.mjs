/**
 * One-shot: set the five Vertex AI env vars in Vercel (Production + Preview)
 * from a Google service-account JSON key.
 *
 *   node scripts/setup-vertex-env.mjs <path-to-service-account-key.json>
 *
 * Secrets (project id, client email, private key) are read from the key file at
 * runtime and piped to `vercel env add` via stdin — they are never printed.
 * Requires the project to already be linked (`vercel link`) and you to be logged in.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const keyPath = process.argv[2];
if (!keyPath) {
  console.error("Usage: node scripts/setup-vertex-env.mjs <path-to-service-account-key.json>");
  process.exit(1);
}

let sa;
try {
  sa = JSON.parse(readFileSync(keyPath, "utf8"));
} catch (err) {
  console.error(`Could not read/parse key file at ${keyPath}: ${err.message}`);
  process.exit(1);
}
for (const field of ["project_id", "client_email", "private_key"]) {
  if (!sa[field]) {
    console.error(`Key file is missing "${field}" — is this a service-account JSON key?`);
    process.exit(1);
  }
}

const vars = {
  LLM_PROVIDER: "vertex",
  GCP_LOCATION: "us-central1",
  GCP_PROJECT_ID: sa.project_id,
  GCP_SERVICE_ACCOUNT_EMAIL: sa.client_email,
  GCP_SERVICE_ACCOUNT_PRIVATE_KEY: sa.private_key,
};
const ENVIRONMENTS = ["production", "preview"];

function vercel(args, input) {
  return spawnSync("npx", ["--yes", "vercel", ...args], {
    input,
    stdio: ["pipe", "inherit", "inherit"],
    shell: true,
  });
}

for (const [name, value] of Object.entries(vars)) {
  for (const env of ENVIRONMENTS) {
    // Remove any prior value first so this is idempotent (ignore "not found").
    vercel(["env", "rm", name, env, "--yes"]);
    const res = vercel(["env", "add", name, env], value);
    if (res.status !== 0) {
      console.error(`\nFailed to set ${name} for ${env} (exit ${res.status}).`);
      process.exit(res.status ?? 1);
    }
    // Never log the value — only that it was set.
    console.log(`set ${name} [${env}]`);
  }
}

console.log("\n✅ All 5 Vertex env vars set for Production + Preview.");
console.log("Next: redeploy production so they take effect →  npx vercel --prod");
