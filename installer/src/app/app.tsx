import { TextAttributes } from "@opentui/core";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useEffect, useMemo, useState } from "react";
import { Footer, Header, HelpPanel, LogStrip, StepRail } from "../components/chrome";
import { GlyphProvider } from "../components/glyph-context";
import { shouldUseAscii } from "../components/glyphs";
import { buildInstallPlan } from "../core/install-plan";
import { redactPlan } from "../core/redaction";
import type { InstallerOptions, InstallerState } from "../core/types";
import { validateState } from "../core/validation";
import {
  AiScreen,
  BackupScreen,
  PerformanceScreen,
  StagingScreen
} from "../screens/config-screens";
import { DomainScreen } from "../screens/domain-screen";
import { ExecuteScreen } from "../screens/execute-screen";
import { ReviewScreen, SuccessScreen } from "../screens/review-screens";
import { AdminScreen, ModeScreen, SystemScreen, WelcomeScreen } from "../screens/setup-screens";
import { SitesScreen } from "../screens/site-screens";
import { handleAppKey } from "./keyboard";
import type { ScreenProps } from "./screen-props";
import { steps } from "./steps";
import { color } from "./theme";

interface AppProps {
  initialState: InstallerState;
  options: InstallerOptions;
}

export function App({ initialState, options }: AppProps) {
  const renderer = useRenderer();
  const dimensions = useTerminalDimensions();
  const [state, setState] = useState<InstallerState>(initialState);
  const [stepIndex, setStepIndex] = useState(0);
  const [focusIndex, setFocusIndex] = useState(0);
  const [showHelp, setShowHelp] = useState(true);
  const [logOpen, setLogOpen] = useState(false);
  const [executionLines, setExecutionLines] = useState<string[]>([
    "Execution is armed only after the review step.",
    executionModeLine(options)
  ]);

  const compact = options.compact || dimensions.width < 92 || dimensions.height < 26;
  const ascii = useMemo(() => shouldUseAscii({ ascii: options.ascii }), [options.ascii]);
  const current = getStep(stepIndex);
  const plan = useMemo(() => buildInstallPlan(state), [state]);
  const redactedPlan = useMemo(() => redactPlan(plan), [plan]);
  const validationErrors = useMemo(() => validateState(state), [state]);

  useEffect(() => {
    setFocusIndex((value) => Math.min(value, current.focusCount - 1));
  }, [current.focusCount]);

  function update<K extends keyof InstallerState>(key: K, value: InstallerState[K]) {
    setState((previous) => ({ ...previous, [key]: value }));
  }

  function next() {
    setFocusIndex(0);
    setStepIndex((value) => Math.min(value + 1, steps.length - 1));
  }

  function previous() {
    setFocusIndex(0);
    setStepIndex((value) => Math.max(value - 1, 0));
  }

  function moveFocus(delta: number) {
    setFocusIndex((value) => (value + delta + current.focusCount) % current.focusCount);
  }

  useKeyboard((key) =>
    handleAppKey(key, {
      canGoForward: stepIndex < steps.length - 1,
      currentId: current.id,
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
        <Header compact={compact} dimensions={dimensions} />
        <box flexDirection={compact ? "column" : "row"} flexGrow={1} gap={1}>
          {!compact && <StepRail activeIndex={stepIndex} />}
          <MainPanel {...screenProps} />
          {showHelp && !compact && (
            <HelpPanel current={current} state={state} warnings={plan.warnings} />
          )}
        </box>
        {logOpen && <LogStrip lines={executionLines} />}
        <Footer
          currentIndex={stepIndex}
          total={steps.length}
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
      border
      borderColor={color("borderStrong")}
      flexDirection="column"
      flexGrow={1}
      gap={1}
      padding={1}
    >
      <box alignItems="center" flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={color("text")}>
          {props.current.title}
        </text>
        <text fg={color("muted")}>Tab focus - arrows steps - ? help - Ctrl+L logs</text>
      </box>
      {renderScreen(props)}
    </box>
  );
}

function renderScreen(props: ScreenProps) {
  switch (props.current.id) {
    case "welcome":
      return <WelcomeScreen {...props} />;
    case "sites":
      return <SitesScreen {...props} />;
    case "system":
      return <SystemScreen {...props} />;
    case "domain":
      return <DomainScreen {...props} />;
    case "mode":
      return <ModeScreen {...props} />;
    case "admin":
      return <AdminScreen {...props} />;
    case "performance":
      return <PerformanceScreen {...props} />;
    case "ai":
      return <AiScreen {...props} />;
    case "backup":
      return <BackupScreen {...props} />;
    case "staging":
      return <StagingScreen {...props} />;
    case "review":
      return <ReviewScreen {...props} />;
    case "execute":
      return <ExecuteScreen {...props} />;
    case "success":
      return <SuccessScreen {...props} />;
    default:
      return <WelcomeScreen {...props} />;
  }
}

function getStep(index: number) {
  const step = steps[index] ?? steps[0];
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
