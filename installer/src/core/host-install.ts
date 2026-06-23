import { buildRcloneInstallTask } from "./backup";
import type { InstallerState, InstallTask } from "./types";

// Host package installs for a new-site build: Docker, Caddy, and (when
// off-server backups are enabled) rclone. Each is gated by detection and the
// --no-host-install flags, so re-runs and managed hosts skip what they already have.
export function buildHostInstallTasks(state: InstallerState): InstallTask[] {
  const sudo = state.host.sudo ? "sudo " : "";
  const tasks: InstallTask[] = [];

  if (state.installDocker && !state.host.docker) {
    tasks.push({
      id: "install-docker",
      title: "Install Docker Engine",
      description: "Install Docker from the official apt repository.",
      privileged: true,
      command: [
        "sh",
        "-lc",
        `${sudo}apt update && ${sudo}apt install -y ca-certificates curl && ${sudo}install -m 0755 -d /etc/apt/keyrings && ${sudo}curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc && ${sudo}chmod a+r /etc/apt/keyrings/docker.asc && ${sudo}tee /etc/apt/sources.list.d/docker.sources >/dev/null <<'EOF'\nTypes: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: $(. /etc/os-release && echo "\${UBUNTU_CODENAME:-$VERSION_CODENAME}")\nComponents: stable\nArchitectures: $(dpkg --print-architecture)\nSigned-By: /etc/apt/keyrings/docker.asc\nEOF\n${sudo}apt update && ${sudo}apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`
      ]
    });
  }

  if (state.installCaddy && !state.host.caddy) {
    tasks.push({
      id: "install-caddy",
      title: "Install Caddy",
      description: "Install Caddy from the official package repository.",
      privileged: true,
      command: [
        "sh",
        "-lc",
        `${sudo}apt install -y debian-keyring debian-archive-keyring apt-transport-https curl && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | ${sudo}gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | ${sudo}tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null && ${sudo}chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list && ${sudo}apt update && ${sudo}apt install -y caddy`
      ]
    });
  }

  if (state.installBun && !state.host.bun) {
    tasks.push({
      id: "install-bun",
      title: "Install Bun",
      description: "Install the Bun runtime to /usr/local for the control panel.",
      privileged: true,
      command: [
        "sh",
        "-lc",
        `curl -fsSL https://bun.sh/install | ${sudo}env BUN_INSTALL=/usr/local bash`
      ]
    });
  }

  const rcloneTask = buildRcloneInstallTask(state);
  if (rcloneTask) {
    tasks.push(rcloneTask);
  }

  return tasks;
}
