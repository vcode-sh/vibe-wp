import type { ScreenProps } from "../app/screen-props";
import { performanceOptions } from "../app/steps";
import { color } from "../app/theme";
import { ChoiceList } from "../components/choice-list";
import { InfoGrid } from "../components/data-display";
import { ActionRow, Field, ToggleRow } from "../components/primitives";
import {
  effectivePerformanceValues,
  PERFORMANCE_FIELDS,
  sizingMemoryMb
} from "../core/performance";
import type { PerformancePreset } from "../core/types";

const MEMORY_FOCUS = 2;
const FIELD_FOCUS_START = 3;

export function PerformanceScreen({ state, update, focusIndex, next }: ScreenProps) {
  const values = effectivePerformanceValues(state);
  const memory = sizingMemoryMb(state);
  const clamped = !state.performanceCustom && memory !== null && memory < 1800;

  function choosePreset(value: string) {
    update("performancePreset", value as PerformancePreset);
    // Re-seed: drop overrides so edited values follow the newly chosen preset.
    update("performanceOverrides", {});
  }

  function toggleCustom() {
    const nextCustom = !state.performanceCustom;
    update("performanceCustom", nextCustom);
    if (!nextCustom) {
      update("performanceOverrides", {});
    }
  }

  function setOverride(key: string, value: string) {
    update("performanceOverrides", { ...state.performanceOverrides, [key]: value });
  }

  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <text fg={color("muted")} wrapMode="word">
        We size PHP, Redis, MariaDB, and cache to your server. Keep a preset, or switch on Customize
        to tune any single value yourself.
      </text>
      <ChoiceList
        focused={focusIndex === 0}
        onChange={choosePreset}
        options={performanceOptions}
        value={state.performancePreset}
      />
      <ToggleRow
        focused={focusIndex === 1}
        label="Customize individual settings"
        onToggle={toggleCustom}
        value={state.performanceCustom}
      />
      <Field
        focused={focusIndex === MEMORY_FOCUS}
        hint={memoryHint(state.host.totalMemoryMb)}
        label="Assumed server memory (MB)"
        onInput={(value) => update("memoryOverrideMb", value.replace(/[^0-9]/g, ""))}
        value={state.memoryOverrideMb}
      />
      {clamped && (
        <text fg={color("warning")} wrapMode="word">
          Low memory ({memory} MB): conservative limits are applied. Raise the assumed memory or
          turn on Customize to override.
        </text>
      )}
      {state.performanceCustom ? (
        <CustomFields focusIndex={focusIndex} onSet={setOverride} values={values} />
      ) : (
        <InfoGrid rows={Object.entries(values).slice(0, 8)} />
      )}
      <ActionRow
        onPrimary={next}
        primary="Continue"
        secondary="Exact values are written to your env files — nothing hidden"
      />
    </box>
  );
}

function CustomFields({
  values,
  focusIndex,
  onSet
}: {
  values: Record<string, string>;
  focusIndex: number;
  onSet: (key: string, value: string) => void;
}) {
  const rows: (typeof PERFORMANCE_FIELDS)[number][][] = [];
  for (let i = 0; i < PERFORMANCE_FIELDS.length; i += 2) {
    rows.push(PERFORMANCE_FIELDS.slice(i, i + 2));
  }
  return (
    <box flexDirection="column" gap={1}>
      {rows.map((pair) => (
        <box flexDirection="row" gap={2} key={pair[0]?.key}>
          {pair.map((field) => {
            const index = PERFORMANCE_FIELDS.indexOf(field);
            return (
              <Field
                focused={focusIndex === FIELD_FOCUS_START + index}
                grow
                key={field.key}
                label={field.label}
                onInput={(value) => onSet(field.key, value)}
                value={values[field.key] ?? ""}
              />
            );
          })}
        </box>
      ))}
    </box>
  );
}

function memoryHint(detectedMb: number | null): string {
  if (!detectedMb) {
    return "Detected: unknown — leave blank to assume balanced";
  }
  return `Detected: ${detectedMb} MB — leave blank to use it`;
}
