export function usage(): string {
  return `vibe-wp-installer

Usage:
  vibe-wp-installer
  vibe-wp-installer --dry-run
  vibe-wp-installer --local
  vibe-wp-installer --export-plan install-plan.json
  vibe-wp-installer --headless install-plan.json [--yes]
  vibe-wp-installer --headless install-plan.json --yes --resume
  vibe-wp-installer --headless install-plan.json --support-bundle /tmp
  echo '<json>' | vibe-wp-installer --headless-json

Options:
  --bootstrap-panel      Bootstrap the control panel on a bare server
  --access domain|magic-dns|ip-port|localhost
                         How the control panel is reached (default: magic-dns)
  --admin-password P     Control panel owner password (never printed/logged)
  --resume               Skip steps already completed in a previous --headless run
  --support-bundle <dir> Write a redacted diagnostics bundle (host, journal, plan)
  --no-harden            Skip server hardening; --no-monitor skips the health timer
  --domain <host>        Production domain (derives slug, ports, staging, title)
  --admin-email <email>  WordPress admin email
  --staging-domain <h>   Staging domain (enables staging)
  --mode <mode>          Install mode: new-site, manage-existing,
                         remove-existing, update-existing, staging-only,
                         external-services, panel-bootstrap
  --install-dir <path>   Install directory, default /opt/vibe-wp
  --repo <url>           Vibe WP git repository
  --ref <ref>            Git branch or tag, default main
  --local                Use a safe local sandbox for macOS/UI testing
  --no-caddy             Do not manage Caddy
  --no-www               Do not add a www. alias or require its DNS
  --no-host-install      Do not install missing host packages
  --no-harden            Do not apply server hardening (firewall, fail2ban, auto-updates)
  --no-monitor           Do not install the hourly health-monitoring timer
  --monitor-email <addr> Email address for health alerts
  --monitor-webhook <url> Webhook URL for health alerts
  --ext-db-host <h:port> External MariaDB host (external-services mode)
  --ext-db-name <name>   External database name
  --ext-db-user <user>   External database user
  --ext-db-password <pw> External database password
  --ext-redis-host <h>   External Redis host
  --ext-redis-port <p>   External Redis port
  --ext-redis-password <pw> External Redis password
  --perf KEY=VALUE       Override a performance setting (repeatable),
                         e.g. --perf REDIS_MAXMEMORY=512mb
  --compact              Force compact UI
  --ascii                Avoid Unicode UI characters
  --version              Print version
`;
}
