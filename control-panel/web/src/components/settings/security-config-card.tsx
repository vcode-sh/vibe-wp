import { Label } from "@control-panel/ui/components/label";
import { Switch } from "@control-panel/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { securityConfigQuery } from "@/data/queries";
import { orpc } from "@/lib/orpc/client";
import { invalidateSecurityConfigSaved } from "@/lib/realtime/immediate-invalidation";

function ToggleRow({
	id,
	label,
	checked,
	onChange,
}: {
	checked: boolean;
	id: string;
	label: string;
	onChange: (value: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between gap-4">
			<Label htmlFor={id}>{label}</Label>
			<Switch checked={checked} id={id} onCheckedChange={onChange} />
		</div>
	);
}

export function SecurityConfigCard() {
	const qc = useQueryClient();
	const query = useQuery(securityConfigQuery());
	const save = useMutation(orpc.securityConfigSet.mutationOptions());
	const config = query.data?.config;
	const [firewall, setFirewall] = useState(true);
	const [fail2ban, setFail2ban] = useState(true);
	const [maxRetry, setMaxRetry] = useState(5);
	const [findTime, setFindTime] = useState("10m");
	const [banTime, setBanTime] = useState("1h");

	useEffect(() => {
		if (!config) {
			return;
		}
		setFirewall(config.firewall.enabled);
		setFail2ban(config.fail2ban.enabled);
		setMaxRetry(config.fail2ban.maxRetry);
		setFindTime(config.fail2ban.findTime);
		setBanTime(config.fail2ban.banTime);
	}, [config]);

	async function handleSave() {
		try {
			await save.mutateAsync({
				firewallEnabled: firewall,
				fail2banEnabled: fail2ban,
				maxRetry: Math.min(10, Math.max(1, Math.trunc(maxRetry || 5))),
				findTime,
				banTime,
			});
			await invalidateSecurityConfigSaved(qc);
			toast.success("Security configuration saved.");
		} catch {
			toast.error(
				"Failed to save security configuration. Admin role required."
			);
		}
	}

	return (
		<QueryBoundary
			errorMessage="Couldn't load security configuration."
			hasData={Boolean(query.data)}
			isError={query.isError}
			isLoading={query.isLoading}
			onRetry={() => query.refetch()}
			skeletonClassName="h-56 w-full"
		>
			<Card>
				<CardHeader>
					<CardTitle className="text-sm">Firewall and fail2ban</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-4">
					<ToggleRow
						checked={firewall}
						id="security-firewall"
						label="UFW firewall"
						onChange={setFirewall}
					/>
					<ToggleRow
						checked={fail2ban}
						id="security-fail2ban"
						label="fail2ban SSH jail"
						onChange={setFail2ban}
					/>
					<div className="grid gap-4 sm:grid-cols-3">
						<div className="grid gap-1.5">
							<Label htmlFor="fail2ban-max-retry">Max retry</Label>
							<Input
								id="fail2ban-max-retry"
								max={10}
								min={1}
								onChange={(e) => setMaxRetry(Number(e.target.value))}
								type="number"
								value={maxRetry}
							/>
						</div>
						<div className="grid gap-1.5">
							<Label htmlFor="fail2ban-find-time">Find time</Label>
							<Input
								id="fail2ban-find-time"
								onChange={(e) => setFindTime(e.target.value)}
								value={findTime}
							/>
						</div>
						<div className="grid gap-1.5">
							<Label htmlFor="fail2ban-ban-time">Ban time</Label>
							<Input
								id="fail2ban-ban-time"
								onChange={(e) => setBanTime(e.target.value)}
								value={banTime}
							/>
						</div>
					</div>
					<Button
						className="justify-self-start"
						disabled={save.isPending}
						onClick={handleSave}
					>
						{save.isPending ? "Saving..." : "Save security config"}
					</Button>
				</CardContent>
			</Card>
		</QueryBoundary>
	);
}
