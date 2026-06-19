import type { InstallerState } from "./types";

export function renderCaddyfile(state: InstallerState): string {
  const hosts = [state.productionDomain.trim().toLowerCase()];
  if (state.wwwAlias && !hosts[0]?.startsWith("www.")) {
    hosts.push(`www.${hosts[0]}`);
  }

  const production = `${hosts.join(", ")} {
    encode zstd gzip
    reverse_proxy 127.0.0.1:${state.productionHttpPort} {
        health_uri /
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

${state.stagingDomain.trim().toLowerCase()} {
    encode zstd gzip
    reverse_proxy 127.0.0.1:${state.stagingHttpPort} {
        health_uri /
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
