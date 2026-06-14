import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { Signer } from "@aws-sdk/rds-signer";
import { awsCredentialsProvider } from "@vercel/functions/oidc";
import {
  connectionStringEnvHint,
  resolveConnectionString,
} from "./connection-string";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

let _db: DB | null = null;
let _client: ReturnType<typeof postgres> | null = null;

const DEFAULT_PG_PORT = 5432;

/**
 * How we authenticate to Postgres:
 *  - "url": a full connection string with embedded credentials (local Neon dev,
 *    or any Vercel storage integration that injects DATABASE_URL/POSTGRES_URL).
 *  - "iam": the Vercel AWS Marketplace Aurora integration, which injects PGHOST /
 *    PGUSER / AWS_ROLE_ARN / AWS_REGION (no password) and expects a short-lived
 *    RDS IAM auth token minted via Vercel OIDC federation at connect time.
 *  - "none": nothing configured.
 */
export type ConnectionMode = "url" | "iam" | "none";

/**
 * Decide how to connect from the environment. A connection string always wins
 * (lets us override anywhere); otherwise fall back to the Aurora IAM integration
 * vars. Pure function so it can be unit-tested without touching the network.
 */
export function selectConnectionMode(
  env: Record<string, string | undefined> = process.env,
): ConnectionMode {
  if (resolveConnectionString(env)) return "url";
  if (env.PGHOST && env.PGUSER && env.AWS_ROLE_ARN && env.AWS_REGION) {
    return "iam";
  }
  return "none";
}

/**
 * Build a postgres.js client for the Aurora IAM integration. The `password` is a
 * function so postgres.js re-mints a fresh RDS auth token per connection (tokens
 * expire after ~15 min). Credentials come from Vercel's OIDC federation, so no
 * AWS access keys are ever stored.
 */
function createIamClient(
  env: Record<string, string | undefined> = process.env,
): ReturnType<typeof postgres> {
  const region = env.AWS_REGION as string;
  const port = Number(env.PGPORT ?? DEFAULT_PG_PORT);
  const signer = new Signer({
    hostname: env.PGHOST as string,
    port,
    username: env.PGUSER as string,
    region,
    credentials: awsCredentialsProvider({
      roleArn: env.AWS_ROLE_ARN as string,
      clientConfig: { region },
    }),
  });

  return postgres({
    host: env.PGHOST,
    port,
    user: env.PGUSER,
    database: env.PGDATABASE || "postgres",
    password: () => signer.getAuthToken(),
    // RDS requires TLS; the managed endpoint presents an AWS-issued cert.
    ssl: { rejectUnauthorized: false },
    max: 5,
    prepare: false,
  });
}

/**
 * Lazy singleton so `next build` does not require DB config at module load.
 * Serverless-friendly: small pool, prepared statements disabled for pooled/Aurora.
 */
export function getDb(): DB {
  if (_db) return _db;

  switch (selectConnectionMode()) {
    case "url": {
      const connectionString = resolveConnectionString() as string;
      _client = postgres(connectionString, { max: 5, prepare: false });
      break;
    }
    case "iam": {
      _client = createIamClient();
      break;
    }
    default:
      throw new Error(
        `No database connection configured. Set one of ${connectionStringEnvHint()}, ` +
          `or the Aurora IAM integration vars (PGHOST, PGUSER, AWS_ROLE_ARN, AWS_REGION).`,
      );
  }

  _db = drizzle(_client, { schema });
  return _db;
}

export function getClient(): ReturnType<typeof postgres> {
  if (!_client) getDb();
  return _client!;
}
