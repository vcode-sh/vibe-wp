import { useMutation, useQueryClient } from "@tanstack/react-query";
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
	const queryClient = useQueryClient();
	const { start, getStatus } = useOperations();
	const steps = stepsFor(mode);

	const [form, setForm] = useState<WizardForm>(emptyForm);
	const [index, setIndex] = useState(0);
	const [errors, setErrors] = useState<Errors>({});
	// Synthetic siteId for the ops tray: the real site does not exist yet, so we
	// key the provision job on the domain we are about to create. Stored in
	// state so the watcher effect re-runs and the UI reflects the in-flight job.
	const [tracked, setTracked] = useState<string | null>(null);
	// Guards against handling the same terminal status more than once.
	const handledRef = useRef(false);

	const createSite = useMutation(orpc.createSite.mutationOptions());
	const createExternal = useMutation(orpc.createExternal.mutationOptions());
	const createSharedDb = useMutation(orpc.createSharedDb.mutationOptions());
	const submitting =
		createSite.isPending ||
		createExternal.isPending ||
		createSharedDb.isPending;

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
			// createSharedDb takes the SAME input shape as createSite (no external
			// creds) — it just lands the site on the one shared MariaDB instead of a
			// per-site container. Both return { jobId } for the operations tray.
			let result: { jobId: string };
			if (mode === "external") {
				result = await createExternal.mutateAsync(toCreateExternalInput(form));
			} else if (form.dbMode === "shared") {
				result = await createSharedDb.mutateAsync(toCreateSiteInput(form));
			} else {
				result = await createSite.mutateAsync(toCreateSiteInput(form));
			}
			handledRef.current = false;
			setTracked(domain);
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
	}, [createExternal, createSharedDb, createSite, form, mode, start]);

	// Watch the tracked provision job's TERMINAL status. We read the current
	// status (not a transition) so there is no race if the job finishes before
	// this effect mounts. Only navigate on success; on failure/cancel we stay on
	// the wizard so the user can retry. `handledRef` makes this fire once.
	useEffect(() => {
		if (!tracked || handledRef.current) {
			return;
		}
		const status = getStatus(tracked, "provision");
		if (status === null) {
			return;
		}
		handledRef.current = true;
		if (status === "succeeded") {
			toast.success(`Provisioning ${tracked} finished.`);
			queryClient.invalidateQueries({
				queryKey: orpc.sitesList.queryOptions().queryKey,
			});
			navigate({ to: "/sites" });
			return;
		}
		const label = status === "canceled" ? "was canceled" : "failed";
		toast.error(`Provisioning ${tracked} ${label}. Review and try again.`);
		setTracked(null);
	}, [tracked, getStatus, navigate, queryClient]);

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
		started: tracked !== null,
		valid: isFormValid(form, mode),
	};
}
