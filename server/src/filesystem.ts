import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface DirectoryEntry {
  name: string;
  path: string;
}

export interface DirectoryListing {
  path: string;
  parent?: string;
  entries: DirectoryEntry[];
}

function expandHome(input?: string): string {
  if (!input || input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

function displayPath(input: string): string {
  const home = os.homedir();
  if (input === home) return "~";
  if (input.startsWith(`${home}${path.sep}`)) return `~/${path.relative(home, input)}`;
  return input;
}

export async function listDirectories(inputPath?: string): Promise<DirectoryListing> {
  const resolvedPath = path.resolve(expandHome(inputPath));
  const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: displayPath(path.join(resolvedPath, entry.name))
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const parentPath = path.dirname(resolvedPath);
  return {
    path: displayPath(resolvedPath),
    parent: parentPath === resolvedPath ? undefined : displayPath(parentPath),
    entries: directories
  };
}
