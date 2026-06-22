import { auth } from "@control-panel/auth";

const TRAILING_NEWLINE = /\r?\n$/;

interface ResetArgs {
	email: string;
}

function usage(): never {
	console.error(
		"Usage: bun run src/cli/reset-password.ts --email <email> --password-stdin"
	);
	process.exit(1);
}

function parseArgs(argv: string[]): ResetArgs {
	let email = "";
	let passwordStdin = false;

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--email") {
			const value = argv[i + 1];
			if (!value) {
				usage();
			}
			email = value.trim().toLowerCase();
			i += 1;
			continue;
		}
		if (arg === "--password-stdin") {
			passwordStdin = true;
			continue;
		}
		usage();
	}

	if (!(email && passwordStdin)) {
		usage();
	}

	return { email };
}

async function readPasswordFromStdin() {
	const input = await Bun.stdin.text();
	return input.replace(TRAILING_NEWLINE, "");
}

async function main() {
	const args = parseArgs(Bun.argv.slice(2));
	const newPassword = await readPasswordFromStdin();
	const ctx = await auth.$context;
	const minLength = ctx.password.config.minPasswordLength;
	const maxLength = ctx.password.config.maxPasswordLength;

	if (newPassword.length < minLength) {
		console.error(`panel: password must be at least ${minLength} characters`);
		process.exit(1);
	}
	if (newPassword.length > maxLength) {
		console.error(`panel: password must be at most ${maxLength} characters`);
		process.exit(1);
	}

	const found = await ctx.internalAdapter.findUserByEmail(args.email, {
		includeAccounts: true,
	});
	if (!found) {
		console.error(`panel: no user found for ${args.email}`);
		process.exit(1);
	}

	const hash = await ctx.password.hash(newPassword);
	const credentialAccount = found.accounts.find(
		(account) => account.providerId === "credential"
	);

	if (credentialAccount) {
		await ctx.internalAdapter.updatePassword(found.user.id, hash);
	} else {
		await ctx.internalAdapter.createAccount({
			userId: found.user.id,
			providerId: "credential",
			accountId: found.user.id,
			password: hash,
		});
	}

	await ctx.internalAdapter.deleteUserSessions(found.user.id);
	console.log(
		`panel: password reset for ${found.user.email}; sessions revoked`
	);
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`panel: password reset failed: ${message}`);
	process.exit(1);
});
