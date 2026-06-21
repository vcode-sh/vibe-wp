import { TextAttributes } from "@opentui/core";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useEffect, useMemo, useState } from "react";
import { Footer, Header, LogStrip } from "../components/chrome";
import { GlyphProvider } from "../components/glyph-context";
import { shouldUseAscii } from "../components/glyphs";
import { HelpPanel } from "../components/help-panel";
import { Column, ScrollViewport } from "../components/layout";
import { CompactStepper, StepRail } from "../components/step-rail";
import { buildInstallPlan } from "../core/install-plan";
import { redactPlan } from "../core/redaction";
import type { InstallerOptions, InstallerState } from "../core/types";
import { validateState } from "../core/validation";
import { initialStepIndex } from "./dev-step";
import { visibleSteps } from "./flow";
import { handleAppKey } from "./keyboard";
import { stepKind } from "./nav-hints";
import type { ScreenProps } from "./screen-props";
import { renderScreen } from "./screen-router";
import type { Step } from "./steps";
import { focusCountFor } from "./steps";
import { color } from "./theme";

interface AppProps {
  initialState: InstallerState;
  options: InstallerOptions;
}

export function App({ initialState, options }: AppProps) {
  const renderer = useRenderer();
  const dimensions = useTerminalDimensions();
  const [state, setState] = useState<InstallerState>(initialState);
  const [stepIndex, setStepIndex] = useState(() => initialStepIndex(initialState.mode));
  const [focusIndex, setFocusIndex] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [executionLines, setExecutionLines] = useState<string[]>([
    "Execution is armed only after the review step.",
    executionModeLine(options)
  ]);

  const compact = options.compact || dimensions.width < 92 || dimensions.height < 26;
  const ascii = useMemo(() => shouldUseAscii({ ascii: options.ascii }), [options.ascii]);
  const flowSteps = useMemo(
    () => visibleSteps(state.mode, state.quickInstall),
    [state.mode, state.quickInstall]
  );
  const activeIndex = Math.min(stepIndex, flowSteps.length - 1);
  const current = getStep(flowSteps, activeIndex);
  const focusCount = focusCountFor(current, state);
  const kind = stepKind(current.id);
  // Field/mixed screens have a focused text input that owns printable keys.
  const editingText = kind === "fields" || kind === "mixed";
  const helpModal = compact && showHelp;
  const plan = useMemo(() => buildInstallPlan(state), [state]);
  const redactedPlan = useMemo(() => redactPlan(plan), [plan]);
  const validationErrors = useMemo(() => validateState(state), [state]);

  useEffect(() => {
    setFocusIndex((value) => Math.min(value, focusCount - 1));
  }, [focusCount]);

  // Keep the step index valid when the mode change shrinks the visible flow.
  useEffect(() => {
    setStepIndex((value) => Math.min(value, flowSteps.length - 1));
  }, [flowSteps.length]);

  function update<K extends keyof InstallerState>(key: K, value: InstallerState[K]) {
    setState((previous) => ({ ...previous, [key]: value }));
  }

  function next() {
    setFocusIndex(0);
    setStepIndex((value) => Math.min(value + 1, flowSteps.length - 1));
  }

  function previous() {
    setFocusIndex(0);
    setStepIndex((value) => Math.max(value - 1, 0));
  }

  // Clicking the workflow rail jumps back to an already-completed step only —
  // never forward (a click must not skip ahead past unfilled steps).
  function goToStep(index: number) {
    if (index >= activeIndex || index < 0) {
      return;
    }
    setFocusIndex(0);
    setStepIndex(index);
  }

  function moveFocus(delta: number) {
    setFocusIndex((value) => (value + delta + focusCount) % focusCount);
  }

  useKeyboard((key) =>
    handleAppKey(key, {
      currentId: current.id,
      editingText,
      helpModal,
      destroy: () => renderer.destroy(),
      moveFocus,
      next,
      previous,
      toggleHelp: () => setShowHelp((value) => !value),
      toggleLog: () => setLogOpen((value) => !value)
    })
  );

  const screenProps: ScreenProps = {
    current,
    state,
    update,
    focusIndex,
    setFocusIndex,
    next,
    previous,
    compact,
    validationErrors,
    plan,
    redactedPlan,
    executionLines,
    setExecutionLines,
    options
  };

  return (
    <GlyphProvider ascii={ascii}>
      <box
        backgroundColor={color("bg")}
        flexDirection="column"
        gap={1}
        height="100%"
        padding={1}
        width="100%"
      >
        <Header />
        {compact && <CompactStepper activeIndex={activeIndex} steps={flowSteps} />}
        <box flexDirection={compact ? "column" : "row"} flexGrow={1} gap={1}>
          {!compact && (
            <StepRail activeIndex={activeIndex} onSelectStep={goToStep} steps={flowSteps} />
          )}
          {helpModal ? (
            <HelpPanel compact current={current} state={state} warnings={plan.warnings} />
          ) : (
            <MainPanel {...screenProps} />
          )}
          {showHelp && !compact && (
            <HelpPanel current={current} state={state} warnings={plan.warnings} />
          )}
        </box>
        {logOpen && <LogStrip lines={executionLines} />}
        <Footer
          currentIndex={activeIndex}
          focusCount={focusCount}
          kind={stepKind(current.id)}
          total={flowSteps.length}
          validationCount={validationErrors.length}
        />
      </box>
    </GlyphProvider>
  );
}

function MainPanel(props: ScreenProps) {
  return (
    <box
      backgroundColor={color("panel2")}
      borderColor={color("border")}
      borderStyle="rounded"
      flexDirection="column"
      flexGrow={1}
      gap={1}
      // Clip content to the panel: a screen taller than the viewport must never
      // overdraw into the border or footer (OpenTUI does not clip by default).
      overflow="hidden"
      paddingX={2}
      paddingY={1}
    >
      <box alignItems="center" flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={color("text")}>
          {props.current.title}
        </text>
        <text fg={color("subtle")}>F1 help · Ctrl+L logs</text>
      </box>
      <ScrollViewport focusIndex={props.focusIndex}>
        <Column>{renderScreen(props)}</Column>
      </ScrollViewport>
    </box>
  );
}

function getStep(list: Step[], index: number) {
  const step = list[index] ?? list[0];
  if (!step) {
    throw new Error("Installer has no steps.");
  }
  return step;
}

function executionModeLine(options: InstallerOptions): string {
  if (options.local) {
    return "Local sandbox: execute simulates tasks without changing this Mac.";
  }
  if (options.yes) {
    return "--yes detected: real commands can run.";
  }
  return "No --yes flag: execute step previews tasks without changing the host.";
}
