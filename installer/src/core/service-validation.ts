import type { InstallerState } from "./types";

// Validates the data-service connections a fresh install needs. external-services
// brings its own DB + Redis; shared-db uses the SHARED MariaDB (the connection is
// supplied by the panel) but its OWN internal Redis, so only its DB is validated.
// Other modes validate no services here.
export function validateServices(state: InstallerState): string[] {
  if (state.mode === "external-services") {
    return validateExternalServices(state);
  }
  return state.mode === "shared-db" ? validateSharedDatabase(state) : [];
}

// Shared by external-services and shared-db: both need a full DB connection.
function validateDbConnection(state: InstallerState, label: string, hostHint: string): string[] {
  const errors: string[] = [];
  const fields: [string, string][] = [
    [state.extDbHost.trim(), `${label} database host is required${hostHint}.`],
    [state.extDbName.trim(), `${label} database name is required.`],
    [state.extDbUser.trim(), `${label} database user is required.`],
    [state.extDbPassword, `${label} database password is required.`]
  ];
  for (const [value, message] of fields) {
    if (!value) {
      errors.push(message);
    }
  }
  return errors;
}

function validateExternalServices(state: InstallerState): string[] {
  const errors = validateDbConnection(state, "External", ", for example db.example.com:3306");
  if (!state.extRedisHost.trim()) {
    errors.push("External Redis host is required.");
  }
  const redisPort = Number(state.extRedisPort);
  if (!Number.isInteger(redisPort) || redisPort < 1 || redisPort > 65_535) {
    errors.push("External Redis port must be between 1 and 65535.");
  }
  return errors;
}

function validateSharedDatabase(state: InstallerState): string[] {
  return validateDbConnection(state, "Shared", " (the panel sets this to db)");
}
