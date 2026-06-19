import { TextAttributes } from "@opentui/core";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useMemo, useState } from "react";
import { Footer, Header, HelpPanel, LogStrip, StepRail } from "../components/chrome";
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
import { ExecuteScreen, ReviewScreen, SuccessScreen } from "../screens/review-screens";
import {
  AdminScreen,
  DomainScreen,
  ModeScreen,
  SystemScreen,
  WelcomeScreen
} from "../screens/setup-screens";
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
    options.yes
      ? "--yes detected: real commands can run."
      : "No --yes flag: execute step previews tasks without changing the host."
  ]);

  const compact = options.compact || dimensions.width < 92 || dimensions.height < 26;
  const current = getStep(stepIndex);
  const plan = useMemo(() => buildInstallPlan(state), [state]);
  const redactedPlan = useMemo(() => redactPlan(plan), [plan]);
  const validationErrors = useMemo(() => validateState(state), [state]);

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

  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") {
      return renderer.destroy();
    }
    if (key.name === "escape") {
      return previous();
    }
    if (key.name === "tab") {
      return setFocusIndex((value) => Math.max(0, value + (key.shift ? -1 : 1)));
    }
    if (key.name === "right" && stepIndex < steps.length - 1) {
      next();
    }
    if (key.name === "left") {
      previous();
    }
    if (key.name === "?") {
      setShowHelp((value) => !value);
    }
    if (key.ctrl && key.name === "l") {
      setLogOpen((value) => !value);
    }
  });

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
    redactedPlan,
    executionLines,
    setExecutionLines,
    options
  };

  return (
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
