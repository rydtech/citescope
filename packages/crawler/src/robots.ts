export interface RobotRules {
  disallowedPaths: string[];
  allowedPaths: string[];
  sitemapUrls: string[];
}

interface RuleEntry {
  type: 'allow' | 'disallow';
  path: string;
}

interface AgentGroup {
  agents: string[];
  rules: RuleEntry[];
}

/**
 * Parse robots.txt per RFC 9309.
 * Agent matching: exact match (case-insensitive) takes precedence over wildcard (*).
 * Path matching: longest match wins; Allow overrides Disallow of equal length.
 * Supports * wildcard and $ end-anchor in paths.
 */
export function parseRobotsTxt(content: string, userAgent: string): RobotRules {
  const lines = content.split('\n');
  const sitemapUrls: string[] = [];
  const groups: AgentGroup[] = [];
  let currentAgents: string[] = [];
  let currentRules: RuleEntry[] = [];
  let inGroup = false;

  for (const rawLine of lines) {
    // Strip inline comments and trim whitespace for field parsing
    const line = rawLine.split('#')[0]!.trim();

    // A truly blank line (no non-whitespace before any comment) ends a group.
    // A comment-only line (e.g. "# This is a comment") is NOT a group separator —
    // only treat it as a continuation of the current group.
    const isTrulyBlank = rawLine.trim() === '';
    if (isTrulyBlank) {
      // Blank line ends a group
      if (inGroup && currentAgents.length > 0) {
        groups.push({ agents: currentAgents, rules: currentRules });
      }
      currentAgents = [];
      currentRules = [];
      inGroup = false;
      continue;
    }

    // Comment-only line: line content stripped to empty string but rawLine was not blank.
    // Skip without ending the current group.
    if (line === '') continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const field = line.substring(0, colonIdx).trim().toLowerCase();
    const value = line.substring(colonIdx + 1).trim();

    if (field === 'user-agent') {
      if (inGroup && currentRules.length > 0) {
        // Starting new group after rules — flush current
        groups.push({ agents: currentAgents, rules: currentRules });
        currentAgents = [];
        currentRules = [];
      }
      currentAgents.push(value.toLowerCase());
      inGroup = true;
    } else if (field === 'allow' && inGroup) {
      currentRules.push({ type: 'allow', path: value });
    } else if (field === 'disallow' && inGroup) {
      currentRules.push({ type: 'disallow', path: value });
    } else if (field === 'sitemap' && value) {
      sitemapUrls.push(value);
    }
  }
  // Flush last group
  if (inGroup && currentAgents.length > 0) {
    groups.push({ agents: currentAgents, rules: currentRules });
  }

  const ua = userAgent.toLowerCase();

  // Merge groups with the same user-agent (RFC 9309 allows the same agent in multiple groups).
  // Build a merged map: agent_name → combined rules array.
  const mergedGroups = new Map<string, RuleEntry[]>();
  for (const group of groups) {
    for (const agent of group.agents) {
      const existing = mergedGroups.get(agent);
      if (existing) {
        existing.push(...group.rules);
      } else {
        mergedGroups.set(agent, [...group.rules]);
      }
    }
  }

  // Find best matching merged group: exact match preferred over wildcard
  let matchedRules: RuleEntry[] | null = null;
  let matchedExact = false;

  for (const [agent, rules] of mergedGroups) {
    const exactMatch = ua === agent || ua.includes(agent);
    const wildcardMatch = agent === '*';
    if (exactMatch && !matchedExact) {
      matchedRules = rules;
      matchedExact = true;
    } else if (wildcardMatch && !matchedExact && !matchedRules) {
      matchedRules = rules;
    }
  }

  if (!matchedRules) {
    return { disallowedPaths: [], allowedPaths: [], sitemapUrls };
  }

  const disallowedPaths: string[] = [];
  const allowedPaths: string[] = [];
  for (const rule of matchedRules) {
    if (rule.type === 'disallow' && rule.path) {
      disallowedPaths.push(rule.path);
    } else if (rule.type === 'allow' && rule.path) {
      allowedPaths.push(rule.path);
    }
  }

  return { disallowedPaths, allowedPaths, sitemapUrls };
}

/**
 * Check if a path is allowed per robots rules.
 * Uses longest-match wins: Allow overrides Disallow when equal length.
 * Supports * (any sequence) and $ (end anchor) in patterns.
 * An empty Disallow pattern means "allow all" (RFC 9309 §2.2.2) and is ignored.
 */
export function isPathAllowed(path: string, disallowedPaths: string[], allowedPaths: string[] = []): boolean {
  let bestMatchLen = -1;
  let bestMatchAllow = true; // default: allowed

  const allRules: Array<{ type: 'allow' | 'disallow'; pattern: string }> = [
    ...allowedPaths.map(p => ({ type: 'allow' as const, pattern: p })),
    // Empty Disallow means "allow all" — skip it entirely to avoid blocking everything
    ...disallowedPaths.filter(p => p !== '').map(p => ({ type: 'disallow' as const, pattern: p })),
  ];

  for (const rule of allRules) {
    const matchLen = matchRobotsPattern(path, rule.pattern);
    if (matchLen >= 0) {
      if (matchLen > bestMatchLen || (matchLen === bestMatchLen && rule.type === 'allow')) {
        bestMatchLen = matchLen;
        bestMatchAllow = rule.type === 'allow';
      }
    }
  }

  return bestMatchAllow;
}

/**
 * Match a path against a robots.txt pattern.
 * Returns the length of the matched portion (>= 0) if matched, or -1 if not matched.
 * Supports * and $ wildcards.
 */
function matchRobotsPattern(path: string, pattern: string): number {
  if (!pattern) return 0; // empty pattern matches everything (length 0)

  // Convert pattern to regex
  const hasEndAnchor = pattern.endsWith('$');
  const base = hasEndAnchor ? pattern.slice(0, -1) : pattern;
  // Escape regex special chars except * which we handle specially
  const escaped = base.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const regexStr = hasEndAnchor ? `^${escaped}$` : `^${escaped}`;

  try {
    const re = new RegExp(regexStr);
    const m = re.exec(path);
    if (!m) return -1;
    return m[0].length;
  } catch {
    return -1;
  }
}
