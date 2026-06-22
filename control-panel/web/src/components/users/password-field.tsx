/**
 * Reusable password input: a labelled field with a show/hide toggle and an
 * optional advisory strength meter. Used by add-user, admin reset-password, and
 * self-service change-password so every password entry behaves identically.
 */
import { Label } from "@control-panel/ui/components/label";
import { Progress } from "@control-panel/ui/components/progress";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { scorePassword } from "@/lib/password";

export function PasswordField({
	id,
	label,
	value,
	onChange,
	autoComplete,
	showStrength,
	placeholder,
	disabled,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (v: string) => void;
	autoComplete: "new-password" | "current-password";
	showStrength?: boolean;
	placeholder?: string;
	disabled?: boolean;
}) {
	const [reveal, setReveal] = useState(false);
	const strength = scorePassword(value);
	return (
		<div className="grid gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			<div className="relative">
				<Input
					autoComplete={autoComplete}
					className="pr-9"
					disabled={disabled}
					id={id}
					onChange={(e) => onChange(e.target.value)}
					placeholder={placeholder}
					type={reveal ? "text" : "password"}
					value={value}
				/>
				<Button
					aria-label={reveal ? "Hide password" : "Show password"}
					className="absolute top-0 right-0 h-full px-2 text-muted-foreground"
					disabled={disabled}
					onClick={() => setReveal((r) => !r)}
					size="icon"
					type="button"
					variant="ghost"
				>
					{reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
				</Button>
			</div>
			{showStrength && value ? (
				<div className="grid gap-1">
					<Progress value={strength.percent} />
					<span className="text-muted-foreground text-xs">{strength.label}</span>
				</div>
			) : null}
		</div>
	);
}
