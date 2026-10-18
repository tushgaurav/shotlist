import fs from "node:fs";
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

// Static segments so the server tracer includes this file and nothing else.
const RDS_CA_PATH = path.join(process.cwd(), "certs", "rds-global-bundle.pem");
const RDS_CA_RELATIVE = "certs/rds-global-bundle.pem";

function stripQueryParam(connectionString: string, name: string): string {
  const queryStart = connectionString.indexOf("?");
  if (queryStart === -1) return connectionString;
  const base = connectionString.slice(0, queryStart);
  const params = connectionString
    .slice(queryStart + 1)
    .split("&")
    .filter((part) => part.length > 0 && !part.startsWith(`${name}=`));
  return params.length === 0 ? base : `${base}?${params.join("&")}`;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Add it to .env.local.");
  }

  const marker = "sslrootcert=";
  const start = connectionString.indexOf(marker);
  if (start === -1) return new Pool({ connectionString, max: 10 });

  const valueStart = start + marker.length;
  const valueEnd = connectionString.indexOf("&", valueStart);
  const sslrootcert = decodeURIComponent(
    connectionString.slice(valueStart, valueEnd === -1 ? undefined : valueEnd),
  );
  if (path.isAbsolute(sslrootcert)) return new Pool({ connectionString, max: 10 });
  if (sslrootcert !== RDS_CA_RELATIVE) {
    throw new Error(`Unsupported sslrootcert "${sslrootcert}". Point it at ${RDS_CA_RELATIVE}.`);
  }

  // pg opens sslrootcert itself, and that parsed ssl config replaces any ssl
  // option passed to Pool. Read the bundled CA here and drop those params.
  let ca: string;
  try {
    ca = fs.readFileSync(RDS_CA_PATH, "utf8");
  } catch (error) {
    throw new Error(
      `Database CA file not found at ${RDS_CA_PATH}. Commit certs/rds-global-bundle.pem so production can verify the RDS certificate.`,
      { cause: error },
    );
  }

  const withoutSslFiles = stripQueryParam(stripQueryParam(connectionString, "sslrootcert"), "sslmode");
  return new Pool({
    connectionString: withoutSslFiles,
    max: 10,
    ssl: { ca, rejectUnauthorized: true },
  });
}

// Reuse one pool across hot reloads in development so RDS connections aren't exhausted.
const pool = globalForDb.pool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
