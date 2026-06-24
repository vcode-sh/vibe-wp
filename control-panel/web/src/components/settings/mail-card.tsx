/**
 * MailCard — settings card for the SMTP relay configuration (__global__).
 * The password is write-only: it shows "●●●●● (saved)" when hasPassword is
 * true, and is only sent when the user types a new value (preserve-existing-
 * secret). "Send test" prompts for a recipient and shows the redacted
 * transcript returned by the server.
 */
import { Label } from "@control-panel/ui/components/label";
import {
	NativeSelect,
	NativeSelectOption,
} from "@control-panel/ui/components/native-select";
import { Switch } from "@control-panel/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { smtpConfigQuery } from "@/data/queries";
import { orpc } from "@/lib/orpc/client";

const GLOBAL_SITE_ID = "__global__";

export function MailCard() {
	const query = useQuery(smtpConfigQuery(GLOBAL_SITE_ID));
	return (
		<QueryBoundary
			errorMessage="Couldn't load mail settings."
			hasData={query.data !== undefined}
			isError={query.isError}
			isLoading={query.isLoading}
			onRetry={() => query.refetch()}
			skeletonClassName="h-96 w-full"
		>
			{query.data ? <MailForm global={query.data.global} /> : null}
		</QueryBoundary>
	);
}

type MaskedRow = Record<string, unknown> | null;

function str(row: MaskedRow, key: string): string {
	const v = row?.[key];
	return typeof v === "string" ? v : "";
}

function num(row: MaskedRow, key: string, fallback: number): number {
	const v = row?.[key];
	return typeof v === "number" ? v : fallback;
}

