import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(frontendRoot, 'src');
const reportPath = path.join(frontendRoot, 'i18n-report.txt');
const baselinePath = path.join(frontendRoot, 'i18n-baseline.json');
const updateBaseline = process.argv.includes('--update-baseline');
const vietnamesePattern = /[À-ỹ]/u;
// Add routing-only files here when they should be excluded from source scanning.
const IGNORE_FILES = new Set(['src/app.jsx']);
// Keep proper names and standard interface tokens out of English hardcode findings.
const untranslatedAllowlist = new Set(['x', '×', 'vnd', 'ok']);
const properNameAllowlist = new Set(['hgh', 'vnpay', 'email', 'gmail', 'avatar']);
const findings = [];

const toRelativeFrontendPath = (filePath) => path.relative(frontendRoot, filePath).replaceAll(path.sep, '/');

const addFinding = (group, file, line, message, occurrenceKey = message) => {
    const relativeFile = file === '<locale-parity>' ? file : toRelativeFrontendPath(file);
    const stableKey = `${group}\n${relativeFile}\n${occurrenceKey}`;
    const id = createHash('sha256').update(stableKey).digest('hex');
    findings.push({ id, group, file: relativeFile, line, message });
};

const flattenLocale = (value, prefix = '', result = new Map()) => {
    for (const [key, entry] of Object.entries(value)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (
            entry !== null
            && typeof entry === 'object'
            && !Array.isArray(entry)
            && Object.keys(entry).length > 0
        ) {
            flattenLocale(entry, fullKey, result);
        } else {
            result.set(fullKey, entry);
        }
    }
    return result;
};

const [viModule, enModule] = await Promise.all([
    import(pathToFileURL(path.join(sourceRoot, 'locales', 'vi.js')).href),
    import(pathToFileURL(path.join(sourceRoot, 'locales', 'en.js')).href),
]);
const viLocale = flattenLocale(viModule.default);
const enLocale = flattenLocale(enModule.default);

for (const key of [...viLocale.keys()].filter((item) => !enLocale.has(item)).sort()) {
    addFinding('1. Parity locale', 'src/locales/vi.js', 1, `Key "${key}" is missing from en.js`, `vi-missing:${key}`);
}
for (const key of [...enLocale.keys()].filter((item) => !viLocale.has(item)).sort()) {
    addFinding('1. Parity locale', 'src/locales/en.js', 1, `Key "${key}" is missing from vi.js`, `en-missing:${key}`);
}
for (const [file, locale] of [['src/locales/vi.js', viLocale], ['src/locales/en.js', enLocale]]) {
    for (const [key, value] of locale) {
        if (
            value === null
            || (typeof value === 'string' && value.trim() === '')
            || (Array.isArray(value) && value.length === 0)
            || (typeof value === 'object' && value !== null && Object.keys(value).length === 0)
        ) {
            addFinding('1. Parity locale', file, 1, `Key "${key}" has an empty value`, `empty:${key}`);
        }
    }
}

const collectSourceFiles = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') return [];
            return collectSourceFiles(filePath);
        }
        return /\.(?:js|jsx|ts|tsx|mjs|cjs)$/u.test(entry.name) ? [filePath] : [];
    }));
    return nested.flat();
};

const sourceFiles = (await collectSourceFiles(sourceRoot)).filter((filePath) => (
    !['pageTextTranslations.js', 'vi.js', 'en.js'].includes(path.basename(filePath))
    && !IGNORE_FILES.has(toRelativeFrontendPath(filePath))
));

const stripComments = (text) => {
    let result = '';
    let index = 0;
    let quote = null;

    while (index < text.length) {
        const current = text[index];
        const next = text[index + 1];

        if (quote) {
            result += current;
            if (current === '\\') {
                result += next ?? '';
                index += 2;
                continue;
            }
            if (current === quote) quote = null;
            index += 1;
            continue;
        }

        if (current === '"' || current === "'" || current === '`') {
            quote = current;
            result += current;
            index += 1;
            continue;
        }
        if (current === '/' && next === '/') {
            while (index < text.length && text[index] !== '\n') index += 1;
            continue;
        }
        if (current === '/' && next === '*') {
            index += 2;
            while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) {
                if (text[index] === '\n') result += '\n';
                index += 1;
            }
            index += 2;
            continue;
        }
        if (current === '{' && next === '/' && text[index + 2] === '*') {
            index += 3;
            while (index < text.length && !(text[index] === '*' && text[index + 1] === '/' && text[index + 2] === '}')) {
                if (text[index] === '\n') result += '\n';
                index += 1;
            }
            index += 3;
            continue;
        }

        result += current;
        index += 1;
    }

    return result;
};

