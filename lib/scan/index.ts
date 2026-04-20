export type Severity = "low" | "medium" | "high";

export type ScanFindingSource = "prompt" | "output";

export type ScanFinding = {
  rule: string;
  severity: Severity;
  match: string;
  source: ScanFindingSource;
};

export type ScanResult = {
  riskLevel: Severity;
  findings: ScanFinding[];
};

type Rule = {
  id: string;
  severity: Severity;
  pattern: RegExp;
};

const RULES: Rule[] = [
  { id: "pii.ssn", severity: "high", pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { id: "pii.credit_card", severity: "high", pattern: /\b(?:\d[ -]?){13,16}\b/g },
  { id: "pii.email", severity: "medium", pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi },
  { id: "pii.phone", severity: "medium", pattern: /\b\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g },
  { id: "banned.term", severity: "medium", pattern: /\b(confidential|proprietary|nda)\b/gi }
];

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };
const MAX_FINDINGS_PER_RULE = 10;

function runRules(text: string, source: ScanFindingSource): ScanFinding[] {
  if (!text) return [];

  const findings: ScanFinding[] = [];

  for (const rule of RULES) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match: RegExpExecArray | null;
    let count = 0;

    while ((match = pattern.exec(text)) !== null && count < MAX_FINDINGS_PER_RULE) {
      findings.push({
        rule: rule.id,
        severity: rule.severity,
        match: match[0],
        source
      });
      count += 1;
      if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
    }
  }

  return findings;
}

function computeRiskLevel(findings: ScanFinding[]): Severity {
  return findings.reduce<Severity>(
    (current, finding) => (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[current] ? finding.severity : current),
    "low"
  );
}

export function scanContent(input: { prompt: string; output: string }): ScanResult {
  const findings = [...runRules(input.prompt, "prompt"), ...runRules(input.output, "output")];
  return {
    riskLevel: computeRiskLevel(findings),
    findings
  };
}
