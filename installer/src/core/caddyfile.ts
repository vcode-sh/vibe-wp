import type { InstallerState } from "./types";

export function renderCaddyfile(state: InstallerState): string {
  const hosts = [state.productionDomain.trim().toLowerCase()];
  if (state.wwwAlias && !hosts[0]?.startsWith("www.")) {
    hosts.push(`www.${hosts[0]}`);
  }

  const production = `${hosts.join(", ")} {
    encode zstd gzip
    reverse_proxy 127.0.0.1:${state.productionHttpPort} {
        health_uri /healthz
        health_interval 30s
        health_timeout 5s
        transport http {
            dial_timeout 2s
            response_header_timeout 120s
        }
    }
}`;

  if (!state.stagingEnabled) {
    return `${production}\n`;
  }

  return `${production}

${renderStagingBlock(state)}`;
}

// Just the staging site block, for staging-only mode where it is written to its
// own snippet (vibe-wp-<slug>-stage.caddy) without touching the prod snippet.
export function renderStagingCaddyfile(state: InstallerState): string {
  return renderStagingBlock(state);
}

function renderStagingBlock(state: InstallerState): string {
  return `${state.stagingDomain.trim().toLowerCase()} {
    encode zstd gzip
    reverse_proxy 127.0.0.1:${state.stagingHttpPort} {
        health_uri /healthz
        health_interval 30s
        health_timeout 5s
        transport http {
            dial_timeout 2s
            response_header_timeout 120s
        }
    }
}
`;
}