const readLiteral = (literal) => {
    try {
        return Function(`"use strict"; return (${literal});`)();
    } catch {
        return null;
    }
};

const lineAt = (text, index) => text.slice(0, index).split('\n').length;
const staticText = (literal) => {
    if (!literal.startsWith('`')) return readLiteral(literal);

    const content = literal.slice(1, -1);
    let result = '';
    let index = 0;
    while (index < content.length) {
        if (content[index] === '\\') {
            result += content[index + 1] ?? '';
            index += 2;
            continue;
        }
        if (content[index] === '$' && content[index + 1] === '{') {
            let depth = 1;
            let quote = null;
            index += 2;
            while (index < content.length && depth > 0) {
                const character = content[index];
                if (quote) {
                    if (character === '\\') {
                        index += 2;
                        continue;
                    }
                    if (character === quote) quote = null;
                } else if (character === '"' || character === "'" || character === '`') {
                    quote = character;
                } else if (character === '{') {
                    depth += 1;
                } else if (character === '}') {
                    depth -= 1;
                }
                index += 1;
            }
            result += ' ';
            continue;
        }
        result += content[index];
        index += 1;
    }
    return result;
};
const classifyHardcodedText = (text) => {
    const trimmedText = text.trim();
    if ((trimmedText.match(/[A-Za-zÀ-ỹ]/gu) ?? []).length < 3) return null;
    if (
        /^(?:https?:\/\/|\/|\.{1,2}\/)/iu.test(trimmedText)
        || /^(?:fa|icon)-[a-z0-9_-]+$/iu.test(trimmedText)
        || /^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)+$/iu.test(trimmedText)
        || /(?:https?:\/\/|www\.)\S+/iu.test(trimmedText)
        || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(trimmedText)
        || /&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]+);/iu.test(trimmedText)
        || /(?:&&|\|\||===|!==|>=|<=|=>|\?\.|\.length\b)/u.test(trimmedText)
        || /\b[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*\b/u.test(trimmedText)
    ) return null;
    if (vietnamesePattern.test(text)) return 'vi';
    const words = text.match(/[A-Za-z]{2,}/gu) ?? [];
    return words.some((word) => (
        !untranslatedAllowlist.has(word.toLocaleLowerCase('en'))
        && !properNameAllowlist.has(word.toLocaleLowerCase('en'))
    )) ? 'en' : null;
};
const isAllowlistedText = (text) => untranslatedAllowlist.has(text.trim().toLocaleLowerCase('en'));
const textLiteralPattern = /(?:'[^'\\]*(?:\\.[^'\\]*)*'|"[^"\\]*(?:\\.[^"\\]*)*"|`(?:\\.|[^`])*`)/gu;
const findMatchingBrace = (text, openIndex) => {
    let depth = 1;
    let quote = null;
    for (let index = openIndex + 1; index < text.length; index += 1) {
        const character = text[index];
        if (quote) {
            if (character === '\\') {
                index += 1;
            } else if (character === quote) {
                quote = null;
            }
            continue;
        }
        if (character === '"' || character === "'" || character === '`') {
            quote = character;
        } else if (character === '{') {
            depth += 1;
        } else if (character === '}' && --depth === 0) {
            return index;
        }
    }
    return -1;
};
const parseJsxTag = (code, start) => {
    if (code[start] !== '<') return null;
    let index = start + 1;
    let closing = false;
    if (code[index] === '/') {
        closing = true;
        index += 1;
    }

    const fragment = code[index] === '>';
    let name = '';
    if (!fragment) {
        const nameMatch = code.slice(index).match(/^[A-Za-z][A-Za-z\d.:_-]*/u);
        if (!nameMatch) return null;
        name = nameMatch[0];
        index += name.length;
    }

    let quote = null;
    while (index < code.length) {
        const character = code[index];
        if (quote) {
            if (character === '\\') {
                index += 2;
                continue;
            }
            if (character === quote) quote = null;
        } else if (character === '"' || character === "'" || character === '`') {
            quote = character;
        } else if (character === '{') {
            const expressionEnd = findMatchingBrace(code, index);
            if (expressionEnd < 0) return null;
            index = expressionEnd + 1;
            continue;
        } else if (character === '>') {
            return {
                end: index + 1,
                closing,
                fragment,
                name: fragment ? 'fragment' : name,
                selfClosing: !closing && !fragment && /\/\s*$/u.test(code.slice(start, index)),
            };
        } else if (character === '<' && !fragment) {
            return null;
        }
        index += 1;
    }
    return null;
};

