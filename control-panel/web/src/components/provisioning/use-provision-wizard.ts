import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { CreateExternalInput, CreateSiteInput } from "@/data/types";
import { useOperations } from "@/lib/operations/operations-provider";
import { orpc } from "@/lib/orpc/client";
import { type Errors, isFormValid, validateStep } from "./validation";
import {
	emptyForm,
	type ProvisionMode,
	type StepKey,
	stepsFor,
	type WizardForm,
} from "./wizard-types";

/** Trim and drop empty optional fields so the server sees only real values. */
function toCreateSiteInput(form: WizardForm): CreateSiteInput {
	const title = form.siteTitle.trim();
	return {
		adminEmail: form.adminEmail.trim(),
		backupSchedule: form.backupSchedule,
		domain: form.domain.trim().toLowerCase(),
		monitorEnabled: form.monitorEnabled,
		performancePreset: form.performancePreset,
		...(title ? { siteTitle: title } : {}),
		stagingEnabled: form.stagingEnabled,
		...(form.stagingEnabled
			? { stagingDomain: form.stagingDomain.trim().toLowerCase() }
			: {}),
	};
}

function toCreateExternalInput(form: WizardForm): CreateExternalInput {
	return {
		...toCreateSiteInput(form),
		extDbHost: form.extDbHost.trim(),
		extDbName: form.extDbName.trim(),
		extDbPassword: form.extDbPassword,
		extDbUser: form.extDbUser.trim(),
		extRedisHost: form.extRedisHost.trim(),
		extRedisPassword: form.extRedisPassword,
		extRedisPort: form.extRedisPort.trim(),
	};
}

export function useProvisionWizard(mode: ProvisionMode) {
	const navigate = useNavigate();
	const { start, isRunning } = useOperations();
	const steps = stepsFor(mode);

	const [form, setForm] = useState<WizardForm>(emptyForm);
	const [index, setIndex] = useState(0);
	const [errors, setErrors] = useState<Errors>({});
	// Synthetic siteId for the ops tray: the real site does not exist yet, so we
	// key the provision job on the domain we are about to create.
	const trackedRef = useRef<string | null>(null);

	const createSite = useMutation(orpc.createSite.mutationOptions());
	const createExternal = useMutation(orpc.createExternal.mutationOptions());
	const submitting = createSite.isPending || createExternal.isPending;

	const step: StepKey = steps[index] ?? "basics";
	const isLast = index === steps.length - 1;

	const set = useCallback(
		<K extends keyof WizardForm>(key: K, value: WizardForm[K]) => {
			setForm((prev) => ({ ...prev, [key]: value }));
			setErrors((prev) => ({ ...prev, [key]: undefined }));
		},
		[]
	);

	const back = useCallback(() => {
		setErrors({});
		setIndex((i) => Math.max(0, i - 1));
	}, []);

	const next = useCallback(() => {
		if (step === "review") {
			return;
		}
		const stepErrors = validateStep(step, form);
		if (Object.keys(stepErrors).length > 0) {
			setErrors(stepErrors);
			return;
		}
		setErrors({});
		setIndex((i) => Math.min(steps.length - 1, i + 1));
	}, [form, step, steps.length]);

	const submit = useCallback(async () => {
		if (!isFormValid(form, mode)) {
			toast.error("Please fix the highlighted fields.");
			return;
		}
		const domain = form.domain.trim().toLowerCase();
		try {
			const result =
				mode === "external"
					? await createExternal.mutateAsync(toCreateExternalInput(form))
					: await createSite.mutateAsync(toCreateSiteInput(form));
			trackedRef.current = domain;
			start({
				jobId: result.jobId,
				title: `Create ${domain}`,
				kind: "provision",
				siteId: domain,
			});
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to start provisioning.";
			toast.error(message);
		}
	}, [createExternal, createSite, form, mode, start]);

	// Once the tracked provision job finishes, leave the wizard for the list.
	useEffect(() => {
		const domain = trackedRef.current;
		if (!domain) {
			return;
		}
		if (!isRunning(domain, "provision")) {
			toast.success(`Provisioning ${domain} finished.`);
			trackedRef.current = null;
			navigate({ to: "/sites" });
		}
	}, [isRunning, navigate]);

	return {
		back,
		errors,
		form,
		index,
		isLast,
		next,
		set,
		step,
		steps,
		submit,
		submitting,
		started: trackedRef.current !== null,
		valid: isFormValid(form, mode),
	};
}
