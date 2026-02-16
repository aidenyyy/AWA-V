/** Normalize text content: strip BOM, normalize line endings, trim */
function normalizeText(content: string): string {
  return content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

/** Parse YAML frontmatter from SKILL.md content */
export function parseSkillFrontmatter(
  content: string
): { name?: string; description?: string } {
  const normalized = normalizeText(content);
  const match = normalized.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const yaml = match[1];
  const name = yaml.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = yaml.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  return { name, description };
}

/** Build an importable manifest object from SKILL.md content */
export function buildManifestFromSkillMd(
  content: string
): { name: string; description: string; tags: string[]; instructions: string } {
  const normalized = normalizeText(content);
  const { name, description } = parseSkillFrontmatter(normalized);
  if (!name) {
    throw new Error(
      "SKILL.md is missing 'name' in frontmatter. Expected:\n---\nname: my-skill\ndescription: ...\n---"
    );
  }
  return {
    name,
    description: description ?? "",
    tags: [],
    instructions: normalized,
  };
}
