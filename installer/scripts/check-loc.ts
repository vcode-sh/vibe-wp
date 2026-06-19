const maxLines = 220;
const files: string[] = [];

for await (const entry of new Bun.Glob("src/**/*.{ts,tsx}").scan(".")) {
  files.push(entry);
}

const oversized: Array<{ file: string; lines: number }> = [];

for (const file of files.sort()) {
  const text = await Bun.file(file).text();
  const lines = text.split(/\r?\n/).length;
  if (lines > maxLines) {
    oversized.push({ file, lines });
  }
}

if (oversized.length > 0) {
  console.error(`TypeScript files must stay at or below ${maxLines} lines.`);
  for (const item of oversized) {
    console.error(`${item.lines.toString().padStart(4, " ")} ${item.file}`);
  }
  process.exitCode = 1;
} else {
  console.log(`All TypeScript files are <= ${maxLines} lines.`);
}
