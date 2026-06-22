import { Input } from "@/components/ui/input";
import { FieldRow } from "./field-row";
import type { Errors } from "./validation";
import type { WizardForm } from "./wizard-types";

/**
 * Step (external mode only) — bring-your-own MariaDB + Redis connection.
 * Passwords are password inputs entered over TLS; they are never echoed back,
 * logged, or shown in the review step.
 */
export function StepExternal({
	form,
	errors,
	set,
}: {
	form: WizardForm;
	errors: Errors;
	set: <K extends keyof WizardForm>(key: K, value: WizardForm[K]) => void;
}) {
	return (
		<div className="grid gap-5">
			<p className="text-muted-foreground text-sm">
				Connect this site to your own MariaDB and Redis. Credentials are sent
				over TLS and stored as secrets — they are never shown again here.
			</p>

			<div className="grid gap-4 sm:grid-cols-2">
				<FieldRow error={errors.extDbHost} label="Database host">
					{(id) => (
						<Input
							autoCapitalize="none"
							autoComplete="off"
							id={id}
							onChange={(e) => set("extDbHost", e.target.value)}
							placeholder="db.internal:3306"
							value={form.extDbHost}
						/>
					)}
				</FieldRow>
				<FieldRow error={errors.extDbName} label="Database name">
					{(id) => (
						<Input
							autoCapitalize="none"
							autoComplete="off"
							id={id}
							onChange={(e) => set("extDbName", e.target.value)}
							placeholder="wordpress"
							value={form.extDbName}
						/>
					)}
				</FieldRow>
				<FieldRow error={errors.extDbUser} label="Database user">
					{(id) => (
						<Input
							autoCapitalize="none"
							autoComplete="off"
							id={id}
							onChange={(e) => set("extDbUser", e.target.value)}
							placeholder="wp_user"
							value={form.extDbUser}
						/>
					)}
				</FieldRow>
				<FieldRow error={errors.extDbPassword} label="Database password">
					{(id) => (
						<Input
							autoComplete="new-password"
							id={id}
							onChange={(e) => set("extDbPassword", e.target.value)}
							type="password"
							value={form.extDbPassword}
						/>
					)}
				</FieldRow>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<FieldRow error={errors.extRedisHost} label="Redis host">
					{(id) => (
						<Input
							autoCapitalize="none"
							autoComplete="off"
							id={id}
							onChange={(e) => set("extRedisHost", e.target.value)}
							placeholder="redis.internal"
							value={form.extRedisHost}
						/>
					)}
				</FieldRow>
				<FieldRow error={errors.extRedisPort} label="Redis port">
					{(id) => (
						<Input
							autoComplete="off"
							id={id}
							inputMode="numeric"
							onChange={(e) => set("extRedisPort", e.target.value)}
							placeholder="6379"
							value={form.extRedisPort}
						/>
					)}
				</FieldRow>
				<FieldRow
					error={errors.extRedisPassword}
					hint="Leave blank if your Redis has no password."
					label="Redis password"
				>
					{(id) => (
						<Input
							autoComplete="new-password"
							id={id}
							onChange={(e) => set("extRedisPassword", e.target.value)}
							type="password"
							value={form.extRedisPassword}
						/>
					)}
				</FieldRow>
			</div>
		</div>
	);
}
