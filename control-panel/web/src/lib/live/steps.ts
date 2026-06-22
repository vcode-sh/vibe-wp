export interface StepDef {
	label: string;
	match: RegExp;
}

export interface Step {
	label: string;
	state: "done" | "active" | "pending";
}

function stepState(index: number, activeIdx: number): Step["state"] {
	if (index < activeIdx) {
		return "done";
	}
	if (index === activeIdx) {
		return "active";
	}
	return "pending";
}

export function deriveSteps(lines: string[], defs: StepDef[]): Step[] {
	let activeIdx = -1;
	for (let i = 0; i < defs.length; i++) {
		const def = defs[i];
		if (def && lines.some((l) => def.match.test(l))) {
			activeIdx = i;
		}
	}
	return defs.map((def, i) => ({
		label: def.label,
		state: stepState(i, activeIdx),
	}));
}
