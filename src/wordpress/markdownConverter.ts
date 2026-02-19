/**
 * Shared Markdown → HTML converter for WordPress publishing.
 * Used by both PostComposer (single publish) and main.ts (batch republish).
 *
 * Pure function: no side effects, no Obsidian dependencies.
 */

/**
 * Convert a markdown string to WordPress-ready HTML.
 *
 * Handles: CRLF normalisation, dataview/SPEC removal, mermaid diagrams,
 * code blocks (blockquote + normal + inline), LaTeX (display + inline),
 * tables (blockquote + normal), headers, bold/italic, images, links,
 * blockquotes, lists (UL/OL), horizontal rules, paragraph wrapping,
 * and appends CDN scripts for mermaid / KaTeX when needed.
 */
export function convertMarkdownToHtml(markdown: string): string {
  // Normalize CRLF to LF (Windows line endings break regex matching)
  let html = markdown.replace(/\r\n/g, "\n");

  // Remove dataviewjs and dataview code blocks entirely
  html = html.replace(/```dataviewjs[\s\S]*?```/g, "");
  html = html.replace(/```dataview[\s\S]*?```/g, "");

  // Remove Obsidian [!abstract]- SPEC callout blocks (editorial-only, not for publication)
  html = html.replace(/^> \[!abstract\]- SPEC\r?\n(?:^>.*\r?\n?)*/gm, "");

  // Extract mermaid blocks as placeholders before code-block extraction
  const mermaidBlocks: string[] = [];
  html = html.replace(/```mermaid\r?\n([\s\S]*?)```/g, (_, code) => {
    const idx = mermaidBlocks.length;
    // Fix subgraph labels for mermaid v11 compatibility:
    // "subgraph My Title" → "subgraph _sg_N["My Title"]"
    let sgCounter = 0;
    const fixed = (code || "").trim().replace(
      /^(\s*)subgraph\s+(?!\S+\s*\[)(.+)$/gm,
      (_m: string, indent: string, title: string) =>
        `${indent}subgraph _sg${sgCounter++}["${title.trim()}"]`
    );
    mermaidBlocks.push(fixed);
    return `\n<!--MERMAID_${idx}-->\n`;
  });

  // PROTECT: Extract code blocks and inline code FIRST to prevent
  // tables, bold/italic, etc. from modifying their content.
  // HTML-escape content so XML/HTML tags are displayed as text.
  const codeBlocks: string[] = [];

  // First: code blocks inside blockquotes (> ```lang ... > ```)
  html = html.replace(
    /^>\s*```(\w*)\r?\n((?:^>.*\r?\n)*?)^>\s*```\s*$/gm,
    (_, lang, code) => {
      const stripped = code.replace(/^>\s?/gm, "");
      const trimmed = stripped.replace(/^\n+/, "").replace(/\n+$/, "");
      const escaped = trimmed
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const idx = codeBlocks.length;
      codeBlocks.push(
        `<pre><code class="language-${lang}">${escaped}</code></pre>`
      );
      return `> <!--CODEBLOCK_${idx}-->\n`;
    }
  );

  // Then: normal code blocks
  html = html.replace(
    /```(\w*)\r?\n([\s\S]*?)```/g,
    (_, lang, code) => {
      const trimmed = code.replace(/^\n+/, "").replace(/\n+$/, "");
      const escaped = trimmed
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const idx = codeBlocks.length;
      codeBlocks.push(
        `<pre><code class="language-${lang}">${escaped}</code></pre>`
      );
      return `\n<!--CODEBLOCK_${idx}-->\n`;
    }
  );

  // Convert LaTeX text-mode commands to Unicode BEFORE inline code extraction.
  // LaTeX \`{a} contains a backtick that would otherwise be misinterpreted as
  // inline code start, swallowing content across lines.
  // These are text-encoding commands — Unicode IS their faithful rendering.
  html = convertLatexTextToUnicode(html);

  // Inline code (restrict to single line to prevent cross-line matching)
  const inlineCodes: string[] = [];
  html = html.replace(/`([^`\n]+)`/g, (_, code) => {
    const escaped = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escaped}</code>`);
    return `<!--INLINECODE_${idx}-->`;
  });

  // PROTECT: Extract LaTeX blocks before markdown processing
  // (underscore, asterisk, backslash in LaTeX would be corrupted by bold/italic regex)
  const latexBlocks: string[] = [];
  // Display math $$...$$ (multiline)
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => {
    const idx = latexBlocks.length;
    latexBlocks.push(`<div class="katex-display">$$${tex}$$</div>`);
    return `\n<!--LATEXBLOCK_${idx}-->\n`;
  });
  // Inline math $...$ (single $, not preceded/followed by space+$)
  html = html.replace(/(?<!\$)\$(?!\$)([^\n$]+?)\$(?!\$)/g, (_, tex) => {
    const idx = latexBlocks.length;
    latexBlocks.push(`<span class="katex-inline">$${tex}$</span>`);
    return `<!--LATEXINLINE_${idx}-->`;
  });
  const hasLatex = latexBlocks.length > 0;

  // Convert markdown tables to HTML tables
  html = convertTablesToHtml(html);

  // Headers
  html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
  html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Images (already processed to WordPress URLs)
  html = html.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1">'
  );

  // Links (including converted wikilinks which are now <a> tags)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Blockquotes
  // First handle empty blockquote lines (just ">" or "> ") so they merge properly
  html = html.replace(/^>\s*$/gm, "<blockquote></blockquote>");
  html = html.replace(/^>\s+(.+)$/gm, "<blockquote>$1</blockquote>");
  // Merge consecutive blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, "\n");

  // Unordered lists
  html = html.replace(/^[*-]\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(
    /(<li>.*<\/li>\n?)+/g,
    (match) => `<ul>\n${match}</ul>\n`
  );

  // Ordered lists - use temporary <oli> tag to avoid conflict with <li> already inside <ul>
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<oli>$1</oli>");
  html = html.replace(
    /(<oli>.*<\/oli>\n?)+/g,
    (match) =>
      `<ol>\n${match.replace(/<oli>/g, "<li>").replace(/<\/oli>/g, "</li>")}</ol>\n`
  );

  // Horizontal rules
  html = html.replace(/^---+$/gm, "<hr>");
  html = html.replace(/^\*\*\*+$/gm, "<hr>");
  html = html.replace(/^___+$/gm, "<hr>");

  // Paragraphs - wrap text blocks in <p> tags
  const lines = html.split("\n");
  const result: string[] = [];
  let inParagraph = false;
  let paragraphContent: string[] = [];
  let consecutiveEmptyLines = 0;
  let inPreBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Track pre blocks to avoid processing their content
    if (trimmed.startsWith("<pre") || trimmed.includes("<pre>")) {
      inPreBlock = true;
    }
    if (trimmed.includes("</pre>") || trimmed.startsWith("</pre")) {
      inPreBlock = false;
      consecutiveEmptyLines = 0; // Reset after code block
      result.push(line);
      continue;
    }

    // If inside a pre block, just add the line as-is
    if (inPreBlock) {
      result.push(line);
      continue;
    }

    // Check if this is a block element
    const isBlockElement =
      trimmed.startsWith("<h") ||
      trimmed.startsWith("<ul") ||
      trimmed.startsWith("<ol") ||
      trimmed.startsWith("<li") ||
      trimmed.startsWith("</ul") ||
      trimmed.startsWith("</ol") ||
      trimmed.startsWith("<blockquote") ||
      trimmed.startsWith("</blockquote") ||
      trimmed.startsWith("<pre") ||
      trimmed.startsWith("</pre") ||
      trimmed.startsWith("<hr") ||
      trimmed.startsWith("<img") ||
      trimmed.startsWith("<table") ||
      trimmed.startsWith("</table") ||
      trimmed.startsWith("<thead") ||
      trimmed.startsWith("</thead") ||
      trimmed.startsWith("<tbody") ||
      trimmed.startsWith("</tbody") ||
      trimmed.startsWith("<tr") ||
      trimmed.startsWith("</tr") ||
      trimmed.startsWith("<th") ||
      trimmed.startsWith("<td") ||
      trimmed.startsWith("<!--CODEBLOCK_") ||
      trimmed.startsWith("<!--LATEXBLOCK_") ||
      trimmed === "";

    if (trimmed === "") {
      consecutiveEmptyLines++;
      // Close any open paragraph on first empty line
      if (inParagraph && paragraphContent.length > 0) {
        result.push(`<p>${paragraphContent.join("<br>")}</p>`);
        paragraphContent = [];
        inParagraph = false;
      }
      // Add extra line break for double+ empty lines
      if (consecutiveEmptyLines >= 2) {
        result.push("<p>&nbsp;</p>");
      }
    } else if (isBlockElement) {
      consecutiveEmptyLines = 0;
      // Close any open paragraph
      if (inParagraph && paragraphContent.length > 0) {
        result.push(`<p>${paragraphContent.join("<br>")}</p>`);
        paragraphContent = [];
        inParagraph = false;
      }
      result.push(line);
    } else {
      consecutiveEmptyLines = 0;
      // Regular text line
      inParagraph = true;
      paragraphContent.push(trimmed);
    }
  }

  // Close final paragraph if needed
  if (inParagraph && paragraphContent.length > 0) {
    result.push(`<p>${paragraphContent.join("<br>")}</p>`);
  }

  // Remove leading empty paragraphs (ensure H1 comes first)
  let finalHtml = result.join("\n");
  finalHtml = finalHtml.replace(/^(\s*<p>&nbsp;<\/p>\s*)+/, "");

  // RESTORE: Put back protected code blocks, inline code, and LaTeX
  for (let i = 0; i < codeBlocks.length; i++) {
    finalHtml = finalHtml.replace(
      `<!--CODEBLOCK_${i}-->`,
      codeBlocks[i] ?? ""
    );
  }
  for (let i = 0; i < inlineCodes.length; i++) {
    finalHtml = finalHtml.replace(
      `<!--INLINECODE_${i}-->`,
      inlineCodes[i] ?? ""
    );
  }
  for (let i = 0; i < latexBlocks.length; i++) {
    finalHtml = finalHtml.replace(
      `<!--LATEXBLOCK_${i}-->`,
      latexBlocks[i] ?? ""
    );
    finalHtml = finalHtml.replace(
      `<!--LATEXINLINE_${i}-->`,
      latexBlocks[i] ?? ""
    );
  }

  // Restore mermaid blocks
  if (mermaidBlocks.length > 0) {
    finalHtml = finalHtml.replace(/<!--MERMAID_(\d+)-->/g, (_, idx) => {
      const code = mermaidBlocks[parseInt(idx, 10)] || "";
      return `<pre class="mermaid">\n${code}\n</pre>`;
    });

    // CSS fix: prevent subgraph title wrapping (mermaid hardcodes foreignObject at 200px)
    finalHtml +=
      "\n<style>.mermaid .cluster-label foreignObject{width:auto !important;overflow:visible !important}.mermaid .cluster-label foreignObject div{max-width:none !important;white-space:nowrap !important;width:auto !important}</style>";

    // Append mermaid.js CDN script
    const mermaidCdn =
      "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
    finalHtml += `\n<script type="module">import mermaid from "${mermaidCdn}";mermaid.initialize({startOnLoad:true,theme:"default"});</script>`;
  }

  // Append KaTeX CDN for LaTeX rendering
  if (hasLatex) {
    const katexVer = "0.16.21";
    const katexCdn = `https://cdn.jsdelivr.net/npm/katex@${katexVer}/dist`;
    finalHtml += `\n<link rel="stylesheet" href="${katexCdn}/katex.min.css">`;
    finalHtml += `\n<script defer src="${katexCdn}/katex.min.js"></script>`;
    finalHtml += `\n<script defer src="${katexCdn}/contrib/auto-render.min.js" onload="renderMathInElement(document.body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],throwOnError:false})"></script>`;
  }

  return finalHtml;
}

