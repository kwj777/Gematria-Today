import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const HTML_FILES = readdirSync('.').filter((name) => name.endsWith('.html')).sort();

const issues = [];

function pushIssue(file, severity, rule, details) {
  issues.push({ file, severity, rule, details });
}

for (const file of HTML_FILES) {
  const source = readFileSync(file, 'utf8');

  if (!/\<html[^>]*\blang\s*=\s*"[^"]+"/i.test(source)) {
    pushIssue(file, 'high', 'html-lang', 'Missing `lang` on the `<html>` element.');
  }

  if (!/<main\b/i.test(source)) {
    pushIssue(file, 'medium', 'landmark-main', 'Missing `<main>` landmark.');
  }

  if (!/<h1\b/i.test(source)) {
    pushIssue(file, 'medium', 'heading-h1', 'Missing page-level `<h1>`.');
  }

  if (!/class="skip-link"/.test(source)) {
    pushIssue(file, 'low', 'skip-link', 'No explicit skip link found (`class="skip-link"`).');
  }

  if (/href="#"/.test(source)) {
    pushIssue(file, 'medium', 'empty-href', 'Contains `href="#"`; prefer a `<button>` for in-page menu toggles.');
  }

  const imageTags = [...source.matchAll(/<img\b[^>]*>/gi)];
  for (const tag of imageTags) {
    if (!/\balt\s*=\s*"[^"]*"/i.test(tag[0])) {
      pushIssue(file, 'high', 'img-alt', 'Image tag without `alt` text.');
    }
  }

  const formControls = [...source.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)];
  for (const match of formControls) {
    const attrs = match[2] ?? '';
    if (/\btype\s*=\s*"hidden"/i.test(attrs)) {
      continue;
    }

    const idMatch = attrs.match(/\bid\s*=\s*"([^"]+)"/i);
    const id = idMatch?.[1];
    const hasAriaLabel = /\baria-label\s*=|\baria-labelledby\s*=/i.test(attrs);

    let hasLabel = false;
    if (id) {
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const labelForRegex = new RegExp(`<label[^>]*for\\s*=\\s*"${escaped}"[^>]*>`, 'i');
      hasLabel = labelForRegex.test(source);
    }

    if (!hasLabel && !hasAriaLabel) {
      pushIssue(file, 'high', 'form-label', `Potential unlabeled form control: ${match[0].slice(0, 100)}`);
    }
  }
}

const severityOrder = { high: 0, medium: 1, low: 2 };
issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.file.localeCompare(b.file));

const date = new Date().toISOString().slice(0, 10);
const summary = {
  auditedFiles: HTML_FILES.length,
  totalIssues: issues.length,
  high: issues.filter((issue) => issue.severity === 'high').length,
  medium: issues.filter((issue) => issue.severity === 'medium').length,
  low: issues.filter((issue) => issue.severity === 'low').length,
};

const lines = [
  '# Accessibility Audit Report',
  '',
  `Audit date: ${date}`,
  `Files audited: ${summary.auditedFiles}`,
  `Issues found: ${summary.totalIssues} (high: ${summary.high}, medium: ${summary.medium}, low: ${summary.low})`,
  '',
  '## Findings',
  '',
];

if (issues.length === 0) {
  lines.push('- No issues detected by the automated checks in this audit script.');
} else {
  for (const issue of issues) {
    lines.push(`- [${issue.severity.toUpperCase()}] ${issue.file} · ${issue.rule} — ${issue.details}`);
  }
}

lines.push('', '## Notes', '', '- This is a baseline static audit only (HTML patterns).', '- It does not measure runtime focus order, color contrast, keyboard traps, or screen reader announcements.', '');

const output = `${lines.join('\n')}\n`;
writeFileSync('accessibility-audit.md', output, 'utf8');
console.log(output);
