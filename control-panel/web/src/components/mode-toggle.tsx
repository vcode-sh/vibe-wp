import { Button } from "@control-panel/ui/components/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ModeToggle() {
	const { resolvedTheme, setTheme, theme } = useTheme();
	const activeTheme = resolvedTheme ?? theme;

	function toggleTheme() {
		const isDark = document.documentElement.classList.contains("dark");
		const nextTheme = isDark ? "light" : "dark";

		document.documentElement.classList.remove("dark", "light");
		document.documentElement.classList.add(nextTheme);
		document.documentElement.style.colorScheme = nextTheme;
		setTheme(nextTheme);
	}

	return (
		<Button
			aria-pressed={activeTheme === "dark"}
			onClick={toggleTheme}
			size="icon"
			type="button"
			variant="outline"
		>
			<Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
			<Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
			<span className="sr-only">Toggle theme</span>
		</Button>
	);
}
