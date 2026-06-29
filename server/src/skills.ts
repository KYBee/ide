import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SkillSummary } from "./types.js";

interface SkillFrontmatter {
  name?: string;
  description?: string;
}

const MAX_SKILL_FILES = 200;

function parseFrontmatter(raw: string): SkillFrontmatter {
  if (!raw.startsWith("---")) return {};
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return {};
  const frontmatter = raw.slice(3, end).trim();
  const parsed: SkillFrontmatter = {};
  for (const line of frontmatter.split("\n")) {
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim().replace(/^["']|["']$/g, "");
    if (key.trim() === "name") parsed.name = value;
    if (key.trim() === "description") parsed.description = value;
  }
  return parsed;
}

function collectSkillFiles(root: string, files: string[] = []): string[] {
  if (!fs.existsSync(root) || files.length >= MAX_SKILL_FILES) return files;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (files.length >= MAX_SKILL_FILES) break;
    const nextPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      collectSkillFiles(nextPath, files);
      continue;
    }
    if (entry.isFile() && entry.name === "SKILL.md") files.push(nextPath);
  }
  return files;
}

export function listCodexSkills(): SkillSummary[] {
  const skillsRoot = path.join(os.homedir(), ".codex", "skills");
  return collectSkillFiles(skillsRoot)
    .map((skillPath) => {
      const raw = fs.readFileSync(skillPath, "utf8");
      const metadata = parseFrontmatter(raw);
      const directoryName = path.basename(path.dirname(skillPath));
      const relativePath = path.relative(skillsRoot, skillPath);
      const id = relativePath.replace(/\/SKILL\.md$/, "");
      return {
        id,
        name: metadata.name || directoryName,
        description: metadata.description,
        source: "codex" as const,
        path: skillPath,
        builtin: id.startsWith(".system/")
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}
