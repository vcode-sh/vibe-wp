import { emptyHostFacts } from "./defaults";
import type { HostFacts } from "./types";

const osNamePattern = /^PRETTY_NAME="?([^"\n]+)"?/m;
const osVersionPattern = /^VERSION_ID="?([^"\n]+)"?/m;

async function runText(command: string[], timeoutMs = 2500): Promise<string | null> {
  try {
    const proc = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    clearTimeout(timer);
    return output.trim() || null;
  } catch {
    return null;
  }
}

async function commandVersion(
  command: string,
  args: string[] = ["--version"]
): Promise<string | null> {
  const path = await runText(["sh", "-lc", `command -v ${command}`]);
  if (!path) {
    return null;
  }
  const version = await runText([command, ...args]);
  return version ? (version.split("\n")[0] ?? path) : path;
}

export async function detectHostFacts(): Promise<HostFacts> {
  const facts = emptyHostFacts();
  const osRelease = await runText(["sh", "-lc", "cat /etc/os-release 2>/dev/null || true"]);
  const osName = osRelease?.match(osNamePattern)?.[1];
  facts.osName = osName ?? (await runText(["uname", "-s"])) ?? facts.osName;
  facts.osVersion = osRelease?.match(osVersionPattern)?.[1] ?? facts.osVersion;
  facts.kernel = (await runText(["uname", "-r"])) ?? facts.kernel;
  facts.arch = (await runText(["uname", "-m"])) ?? facts.arch;
  facts.user = (await runText(["id", "-un"])) ?? facts.user;
  facts.sudo = Boolean(await runText(["sh", "-lc", 'test "$(id -u)" = 0 || command -v sudo']));
  facts.docker = await commandVersion("docker", ["--version"]);
  facts.compose = facts.docker ? await runText(["docker", "compose", "version"]) : null;
  facts.caddy = await commandVersion("caddy", ["version"]);
  facts.git = await commandVersion("git", ["--version"]);
  facts.curl = await commandVersion("curl", ["--version"]);
  facts.cpuCount =
    Number(
      (await runText([
        "sh",
        "-lc",
        "getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 0"
      ])) ?? "0"
    ) || null;

  const memKb = Number(
    (await runText([
      "sh",
      "-lc",
      "awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0"
    ])) ?? "0"
  );
  facts.totalMemoryMb = memKb > 0 ? Math.round(memKb / 1024) : null;

  facts.publicIp =
    (await runText(
      [
        "sh",
        "-lc",
        "curl -fsS --max-time 2 https://api.ipify.org 2>/dev/null || curl -fsS --max-time 2 https://ifconfig.me 2>/dev/null || true"
      ],
      3500
    )) ?? null;

  return facts;
}