/**
 * Convert markdown tables to HTML tables.
 * Handles both blockquote tables (lines prefixed with "> ") and normal tables.
 */
function convertTablesToHtml(text: string): string {
  // First pass: convert tables inside blockquotes (lines prefixed with "> ")
  const blockquoteTableRegex =
    /(?:^>\s*\|.+\|\n)(?:^>\s*\|[-:\s|]+\|\n)(?:^>\s*\|.+\|\n?)+/gm;
  text = text.replace(blockquoteTableRegex, (match) => {
    // Strip "> " prefix from each line
    const stripped = match.replace(/^>\s?/gm, "");
    const tableHtml = parseTableToHtml(stripped);
    if (tableHtml) {
      // Prefix every line with "> " so it stays inside the blockquote
      return tableHtml
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    }
    return match;
  });

  // Second pass: convert normal tables (no blockquote prefix)
  const tableRegex = /\|(.+)\|\n\|[-:\s|]+\|\n((?:\|.+\|\n?)+)/g;
  text = text.replace(tableRegex, (match) => {
    return parseTableToHtml(match) || match;
  });

  return text;
}

/**
 * Parse a markdown table string into an HTML table.
 */
function parseTableToHtml(tableText: string): string | null {
  const lines = tableText.trim().split("\n");
  if (lines.length < 3) return null;

  // Parse header row
  const headerLine = lines[0] ?? "";
  const headers = headerLine
    .split("|")
    .map((h) => h.trim())
    .filter((h) => h);

  // Skip separator row (index 1), parse data rows
  const rows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    const rowLine = lines[i] ?? "";
    const cells = rowLine
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c);
    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  // Build HTML table (styling handled by WordPress theme)
  let tableHtml = "<table>\n<thead>\n<tr>\n";
  for (const header of headers) {
    tableHtml += `<th>${header}</th>\n`;
  }
  tableHtml += "</tr>\n</thead>\n<tbody>\n";

  for (const row of rows) {
    tableHtml += "<tr>\n";
    for (let i = 0; i < headers.length; i++) {
      const cell = row[i] ?? "";
      tableHtml += `<td>${cell}</td>\n`;
    }
    tableHtml += "</tr>\n";
  }

  tableHtml += "</tbody>\n</table>\n";
  return tableHtml;
}

