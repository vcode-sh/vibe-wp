export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function sudoPrefix(): string {
  return `if [ "$(id -u)" = 0 ]; then SUDO=""; else SUDO="sudo"; fi;`;
}
