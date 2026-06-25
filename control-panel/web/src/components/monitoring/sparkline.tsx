/**
 * UptimeSparkline — a tiny dependency-free inline-SVG sparkline of recent `up`
 * samples (1 = reachable, 0 = down). Each sample is a step in a polyline; down
 * stretches are also shaded with destructive bars so an outage reads at a glance.
 * Path geometry is derived by a PURE function (sparklinePoints) so it is unit
 * testable without a DOM. Colors use semantic tokens via currentColor.
 */

export interface SparkPoint {
	x: number;
	y: number;
}

/**
 * Map a series of binary `up` values to evenly-spaced points within a
 * `width`×`height` box. `up===1` sits near the top (low y), `up===0` at the
 * bottom. A single sample is centered. Returns [] for an empty series.
 */
export function sparklinePoints(
	ups: number[],
	width: number,
	height: number,
	pad = 2
): SparkPoint[] {
	if (ups.length === 0) {
		return [];
	}
	const innerW = Math.max(width - pad * 2, 1);
	const top = pad;
	const bottom = height - pad;
	if (ups.length === 1) {
		const y = ups[0] ? top : bottom;
		return [{ x: width / 2, y }];
	}
	const step = innerW / (ups.length - 1);
	return ups.map((u, i) => ({
		x: pad + step * i,
		y: u ? top : bottom,
	}));
}

/** Build the SVG polyline `points` attribute from derived points. */
export function pointsAttr(points: SparkPoint[]): string {
	return points.map((p) => `${round(p.x)},${round(p.y)}`).join(" ");
}

function round(n: number): number {
	return Math.round(n * 100) / 100;
}

export function UptimeSparkline({
	ups,
	width = 120,
	height = 28,
}: {
	ups: number[];
	width?: number;
	height?: number;
}) {
	const points = sparklinePoints(ups, width, height);
	if (points.length === 0) {
		return (
			<span className="text-muted-foreground text-xs">No samples yet</span>
		);
	}
	return (
		<svg
			aria-hidden="true"
			className="text-success"
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			width={width}
		>
			{/* Shade down stretches in the destructive tone. */}
			{ups.map((u, i) =>
				u === 0 ? (
					<rect
						className="fill-destructive/20"
						height={height}
						// biome-ignore lint/suspicious/noArrayIndexKey: positional bars
						key={`d-${i}`}
						width={Math.max(width / ups.length, 1)}
						x={(i / ups.length) * width}
						y={0}
					/>
				) : null
			)}
			<polyline
				fill="none"
				points={pointsAttr(points)}
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			/>
		</svg>
	);
}