/**
 * Convert LaTeX text-mode commands to their Unicode equivalents.
 * Only handles character-encoding commands (accents, punctuation marks).
 * Protects math regions ($...$, $$...$$) — those are left intact for KaTeX.
 *
 * This is 100% faithful: \'{e} renders as é in LaTeX, \guillemotleft as «, etc.
 */
function convertLatexTextToUnicode(text: string): string {
  // Step 1: Protect math regions by replacing them with placeholders
  const mathRegions: string[] = [];

  // Display math $$...$$ first (greedy before inline)
  let safe = text.replace(/\$\$[\s\S]*?\$\$/g, (match) => {
    const idx = mathRegions.length;
    mathRegions.push(match);
    return `\x00MATH${idx}\x00`;
  });

  // Inline math $...$
  safe = safe.replace(/(?<!\$)\$(?!\$)([^\n$]+?)\$(?!\$)/g, (match) => {
    const idx = mathRegions.length;
    mathRegions.push(match);
    return `\x00MATH${idx}\x00`;
  });

  // Step 2: Convert LaTeX text commands in remaining (non-math) text
  safe = convertLatexAccents(safe);
  safe = convertLatexNamedCommands(safe);

  // Step 3: Restore math regions untouched
  for (let i = 0; i < mathRegions.length; i++) {
    safe = safe.replace(`\x00MATH${i}\x00`, mathRegions[i] ?? "");
  }

  return safe;
}

