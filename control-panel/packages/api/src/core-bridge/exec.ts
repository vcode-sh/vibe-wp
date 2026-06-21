import { redact } from "./redact";

export type VibeEnv = "local" | "stage" | "prod" | "external";

export const VIBE_OPS = {
	smoke: { argv: ["smoke"], stream: false },
	backups: { argv: ["backups"], stream: false },
	backup: { argv: ["backup"], stream: true },
} as const;

export type VibeOp = keyof typeof VIBE_OPS;

export function buildVibeArgv(
	siteDir: string,
	env: VibeEnv,
	op: VibeOp
): string[] {
	const spec = VIBE_OPS[op];
	if (!spec) {
		throw new Error(`Disallowed vibe op: ${String(op)}`);
	}
	return [`${siteDir}/bin/vibe`, env, ...spec.argv];
}

export async function runVibe(
	siteDir: string,
	env: VibeEnv,
	op: VibeOp,
	opts: { timeoutMs?: number } = {}
): Promise<{ stdout: string; stderr: string; code: number }> {
	const argv = buildVibeArgv(siteDir, env, op);
	const proc = Bun.spawn(argv, {
		cwd: siteDir,
		stdout: "pipe",
		stderr: "pipe",
	});
	const timer = setTimeout(() => proc.kill(), opts.timeoutMs ?? 60_000);
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const code = await proc.exited;
	clearTimeout(timer);
	return { stdout: redact(stdout), stderr: redact(stderr), code };
}

export function streamVibe(siteDir: string, env: VibeEnv, op: VibeOp) {
	const proc = Bun.spawn(buildVibeArgv(siteDir, env, op), {
		cwd: siteDir,
		stdout: "pipe",
		stderr: "pipe",
	});
	async function* lines(): AsyncIterable<string> {
		const reader = proc.stdout.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		for (;;) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			buffer += decoder.decode(value, { stream: true });
			let nl = buffer.indexOf("\n");
			while (nl !== -1) {
				yield redact(buffer.slice(0, nl));
				buffer = buffer.slice(nl + 1);
				nl = buffer.indexOf("\n");
			}
		}
		if (buffer.length > 0) {
			yield redact(buffer);
		}
	}
	return { proc, lines: lines() };
}
