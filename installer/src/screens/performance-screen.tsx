import { performanceOptions } from "../app/options";
import type { ScreenProps } from "../app/screen-props";
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

export function PerformanceScreen({ state, update, focusIndex, setFocusIndex, next }: ScreenProps) {
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
        onFocus={() => setFocusIndex(1)}
        onToggle={toggleCustom}
        value={state.performanceCustom}
      />
      <Field
        focused={focusIndex === MEMORY_FOCUS}
        hint={memoryHint(state.host.totalMemoryMb)}
        label="Assumed server memory (MB)"
        onFocus={() => setFocusIndex(MEMORY_FOCUS)}
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
        <CustomFields
          focusIndex={focusIndex}
          onSet={setOverride}
          setFocusIndex={setFocusIndex}
          values={values}
        />
      ) : (
        <InfoGrid rows={Object.entries(values).slice(0, 8)} />
      )}
      <MemoryBar memory={memory} values={values} />
      <ActionRow
        onPrimary={next}
        primary="Continue"
        secondary="Exact values are written to your env files — nothing hidden"
      />
    </box>
  );
}

const SIZE_PATTERN = /(\d+(?:\.\d+)?)\s*([gGmM])?/;
const GIGABYTE_PATTERN = /g/i;

function parseMb(value: string | undefined): number {
  const match = (value ?? "").match(SIZE_PATTERN);
  if (!match) {
    return 0;
  }
  const n = Number.parseFloat(match[1] ?? "0");
  return GIGABYTE_PATTERN.test(match[2] ?? "") ? Math.round(n * 1024) : Math.round(n);
}

// A visual RAM budget: how much the reserved caches (Redis + MariaDB buffer
// pool) claim out of the server's memory, so over-provisioning is obvious.
function MemoryBar({ memory, values }: { memory: number | null; values: Record<string, string> }) {
  if (!memory) {
    return null;
  }
  const redis = parseMb(values.REDIS_MAXMEMORY);
  const db = parseMb(values.MARIADB_INNODB_BUFFER_POOL_SIZE);
  const free = Math.max(0, memory - redis - db);
  const tone = redis + db > memory ? "warning" : "muted";
  return (
    <box flexDirection="column" gap={0}>
      <box flexDirection="row" height={1}>
        <box backgroundColor={color("accent")} flexGrow={Math.max(1, redis)} />
        <box backgroundColor={color("warning")} flexGrow={Math.max(1, db)} />
        <box backgroundColor={color("panel3")} flexGrow={Math.max(1, free)} />
      </box>
      <text fg={color(tone)} truncate>
        Caches reserve ~{redis + db} MB (Redis {redis} + MariaDB {db}) of {memory} MB · PHP-FPM up
        to {values.PHP_FPM_PM_MAX_CHILDREN} workers
      </text>
    </box>
  );
}

function CustomFields({
  values,
  focusIndex,
  setFocusIndex,
  onSet
}: {
  values: Record<string, string>;
  focusIndex: number;
  setFocusIndex: (index: number) => void;
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
                onFocus={() => setFocusIndex(FIELD_FOCUS_START + index)}
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
