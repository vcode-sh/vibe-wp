import {
  AiScreen,
  BackupScreen,
  PerformanceScreen,
  StagingScreen
} from "../screens/config-screens";
import { DashboardScreen } from "../screens/dashboard-screen";
import { DomainScreen } from "../screens/domain-screen";
import { ExecuteScreen } from "../screens/execute-screen";
import { ReviewScreen, SuccessScreen } from "../screens/review-screens";
import { AdminScreen, ModeScreen, SystemScreen, WelcomeScreen } from "../screens/setup-screens";
import { SitesScreen } from "../screens/site-screens";
import type { ScreenProps } from "./screen-props";

export function renderScreen(props: ScreenProps) {
  switch (props.current.id) {
    case "welcome":
      return <WelcomeScreen {...props} />;
    case "sites":
      return <SitesScreen {...props} />;
    case "dashboard":
      return <DashboardScreen {...props} />;
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