function MailForm({ global: row }: { global: MaskedRow }) {
	const qc = useQueryClient();

	const [mode, setMode] = useState<"off" | "relay" | "log">(
		(str(row, "mode") as "off" | "relay" | "log") || "off"
	);
	const [host, setHost] = useState(str(row, "host"));
	const [port, setPort] = useState(num(row, "port", 587));
	const [secure, setSecure] = useState<"starttls" | "tls" | "none">(
		(str(row, "secure") as "starttls" | "tls" | "none") || "starttls"
	);
	const [auth, setAuth] = useState(str(row, "auth") !== "off");
	const [username, setUsername] = useState(str(row, "username"));
	const [password, setPassword] = useState("");
	const [fromAddress, setFromAddress] = useState(str(row, "fromAddress"));
	const [fromName, setFromName] = useState(str(row, "fromName"));
	const [testTo, setTestTo] = useState("");
	const [testTranscript, setTestTranscript] = useState<string | null>(null);

	const hasPassword = row?.hasPassword === true;

	const save = useMutation(orpc.smtpConfigSet.mutationOptions());
	const test = useMutation(orpc.smtpTest.mutationOptions());

	async function handleSave() {
		try {
			const patch: Record<string, unknown> = {
				siteId: GLOBAL_SITE_ID,
				mode,
				host: host || undefined,
				port,
				secure,
				auth: auth ? "on" : "off",
				username: username || undefined,
				fromAddress: fromAddress || undefined,
				fromName: fromName || undefined,
			};
			if (password) {
				patch.password = password;
			}
			await save.mutateAsync(patch as Parameters<typeof save.mutateAsync>[0]);
			await qc.invalidateQueries(smtpConfigQuery(GLOBAL_SITE_ID));
			setPassword("");
			toast.success("Mail settings saved.");
		} catch {
			toast.error("Failed to save mail settings.");
		}
	}

	async function handleTest() {
		const recipient = testTo.trim();
		if (!recipient) {
			toast.error("Enter a recipient address before sending a test.");
			return;
		}
		setTestTranscript(null);
		try {
			const result = await test.mutateAsync({
				siteId: GLOBAL_SITE_ID,
				to: recipient,
			});
			setTestTranscript(result.message ?? "");
			if (result.ok) {
				toast.success("Test email sent.");
			} else {
				toast.error("Test email failed — see transcript below.");
			}
		} catch {
			toast.error("Couldn't send a test email.");
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">SMTP relay</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4">
				<p className="text-muted-foreground text-xs">
					Configure outbound mail for WordPress. Off disables sending entirely;
					Log captures messages without delivering them; Relay sends through the
					configured SMTP server.
				</p>

				{/* Mode */}
				<div className="grid gap-1.5">
					<Label htmlFor="smtp-mode">Mode</Label>
					<NativeSelect
						className="w-full"
						id="smtp-mode"
						onChange={(e) => setMode(e.target.value as "off" | "relay" | "log")}
						value={mode}
					>
						<NativeSelectOption value="off">Off</NativeSelectOption>
						<NativeSelectOption value="relay">Relay</NativeSelectOption>
						<NativeSelectOption value="log">Log</NativeSelectOption>
					</NativeSelect>
				</div>

				{mode === "relay" ? (
					<p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-muted-foreground text-xs dark:border-amber-800 dark:bg-amber-950">
						<strong>Staging guard:</strong> relay is disabled on staging sites
						by default. To enable outbound mail on staging, set{" "}
						<code>VIBE_WP_DISABLE_OUTBOUND_MAIL=0</code> in the site env file.
					</p>
				) : null}

				{/* Host */}
				<div className="grid gap-1.5">
					<Label htmlFor="smtp-host">SMTP host</Label>
					<Input
						id="smtp-host"
						onChange={(e) => setHost(e.target.value)}
						placeholder="smtp.example.com"
						value={host}
					/>
				</div>

				{/* Port */}
				<div className="grid gap-1.5">
					<Label htmlFor="smtp-port">Port</Label>
					<Input
						id="smtp-port"
						max={65_535}
						min={1}
						onChange={(e) => setPort(Number(e.target.value) || 587)}
						placeholder="587"
						type="number"
						value={port}
					/>
				</div>

				{/* Secure */}
				<div className="grid gap-1.5">
					<Label htmlFor="smtp-secure">Encryption</Label>
					<NativeSelect
						className="w-full"
						id="smtp-secure"
						onChange={(e) =>
							setSecure(e.target.value as "starttls" | "tls" | "none")
						}
						value={secure}
					>
						<NativeSelectOption value="starttls">STARTTLS</NativeSelectOption>
						<NativeSelectOption value="tls">TLS / SSL</NativeSelectOption>
						<NativeSelectOption value="none">None</NativeSelectOption>
					</NativeSelect>
				</div>

				{/* Auth toggle */}
				<div className="flex items-center justify-between gap-4">
					<Label htmlFor="smtp-auth">SMTP authentication</Label>
					<Switch checked={auth} id="smtp-auth" onCheckedChange={setAuth} />
				</div>

				{auth ? (
					<>
						{/* Username */}
						<div className="grid gap-1.5">
							<Label htmlFor="smtp-username">Username</Label>
							<Input
								autoComplete="username"
								id="smtp-username"
								onChange={(e) => setUsername(e.target.value)}
								placeholder="user@example.com"
								value={username}
							/>
						</div>

						{/* Password */}
						<div className="grid gap-1.5">
							<Label htmlFor="smtp-password">Password</Label>
							<Input
								autoComplete="new-password"
								id="smtp-password"
								onChange={(e) => setPassword(e.target.value)}
								placeholder={hasPassword ? "●●●●● (saved)" : "Enter password"}
								type="password"
								value={password}
							/>
							{hasPassword && !password ? (
								<p className="text-muted-foreground text-xs">
									Leave blank to keep the existing password.
								</p>
							) : null}
						</div>
					</>
				) : null}

				{/* From address */}
				<div className="grid gap-1.5">
					<Label htmlFor="smtp-from">From address</Label>
					<Input
						autoComplete="off"
						id="smtp-from"
						onChange={(e) => setFromAddress(e.target.value)}
						placeholder="wordpress@example.com"
						type="email"
						value={fromAddress}
					/>
				</div>

				{/* From name */}
				<div className="grid gap-1.5">
					<Label htmlFor="smtp-from-name">From name</Label>
					<Input
						autoComplete="off"
						id="smtp-from-name"
						onChange={(e) => setFromName(e.target.value)}
						placeholder="My WordPress Site"
						value={fromName}
					/>
				</div>

				{/* Actions */}
				<div className="grid gap-2">
					<div className="grid gap-1.5">
						<Label htmlFor="smtp-test-to">Test recipient</Label>
						<Input
							autoComplete="off"
							id="smtp-test-to"
							onChange={(e) => setTestTo(e.target.value)}
							placeholder="you@example.com"
							type="email"
							value={testTo}
						/>
					</div>
					<div className="flex gap-2">
						<Button disabled={save.isPending} onClick={handleSave}>
							{save.isPending ? "Saving…" : "Save"}
						</Button>
						<Button
							disabled={test.isPending}
							onClick={handleTest}
							variant="outline"
						>
							{test.isPending ? "Sending…" : "Send test"}
						</Button>
					</div>
				</div>

				{/* Transcript */}
				{testTranscript === null ? null : (
					<div className="grid gap-1.5">
						<Label>Test transcript</Label>
						<pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">
							{testTranscript || "(no output)"}
						</pre>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