/** Replace braced accent commands: \'{e} → é, \`{a} → à, \^{i} → î, \c{c} → ç, etc. */
function convertLatexAccents(text: string): string {
  const bracedAccents: Record<string, Record<string, string>> = {
    "'": { a: "á", e: "é", i: "í", o: "ó", u: "ú", y: "ý", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú", Y: "Ý" },
    "`": { a: "à", e: "è", i: "ì", o: "ò", u: "ù", A: "À", E: "È", I: "Ì", O: "Ò", U: "Ù" },
    "^": { a: "â", e: "ê", i: "î", o: "ô", u: "û", A: "Â", E: "Ê", I: "Î", O: "Ô", U: "Û" },
    "\"": { a: "ä", e: "ë", i: "ï", o: "ö", u: "ü", y: "ÿ", A: "Ä", E: "Ë", I: "Ï", O: "Ö", U: "Ü" },
    "~": { a: "ã", n: "ñ", o: "õ", A: "Ã", N: "Ñ", O: "Õ" },
    "c": { c: "ç", C: "Ç" }
  };

  return text.replace(/\\(['^"`~c])\{(\w)\}/g, (match, accent, letter) => {
    const map = bracedAccents[accent as string];
    return map?.[letter as string] ?? match;
  });
}

/** Replace named LaTeX text commands: \guillemotleft → «, \oe → œ, etc. */
function convertLatexNamedCommands(text: string): string {
  const namedCommands: [RegExp, string][] = [
    // Longest first to avoid partial matches
    [/\\guillemotright(?:\\\s|(?=[\s{}.,;:!?\]]))/g, "»"],
    [/\\guillemotleft(?:\\\s|(?=[\s{}.,;:!?\]]))/g, "«"],
    [/\\textellipsis(?=[\s{}.,;:!?])/g, "…"],
    [/\\textemdash(?=[\s{}.,;:!?])/g, "—"],
    [/\\textendash(?=[\s{}.,;:!?])/g, "–"],
    [/\\copyright(?=[\s{}.,;:!?])/g, "©"],
    [/\\pounds(?=[\s{}.,;:!?])/g, "£"],
    [/\\ldots(?=[\s{}.,;:!?])/g, "…"],
    [/\\dots(?=[\s{}.,;:!?])/g, "…"],
    [/\\euro(?=[\s{}.,;:!?])/g, "€"],
    [/\\ddag(?=[\s{}.,;:!?])/g, "‡"],
    [/\\dag(?=[\s{}.,;:!?])/g, "†"],
    [/\\OE(?=[\s{}.,;:!?])/g, "Œ"],
    [/\\AE(?=[\s{}.,;:!?])/g, "Æ"],
    [/\\AA(?=[\s{}.,;:!?])/g, "Å"],
    [/\\oe(?=[\s{}.,;:!?])/g, "œ"],
    [/\\ae(?=[\s{}.,;:!?])/g, "æ"],
    [/\\ss(?=[\s{}.,;:!?])/g, "ß"],
    [/\\aa(?=[\s{}.,;:!?])/g, "å"],
    [/\\o(?=[\s{}.,;:!?])/g, "ø"],
    [/\\O(?=[\s{}.,;:!?])/g, "Ø"]
  ];

  for (const [regex, replacement] of namedCommands) {
    text = text.replace(regex, (match) => {
      // \guillemotright\ (backslash-space) → » + space
      if (match.endsWith("\\ ") || match.endsWith("\\\t")) {
        return `${replacement} `;
      }
      return replacement;
    });
  }

  return text;
}
