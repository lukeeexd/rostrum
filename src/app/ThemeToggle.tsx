import { RiComputerLine, RiMoonLine, RiSunLine } from "@remixicon/react";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { useTheme, type ThemePref } from "@/hooks/useTheme";

const OPTIONS = [
  { id: "system", ariaLabel: "System theme", icon: RiComputerLine },
  { id: "light", ariaLabel: "Light theme", icon: RiSunLine },
  { id: "dark", ariaLabel: "Dark theme", icon: RiMoonLine },
] as const;

export function ThemeToggle() {
  const { pref, setPref } = useTheme();
  return <SegmentedControl<ThemePref> label="Theme" value={pref} onChange={setPref} options={OPTIONS} />;
}