const collectJsxText = (code) => {
    const segments = [];
    const stack = [];
    let index = 0;
    let textStart = 0;

    while (index < code.length) {
        if (code[index] === '{') {
            const expressionEnd = findMatchingBrace(code, index);
            if (expressionEnd < 0) break;
            index = expressionEnd + 1;
            continue;
        }
        if (code[index] !== '<') {
            index += 1;
            continue;
        }

        const tag = parseJsxTag(code, index);
        if (!tag) {
            index += 1;
            continue;
        }

        if (stack.length > 0 && index > textStart) {
            stack.at(-1).chunks.push({
                index: textStart,
                text: code.slice(textStart, index),
            });
        }

        if (tag.closing) {
            if (stack.at(-1)?.name === tag.name) {
                segments.push(...stack.pop().chunks);
            }
        } else if (!tag.selfClosing) {
            stack.push({ name: tag.name, chunks: [] });
        }

        index = tag.end;
        textStart = tag.end;
    }
    return segments;
};
const ignoredJsxText = (text) => /[={}<>]|\/>/u.test(text);
const pageTextFile = path.join(sourceRoot, 'pageTextTranslations.js');
const pageTextSource = await readFile(pageTextFile, 'utf8');
const pageTextTranslations = new Map();
const entryPattern = /^\s*\[\s*((?:'[^'\\]*(?:\\.[^'\\]*)*')|(?:"[^"\\]*(?:\\.[^"\\]*)*"))\s*,\s*((?:'[^'\\]*(?:\\.[^'\\]*)*')|(?:"[^"\\]*(?:\\.[^"\\]*)*"))\s*\]/gmu;
for (const match of pageTextSource.matchAll(entryPattern)) {
    const sourceText = readLiteral(match[1]);
    const englishText = readLiteral(match[2]);
    if (typeof sourceText === 'string') pageTextTranslations.set(sourceText, englishText);
}

for (const filePath of sourceFiles) {
    const original = await readFile(filePath, 'utf8');
    const code = stripComments(original);
    const relativeFile = toRelativeFrontendPath(filePath);
    const seenTranslationKeys = new Map();

    for (const match of code.matchAll(/\bt\s*\(\s*((?:'[^'\\]*(?:\\.[^'\\]*)*')|(?:"[^"\\]*(?:\\.[^"\\]*)*")|(?:`[^`$]*`))/gu)) {
        const key = readLiteral(match[1]);
        if (typeof key !== 'string') continue;
        const occurrence = (seenTranslationKeys.get(key) ?? 0) + 1;
        seenTranslationKeys.set(key, occurrence);
        for (const [localeName, locale] of [['vi', viLocale], ['en', enLocale]]) {
            if (!locale.has(key)) {
                addFinding('2. t() keys', filePath, lineAt(original, match.index), `t("${key}") is missing from ${localeName}.js`, `${key}:${localeName}:${occurrence}`);
            }
        }
    }

    const triggerPattern = /\btranslatePageText\s*\(\s*((?:'[^'\\]*(?:\\.[^'\\]*)*')|(?:"[^"\\]*(?:\\.[^"\\]*)*")|(?:`[^`$]*`))/gu;
    const seenPageText = new Map();
    for (const match of code.matchAll(triggerPattern)) {
        const sourceText = readLiteral(match[1]);
        if (typeof sourceText !== 'string' || !vietnamesePattern.test(sourceText)) continue;
        const occurrence = (seenPageText.get(sourceText) ?? 0) + 1;
        seenPageText.set(sourceText, occurrence);
        if (!pageTextTranslations.has(sourceText)) {
            addFinding('3. translatePageText', filePath, lineAt(original, match.index), `Missing translation entry for "${sourceText}"`, `${sourceText}:${occurrence}`);
        } else {
            const englishText = pageTextTranslations.get(sourceText);
            if (typeof englishText !== 'string' || !englishText.trim() || englishText === sourceText) {
                addFinding('3. translatePageText', filePath, lineAt(original, match.index), `English translation is empty or identical for "${sourceText}"`, `${sourceText}:${occurrence}`);
            }
        }
    }

    const seenHardcodedText = new Map();
    const recordHardcoded = (index, content, context) => {
        const classification = classifyHardcodedText(content);
        if (!classification || isAllowlistedText(content)) return;
        const occurrenceKey = `${context}:${content}`;
        const occurrence = (seenHardcodedText.get(occurrenceKey) ?? 0) + 1;
        seenHardcodedText.set(occurrenceKey, occurrence);
        addFinding('4. Hardcoded Vietnamese', filePath, lineAt(original, index), `[${classification}] ${context}: "${content.trim()}"`, `${occurrenceKey}:${occurrence}`);
    };
    for (const segment of collectJsxText(code)) {
        if (!ignoredJsxText(segment.text)) {
            recordHardcoded(segment.index, segment.text, 'JSX text');
        }
    }
    const propNames = 'title|placeholder|confirmText|secondaryText|tertiaryText|label|text|description|subtitle|helperText|emptyText|successText|errorText|alt|aria-label';
    const propPattern = new RegExp(`\\b(${propNames})\\s*=\\s*`, 'gu');
    for (const match of code.matchAll(propPattern)) {
        const valueStart = match.index + match[0].length;
        const openingCharacter = code[valueStart];
        let value = '';
        let valueOffset = valueStart;
        if (openingCharacter === '"' || openingCharacter === "'") {
            let end = valueStart + 1;
            while (end < code.length) {
                if (code[end] === '\\') {
                    end += 2;
                } else if (code[end] === openingCharacter) {
                    end += 1;
                    break;
                } else {
                    end += 1;
                }
            }
            value = code.slice(valueStart, end);
        } else if (openingCharacter === '{') {
            const expressionEnd = findMatchingBrace(code, valueStart);
            if (expressionEnd < 0) continue;
            const expressionValue = code.slice(valueStart + 1, expressionEnd);
            if (/(?:translatePageText|(?:\w+\.)?t)\s*\(/u.test(expressionValue)) continue;
            value = expressionValue;
            valueOffset += 1;
        } else {
            continue;
        }
        for (const literal of value.matchAll(textLiteralPattern)) {
            const literalValue = staticText(literal[0]);
            if (typeof literalValue === 'string') {
                recordHardcoded(valueOffset + literal.index, literalValue, `prop ${match[1]}`);
            }
        }
    }
    const messageCallPattern = /\b(alert|confirm|toast(?:\.(?:success|error|warning|info))?|showToast|notify|set[A-Za-z]*(?:Alert|Error|Message|Toast))\s*\(\s*((?:'[^'\\]*(?:\\.[^'\\]*)*')|(?:"[^"\\]*(?:\\.[^"\\]*)*")|(?:`(?:\\.|[^`])*`))/gu;
    for (const match of code.matchAll(messageCallPattern)) {
        const messageText = staticText(match[2]);
        if (typeof messageText !== 'string') continue;
        recordHardcoded(match.index, messageText, `message ${match[1]}()`);
    }
}

let baseline = [];
let baselineExists = true;
try {
    const parsed = JSON.parse(await readFile(baselinePath, 'utf8'));
    baseline = Array.isArray(parsed.findings) ? parsed.findings : [];
} catch (error) {
    if (error.code === 'ENOENT') baselineExists = false;
    else throw error;
}

if (updateBaseline) {
    await writeFile(baselinePath, `${JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        findings: findings.map(({ id, group, file, message }) => ({ id, group, file, message })),
    }, null, 2)}\n`, 'utf8');
    baseline = findings.map(({ id }) => ({ id }));
    baselineExists = true;
}

const baselineIds = new Set(baseline.map((finding) => finding.id));
const findingsWithStatus = findings.map((finding) => ({
    ...finding,
    existing: baselineIds.has(finding.id),
}));
const groups = [
    '1. Parity locale',
    '2. t() keys',
    '3. translatePageText',
    '4. Hardcoded Vietnamese',
];
const reportLines = [
    'i18n coverage report',
    `Generated: ${new Date().toISOString()}`,
    `Baseline: ${updateBaseline ? 'updated by this run' : baselineExists ? 'loaded' : 'missing (treated as empty)'}`,
    '',
    'Group totals:',
    ...groups.map((group) => {
        const groupFindings = findingsWithStatus.filter((finding) => finding.group === group);
        const existingCount = groupFindings.filter((finding) => finding.existing).length;
        return `- ${group}: ${groupFindings.length} total; ${existingCount} in baseline; ${groupFindings.length - existingCount} new`;
    }),
    '',
    'Group 4 findings by file:',
    ...sourceFiles
        .map((filePath) => {
            const file = toRelativeFrontendPath(filePath);
            const count = findingsWithStatus.filter((finding) => (
                finding.group === '4. Hardcoded Vietnamese' && finding.file === file
            )).length;
            return `- ${file}: ${count}`;
        })
        .sort((left, right) => left.localeCompare(right)),
    '',
    'Possible false positives / omissions:',
    '- JSX text detection is lightweight and only reports text segments surrounded by matching opening/closing tag names; nested JSX inside expressions and unusual JSX syntax may be missed.',
    '- JSX text segments containing =, {, }, <, >, or /> are skipped to avoid code/operator false positives.',
    '- Template literal interpolations are omitted and only static text is checked; concatenated expressions may be missed. Nested template literals inside an interpolation may confuse extraction.',
    '- Prop matching covers title, placeholder, confirmText, secondaryText, tertiaryText, label, text, description, subtitle, helperText, emptyText, successText, errorText, alt, and aria-label; complex expressions may be missed.',
    '- Message-call detection covers alert/confirm/toast/showToast/notify and set* names ending in Alert, Error, Message, or Toast when a direct string/template literal is used.',
    `- Allowlisted values/tokens are excluded from detection: ${[...untranslatedAllowlist, ...properNameAllowlist].join(', ')}.`,
    '- Regex comment stripping is lightweight; comment-like sequences inside complex JSX or template expressions can be misread.',
    '- Vietnamese detection is based on the Unicode range [À-ỹ]; unaccented Vietnamese and other language-specific characters are not detected. English detection uses Latin words of at least two letters and can flag names or brands.',
    '- JSX text containing HTML entities, email/URL patterns, common code operators, .length, or dotted identifiers is ignored to reduce false positives.',
    '',
    'Details:',
];
if (findingsWithStatus.length === 0) {
    reportLines.push('No findings.');
} else {
    for (const finding of findingsWithStatus) {
        reportLines.push(`[${finding.group}] ${finding.file}:${finding.line} ${finding.existing ? '(baseline)' : '(new)'} ${finding.message}`);
    }
}
await writeFile(reportPath, `${reportLines.join('\n')}\n`, 'utf8');

const newFindings = findingsWithStatus.filter((finding) => !finding.existing);
const treatedCount = findingsWithStatus.filter((finding) => finding.existing).length;
const hardFailureCount = findings.filter((finding) => (
    finding.group === '1. Parity locale' || finding.group === '2. t() keys'
)).length;

console.log('i18n check summary');
for (const group of groups) {
    const groupFindings = findingsWithStatus.filter((finding) => finding.group === group);
    const existingCount = groupFindings.filter((finding) => finding.existing).length;
    console.log(`${group}: ${groupFindings.length} finding(s), ${groupFindings.length - existingCount} new`);
}
console.log(`Handled by baseline: ${treatedCount}`);

const fileCounts = new Map();
for (const finding of findingsWithStatus) {
    fileCounts.set(finding.file, (fileCounts.get(finding.file) ?? 0) + 1);
}
const topFiles = [...fileCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 10);
console.log('Top files by findings:');
if (topFiles.length === 0) console.log('- none');
for (const [file, count] of topFiles) console.log(`- ${file}: ${count}`);
console.log(`Full details: ${toRelativeFrontendPath(reportPath)}`);

if (hardFailureCount > 0 || newFindings.length > 0) {
    process.exitCode = 1;
}
