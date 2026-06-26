/**
 * NotifyCard — settings card for the shared monitor alert channels (__global__).
 * The Telegram bot token is write-only: it shows "•••• (saved)" when hasToken,
 * and is only sent when the user types a new value. A "Send test" button fires
 * one alert through whatever channels are currently saved.
 */
import { Label } from "@control-panel/ui/components/label";
import { Switch } from "@control-panel/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { notifyConfigQuery } from "@/data/queries";
import { orpc } from "@/lib/orpc/client";
import { invalidateNotifyConfigSaved } from "@/lib/realtime/immediate-invalidation";

const GLOBAL_SITE_ID = "__global__";

export function NotifyCard() {
	const query = useQuery(notifyConfigQuery(GLOBAL_SITE_ID));
	return (
		<QueryBoundary
			errorMessage="Couldn't load alert channels."
			hasData={query.data !== undefined}
			isError={query.isError}
			isLoading={query.isLoading}
			onRetry={() => query.refetch()}
			skeletonClassName="h-64 w-full"
		>
			{query.data ? <NotifyForm global={query.data.global} /> : null}
		</QueryBoundary>
	);
}

type MaskedRow = Record<string, unknown> | null;

function str(row: MaskedRow, key: string): string {
	const v = row?.[key];
	return typeof v === "string" ? v : "";
}

function NotifyForm({ global: row }: { global: MaskedRow }) {
	const qc = useQueryClient();

	const [chatId, setChatId] = useState(str(row, "telegramChatId"));
	const [token, setToken] = useState("");
	const [webhookUrl, setWebhookUrl] = useState(str(row, "webhookUrl"));
	const [email, setEmail] = useState(str(row, "email"));
	const [alertOnWarn, setAlertOnWarn] = useState(row?.alertOnWarn === 1);

	const hasToken = row?.hasToken === true;

	const save = useMutation(orpc.notifyConfigSet.mutationOptions());
	const test = useMutation(orpc.notifyTest.mutationOptions());

	async function handleSave() {
		try {
			const patch: Record<string, unknown> = {
				siteId: GLOBAL_SITE_ID,
				telegramChatId: chatId || undefined,
				webhookUrl: webhookUrl || undefined,
				email: email || undefined,
				alertOnWarn: alertOnWarn ? 1 : 0,
			};
			if (token) {
				patch.telegramToken = token;
			}
			await save.mutateAsync(patch as Parameters<typeof save.mutateAsync>[0]);
			await invalidateNotifyConfigSaved(qc);
			setToken("");
			toast.success("Alert channels saved.");
		} catch {
			toast.error("Failed to save alert channels.");
		}
	}

	async function handleTest() {
		try {
			const result = await test.mutateAsync({ siteId: GLOBAL_SITE_ID });
			if (result.ok) {
				toast.success(result.message || "Test alert sent.");
			} else {
				toast.error(result.message || "Test alert failed.");
			}
		} catch {
			toast.error("Couldn't send a test alert.");
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Alert channels</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4">
				<p className="text-muted-foreground text-xs">
					The cron health monitor sends alerts through these channels when a
					check fails (and on warnings when the toggle below is on).
				</p>
				<div className="grid gap-1.5">
					<Label htmlFor="notify-chat-id">Telegram chat ID</Label>
					<Input
						id="notify-chat-id"
						onChange={(e) => setChatId(e.target.value)}
						placeholder="123456789"
						value={chatId}
					/>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="notify-token">Telegram bot token</Label>
					<Input
						autoComplete="new-password"
						id="notify-token"
						onChange={(e) => setToken(e.target.value)}
						placeholder={hasToken ? "•••••••• (saved)" : "Enter bot token"}
						type="password"
						value={token}
					/>
					{hasToken && !token ? (
						<p className="text-muted-foreground text-xs">
							Leave blank to keep the existing token.
						</p>
					) : null}
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="notify-webhook">Webhook URL</Label>
					<Input
						id="notify-webhook"
						onChange={(e) => setWebhookUrl(e.target.value)}
						placeholder="https://…"
						value={webhookUrl}
					/>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="notify-email">Email</Label>
					<Input
						autoComplete="off"
						id="notify-email"
						onChange={(e) => setEmail(e.target.value)}
						placeholder="ops@example.com"
						type="email"
						value={email}
					/>
				</div>
				<div className="flex items-center justify-between gap-4">
					<Label htmlFor="notify-alert-on-warn">Alert on warnings</Label>
					<Switch
						checked={alertOnWarn}
						id="notify-alert-on-warn"
						onCheckedChange={setAlertOnWarn}
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
			</CardContent>
		</Card>
	);
}
