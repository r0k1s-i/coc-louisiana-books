// Stage B engine (shared): intermediate markdown -> EPUB.
// Pure rendering pass: no classification/parsing of the raw OCR happens
// here, so re-running this after a CSS/markup tweak is cheap and never
// touches the (slow, judgment-heavy) Stage A output. Nothing here is
// specific to any one book -- all of that comes in via `cfg`.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Splits text into one <span> per unit for a .flexline element (see the
// title-page CSS): "char" wraps every character, "word" wraps every
// whitespace-separated token. Flexbox (justify-content: space-between)
// then spreads the spans to fill the line's actual measured width, live,
// in whatever font/size the reader is actually using -- no precomputed
// letter/word-spacing number to drift out of sync with the real font.
function splitFlexSpans(str, unit) {
  const units = unit === 'word' ? String(str || '').split(/\s+/).filter(Boolean) : Array.from(String(str || ''));
  return units.map(u => `<span>${escapeHtml(u)}</span>`).join('');
}

function applyEmphasis(s) {
  // 1. Convert parenthetical notes like （*...） or (*...) into styled inline notes
  s = s.replace(/（\*(.+?)）/g, '<span class="note-inline">（*$1）</span>');
  s = s.replace(/\(\*(.+?)\)/g, '<span class="note-inline">(*$1)</span>');

  // 2. Real emphasis: *word* where word is 1-25 chars without punctuation/spaces/asterisks
  s = s.replace(/(?<![*a-zA-Z0-9])\*([^\s*，。！？；：“”‘’（）()]{1,25})\*(?![*a-zA-Z0-9])/g, '<em>$1</em>');

  return s;
}

const DISCLAIMER_RE = /大面积魔改而成自娱自乐.*切勿当真.*请积极回避/;

function parseIntermediateMarkdown(raw) {
  const rawLines = raw.split(/\r\n|\n/);
  const chapters = [];
  let current = null;
  let curBlockLines = [];

  function pushBlock() {
    if (curBlockLines.length) {
      if (current) {
        // Filter out any standalone disclaimer line from chapter body
        const isDisclaimer = curBlockLines.length === 1 && DISCLAIMER_RE.test(curBlockLines[0]);
        if (!isDisclaimer) {
          current.blocks.push(curBlockLines);
        }
      }
      curBlockLines = [];
    }
  }

  for (const lineRaw of rawLines) {
    const line = lineRaw.replace(/\r$/, '');
    if (line.trim() === '') { pushBlock(); continue; }
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) continue; // book title line, ignored (handled by title page)
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      pushBlock();
      current = { title: h2[1].trim(), blocks: [] };
      chapters.push(current);
      continue;
    }
    curBlockLines.push(line);
  }
  pushBlock();
  console.error(`Parsed ${chapters.length} chapters from intermediate markdown.`);
  return chapters;
}

function renderBlock(lines) {
  const first = lines[0];

  if (first.startsWith('> ')) {
    const inner = lines.map(l => l.replace(/^>\s?/, ''));
    const pcMatch = inner[0].match(/^\*\*调查员登场：\*\*\s*(.+?)\s—\s纸浆天赋：(.+)$/);
    if (pcMatch) {
      const desc = applyEmphasis(escapeHtml(pcMatch[1].trim()));
      const talent = applyEmphasis(escapeHtml(pcMatch[2].trim()));
      return `<div class="pc-card">
<p class="pc-label">调查员登场</p>
<p class="pc-desc">${desc}</p>
<p class="pc-talent">纸浆天赋：${talent}</p>
</div>`;
    }
    const paras = inner.map((raw0) => {
      const m = raw0.match(/^\*\*([^*]+)：\*\*\s*(.+)$/);
      if (m) {
        const speaker = escapeHtml(m[1]);
        const text = applyEmphasis(escapeHtml(m[2]));
        return `<p class="line"><span class="speaker">${speaker}：</span>${text}</p>`;
      }
      const text = applyEmphasis(escapeHtml(raw0));
      return `<p class="line line-cont">${text}</p>`;
    });
    return `<blockquote class="dialogue">\n${paras.join('\n')}\n</blockquote>`;
  }

  const sceneMatch = first.match(/^——\s*(.+?)\s*——$/);
  if (sceneMatch) return `<p class="scene" style="text-align: center; text-indent: 0;">${escapeHtml(sceneMatch[1])}</p>`;

  const subtitleMatch = first.match(/^§(.+)$/);
  if (subtitleMatch) return `<p class="ms-subtitle" style="text-align: center; text-indent: 0;">${applyEmphasis(escapeHtml(subtitleMatch[1]))}</p>`;

  if (first === '《引用》') {
    const rows = lines.slice(1).map(l => `<p>${applyEmphasis(escapeHtml(l))}</p>`).join('\n');
    return `<blockquote class="citation">\n${rows}\n</blockquote>`;
  }

  if (first === '【图片】') {
    const imgs = lines.slice(1).map(p => `<img src="../${escapeHtml(p)}" alt="" style="display: block; margin: 0.5em auto;" />`).join('\n');
    return `<div class="img-block" style="text-align: center;">\n${imgs}\n</div>`;
  }

  if (first === '【招牌】') {
    const isBilingual = lines.length > 2;
    const signLines = lines.slice(1).map((l, i) => {
      const cls = (isBilingual && i === lines.length - 2) ? 'sign-line sign-en' : 'sign-line';
      return `<p class="${cls}" style="text-align: center; text-indent: 0;">${escapeHtml(l)}</p>`;
    }).join('\n');
    return `<div class="sign" style="text-align: center;">\n${signLines}\n</div>`;
  }

  if (first.startsWith('▷ ')) {
    const rows = lines.map(l => {
      const cls = l.startsWith('🎲') ? 'dice-roll' : l.startsWith('🌟') ? 'dice-outcome'
        : l.startsWith('🍀') ? 'dice-luck' : 'dice-who';
      const text = l.startsWith('▷ ') ? l.slice(2) : l;
      return `<p class="${cls}">${escapeHtml(text)}</p>`;
    });
    return `<div class="dice-card">\n${rows.join('\n')}\n</div>`;
  }

  if (first.startsWith('`')) {
    const rows = lines.map(l => {
      const m = l.match(/^`(.+)`$/);
      return `<p class="mech">${escapeHtml(m ? m[1] : l)}</p>`;
    });
    return rows.join('\n');
  }

  const noteMatch = first.match(/^\*?〔注〕(.+?)\*?$/);
  if (noteMatch) return `<p class="note">〔注〕${escapeHtml(noteMatch[1])}</p>`;

  return lines.map(l => `<p class="narr">${applyEmphasis(escapeHtml(l))}</p>`).join('\n');
}

// 制作人员 appendix: § section headings, every other line centered; URL lines
// become clickable links (the model-credit lists are Sketchfab profile URLs).
function renderCredits(blocks) {
  return blocks.map(lines => {
    const sub = lines[0].match(/^§(.+)$/);
    if (sub) return `<p class="ms-subtitle" style="text-align: center; text-indent: 0;">${escapeHtml(sub[1])}</p>`;
    return lines.map(l => {
      const t = escapeHtml(l);
      const inner = /^https?:\/\/\S+$/.test(l) ? `<a href="${t}">${t}</a>` : t;
      return `<p class="credit" style="text-align: center; text-indent: 0;">${inner}</p>`;
    }).join('\n');
  }).join('\n');
}

function renderRulesPreface(blocks) {
  const out = [];
  for (const lines of blocks) {
    const text = lines.join(' ');
    if (/^\d+\.\s/.test(text)) {
      const items = lines.map(l => l.replace(/^\d+\.\s*/, ''));
      out.push('<ol class="rules-list">' + items.map(i => `<li>${escapeHtml(i)}</li>`).join('') + '</ol>');
    } else if (/^[^。]{1,12}：$/.test(text)) {
      // A short "Label：" line with no further punctuation (e.g. "其他：",
      // "《纸浆克苏鲁》规则相关：") -- a lead-in for the list that follows.
      out.push(`<p class="rules-lead">${escapeHtml(text)}</p>`);
    } else {
      out.push(`<p class="narr">${escapeHtml(text)}</p>`);
    }
  }
  return out.join('\n');
}

const CSS = `
@charset "UTF-8";

:root {
  --text-color: #222222;
  --narr-color: #262626;
  --bg-dialogue: rgba(111, 143, 106, 0.12);
  --border-dialogue: #6f8f6a;
  --speaker-color: #2a5223;
  --dialogue-text: #1d2b1a;
  --bg-card: rgba(0, 0, 0, 0.035);
  --border-card: #d3d8d1;
  --card-text: #2f3b2c;
  --dice-outcome: #7a501a;
  --dice-luck: #3d6a26;
  --note-color: #666666;
  --border-rule: #999999;
  --sign-color: #333333;
  --citation-border: #9a9284;
  --citation-text: #4a4638;
}

@media (prefers-color-scheme: dark) {
  /* Set the background too: a reader that reports dark scheme but keeps a
     white page would otherwise show light-grey text on white. */
  body {
    background-color: #1c1c1c;
  }
  :root {
    --text-color: #dddddd;
    --narr-color: #d6d6d6;
    --bg-dialogue: rgba(111, 143, 106, 0.22);
    --border-dialogue: #5a8254;
    --speaker-color: #8ac282;
    --dialogue-text: #d8e5d6;
    --bg-card: rgba(255, 255, 255, 0.06);
    --border-card: rgba(255, 255, 255, 0.18);
    --card-text: #dcdfdc;
    --dice-outcome: #e5b060;
    --dice-luck: #8ec473;
    --note-color: #999999;
    --border-rule: #555555;
    --sign-color: #cccccc;
    --citation-border: #756f64;
    --citation-text: #ccc7bb;
  }
}

body {
  font-family: "Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", "SimSun", serif;
  line-height: 1.85;
  margin: 0 4%;
  padding: 0;
  color: #222;
  color: var(--text-color, #222);
  text-align: justify;
  text-justify: inter-ideograph;
  -webkit-text-align: justify;
}

a {
  color: #2a5223;
  color: var(--speaker-color, #2a5223);
  text-decoration: underline;
  text-underline-offset: 2px;
}
a:hover {
  opacity: 0.8;
}

/* Cover page */
body.cover-body {
  margin: 0;
  padding: 0;
  background-color: #000000;
  text-align: center;
}
.cover-wrap {
  margin: 0;
  padding: 0;
  min-height: 98vh;
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
  break-inside: avoid;
  page-break-inside: avoid;
}
.cover-img {
  max-width: 100%;
  max-height: 98vh;
  height: auto;
  width: auto;
  margin: 0 auto;
  display: block;
}

/* Title page */
.titlepage {
  text-align: center;
  padding-top: 22vh;
  margin: 0;
  break-inside: avoid;
  page-break-inside: avoid;
}
/* Fixed-measure column. Every line inside stretches edge to edge across
   it via flexbox (display:flex; justify-content:space-between) with its
   text pre-split (in the build script) into one <span> per character (the
   two CJK lines, plus the English title -- so a hyphenated, spaceless
   title like "SHORT-SIGHTED" still gets plenty of split points) or per
   word (the English series line). Flexbox distributes the real remaining
   space live, in whatever font the reader substitutes, at whatever size
   the reader's user picks -- unlike a precomputed letter-spacing/word-
   spacing number (tried before this), which was calibrated to one specific
   font's metrics and drifted on any other, and unlike text-align-last:
   justify (tried before that), which CSS specifies to fall back to flush
   -end when a line has no internal justification opportunity -- both
   produced exactly the "still not aligned" bug reported. */
.titleblock {
  display: block;
  width: 24em;
  max-width: 92%;
  margin: 0 auto;
}
.flexline {
  display: flex;
  width: 100%;
  justify-content: space-between;
}
h1.booktitle {
  font-size: 2.6em;
  font-weight: 700;
  margin: 0 0 0.25em 0;
  color: inherit;
}
h2.booktitle-en {
  font-family: "Helvetica Neue", Arial, sans-serif;
  font-size: 2em;
  font-weight: 800;
  text-transform: uppercase;
  margin: 0 0 0.6em 0;
  color: inherit;
}
p.booksubtitle {
  font-size: 1em;
  margin: 0 0 0.4em 0;
  color: #555;
  color: var(--note-color, #555);
}
p.bookseries-en {
  font-family: "Helvetica Neue", Arial, sans-serif;
  font-size: 0.62em;
  text-transform: uppercase;
  color: #777;
  color: var(--note-color, #777);
  margin: 0;
}
p.bookmeta {
  font-size: 0.85em;
  letter-spacing: 0.1em;
  color: #777;
  color: var(--note-color, #777);
  margin-top: 1.8em;
}

/* Colophon / Copyright page */
.colophon-page {
  padding-top: 5vh;
  margin: 0 auto;
  max-width: 90%;
  break-inside: avoid;
  page-break-inside: avoid;
}
.colophon-box {
  border: 1px solid var(--border-card, #d3d8d1);
  padding: 1.4em 1.3em;
  background: var(--bg-card, #fcfcfc);
  border-radius: 4px;
}
h2.colophon-title {
  font-size: 1.15em;
  text-align: center;
  letter-spacing: 0.15em;
  margin: 0 0 1em 0;
  padding-bottom: 0.5em;
  border-bottom: 1px solid var(--border-rule, #ccc);
  color: inherit;
}
.colophon-meta {
  margin: 1em 0;
  font-size: 0.9em;
  line-height: 1.75;
}
p.colophon-item {
  margin: 0.45em 0;
  text-indent: 0;
}
span.colophon-label {
  font-weight: bold;
  color: var(--speaker-color, #2a5223);
  display: inline-block;
  min-width: 5.5em;
}
span.colophon-val {
  word-break: break-all;
}
.colophon-divider {
  border-top: 1px dashed var(--border-card, #ccc);
  margin: 1.1em 0;
}
.colophon-notice {
  font-size: 0.84em;
  line-height: 1.65;
  color: var(--note-color, #666);
}
.colophon-notice p {
  margin: 0.4em 0;
  text-indent: 0;
}
p.notice-title {
  font-weight: bold;
  color: inherit;
}

/* Author page */
.author-page {
  padding-top: 6vh;
  margin: 0 auto;
  max-width: 90%;
  text-align: center;
  break-inside: avoid;
  page-break-inside: avoid;
}
.author-card {
  padding: 1.5em 1.2em;
  border: 1px solid var(--border-card, #d3d8d1);
  background: var(--bg-card, #fafafa);
  border-radius: 6px;
}
.author-avatar-wrap {
  width: 96px;
  height: 96px;
  margin: 0 auto 0.8em auto;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  border: 2px solid var(--border-dialogue, #6f8f6a);
}
.author-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
h2.author-name {
  font-size: 1.35em;
  margin: 0.2em 0 0.1em 0;
  letter-spacing: 0.1em;
  color: inherit;
}
p.author-signature {
  font-family: "Georgia", serif;
  font-style: italic;
  color: var(--note-color, #777);
  font-size: 0.95em;
  margin: 0.2em 0 0.9em 0;
  letter-spacing: 0.05em;
}
.author-links {
  margin: 0.7em 0;
  font-size: 0.88em;
}
p.author-link-row {
  margin: 0.3em 0;
  text-indent: 0;
}
span.author-link-label {
  font-weight: bold;
  color: var(--speaker-color, #2a5223);
}
.author-bio {
  margin-top: 1.1em;
  padding-top: 0.9em;
  border-top: 1px solid var(--border-card, #e0e0e0);
  font-size: 0.88em;
  line-height: 1.75;
  text-align: justify;
  text-justify: inter-ideograph;
  -webkit-text-align: justify;
  color: inherit;
}
.author-bio p {
  margin: 0.4em 0;
  text-indent: 2em;
}

/* Notice page (观前提示) */
.notice-page {
  padding-top: 20vh;
  margin: 0 auto;
  max-width: 82%;
  text-align: center !important;
  break-inside: avoid;
  page-break-inside: avoid;
}
.notice-box {
  padding: 2.2em 1.5em;
  border-top: 1px solid var(--border-rule, #999);
  border-bottom: 1px solid var(--border-rule, #999);
  text-align: center !important;
}
h2.notice-head {
  font-size: 1.15em;
  letter-spacing: 0.25em;
  margin: 0 0 1.2em 0;
  color: var(--speaker-color, #2a5223);
  text-align: center !important;
}
.notice-content p {
  margin: 0.8em 0;
  text-indent: 0 !important;
  font-size: 0.95em;
  line-height: 1.85;
  color: inherit;
  letter-spacing: 0.05em;
  text-align: center !important;
}

/* Chapter title */
h1.chaptertitle {
  text-align: center !important;
  text-indent: 0 !important;
  font-size: 1.4em;
  margin: 1.8em 0 1.4em 0;
  letter-spacing: 0.2em;
  border-bottom: 1px solid #999;
  border-bottom-color: var(--border-rule, #999);
  padding-bottom: 0.6em;
  color: inherit;
}

/* Narration */
p.narr {
  margin: 0.85em 0;
  text-indent: 2em;
  color: inherit;
  text-align: justify;
  text-justify: inter-ideograph;
  -webkit-text-align: justify;
  word-break: break-word;
}

/* Dialogue */
blockquote.dialogue {
  margin: 0.65em 0;
  padding: 0.45em 0.85em;
  border-left: 3.5px solid #6f8f6a;
  border-left-color: var(--border-dialogue, #6f8f6a);
  background: #edf3ed;
  background: var(--bg-dialogue, #edf3ed);
  border-radius: 0 4px 4px 0;
  break-inside: avoid;
  page-break-inside: avoid;
}
blockquote.dialogue + blockquote.dialogue {
  margin-top: 0.22em;
}
blockquote.dialogue p.line {
  margin: 0.35em 0;
  text-indent: 0;
  color: #26331f;
  color: var(--dialogue-text, #26331f);
  text-align: justify;
  text-justify: inter-ideograph;
  -webkit-text-align: justify;
  word-break: break-word;
}
blockquote.dialogue p.line:first-child { margin-top: 0; }
blockquote.dialogue p.line:last-child { margin-bottom: 0; }
blockquote.dialogue .speaker {
  font-weight: bold;
  color: #2a5223;
  color: var(--speaker-color, #2a5223);
  margin-right: 0.25em;
}
blockquote.dialogue p.line-cont {
  text-indent: 0;
  padding-left: 1.2em;
}

/* Rules preface */
p.rules-lead {
  font-weight: bold;
  margin: 1.2em 0 0.4em 0;
  color: inherit;
}
ol.rules-list {
  margin: 0.4em 0 1.2em 0;
  padding-left: 1.6em;
}
ol.rules-list li {
  margin: 0.45em 0;
  text-align: justify;
  text-justify: inter-ideograph;
  -webkit-text-align: justify;
}

/* 制作人员 appendix line */
p.credit {
  margin: 0.25em 0;
  text-align: center !important;
  text-indent: 0 !important;
  word-break: break-all;
}

/* Scene / time-skip caption */
p.scene {
  margin: 1.6em 0;
  text-align: center !important;
  text-indent: 0 !important;
  letter-spacing: 0.25em;
  color: #666;
  color: var(--note-color, #666);
  font-size: 0.95em;
  break-inside: avoid;
  page-break-inside: avoid;
}

/* Manuscript / document section heading */
p.ms-subtitle {
  margin: 1.8em 0 0.6em 0;
  text-align: center !important;
  text-indent: 0 !important;
  font-weight: bold;
  letter-spacing: 0.2em;
  color: inherit;
  break-inside: avoid;
  page-break-inside: avoid;
}

/* Quoted citation */
blockquote.citation {
  margin: 1em 1.2em;
  padding: 0.3em 1em;
  border-left: 3px solid #9a9284;
  border-left-color: var(--citation-border, #9a9284);
  font-style: italic;
  color: #4a4638;
  color: var(--citation-text, #4a4638);
  break-inside: avoid;
  page-break-inside: avoid;
}
blockquote.citation p {
  margin: 0.5em 0;
  text-indent: 0;
  text-align: justify;
  text-justify: inter-ideograph;
  -webkit-text-align: justify;
  word-break: break-word;
}

/* Mechanical bookkeeping line */
p.mech {
  margin: 0.7em 0;
  font-family: "Courier New", monospace;
  font-size: 0.85em;
  line-height: 1.5;
  background: #f4f6f4;
  background: var(--bg-card, #f4f6f4);
  color: #2f3b2c;
  color: var(--card-text, #2f3b2c);
  border: 1px solid #d3d8d1;
  border-color: var(--border-card, #d3d8d1);
  border-radius: 4px;
  padding: 0.4em 0.7em;
  text-indent: 0;
  white-space: normal;
  word-break: break-word;
  break-inside: avoid;
  page-break-inside: avoid;
}

/* Structured single-check dice card */
div.dice-card {
  margin: 0.8em 0;
  padding: 0.5em 0.85em;
  background: #f4f6f4;
  background: var(--bg-card, #f4f6f4);
  border: 1px solid #d3d8d1;
  border-color: var(--border-card, #d3d8d1);
  border-radius: 4px;
  font-size: 0.9em;
  break-inside: avoid;
  page-break-inside: avoid;
}
div.dice-card p {
  margin: 0.15em 0;
  text-indent: 0;
  color: #2f3b2c;
  color: var(--card-text, #2f3b2c);
}
p.dice-who { font-weight: bold; }
p.dice-roll { font-family: "Courier New", monospace; }
p.dice-outcome {
  color: #7a501a;
  color: var(--dice-outcome, #7a501a);
  font-weight: bold;
}
p.dice-luck {
  color: #3d6a26;
  color: var(--dice-luck, #3d6a26);
}

/* Bilingual sign (场景招牌/地点标示) */
div.sign {
  margin: 1.6em auto;
  padding: 0.6em 1.2em;
  max-width: 85%;
  text-align: center !important;
  border-top: 1px solid #999;
  border-top-color: var(--border-rule, #999);
  border-bottom: 1px solid #999;
  border-bottom-color: var(--border-rule, #999);
  break-inside: avoid;
  page-break-inside: avoid;
}
div.sign p.sign-line {
  margin: 0.25em auto !important;
  text-align: center !important;
  text-indent: 0 !important;
  letter-spacing: 0.12em;
  color: #333;
  color: var(--sign-color, #333);
}
div.sign p.sign-en {
  margin: 0.25em auto !important;
  text-align: center !important;
  text-indent: 0 !important;
  font-family: "Courier New", monospace;
  text-transform: uppercase;
  font-size: 0.85em;
  color: #777;
  color: var(--note-color, #777);
  letter-spacing: 0.08em;
}

/* OOC note */
p.note {
  margin: 0.9em 0;
  font-style: italic;
  color: #666;
  color: var(--note-color, #666);
  font-size: 0.92em;
  text-indent: 0;
  break-inside: avoid;
  page-break-inside: avoid;
}

span.note-inline {
  font-size: 0.9em;
  color: #666;
  color: var(--note-color, #666);
}

/* Image block */
div.img-block {
  margin: 1.2em 0;
  text-align: center !important;
  break-inside: avoid;
  page-break-inside: avoid;
}
div.img-block img {
  max-width: 100%;
  height: auto;
  border: 1px solid #ccc;
  border-color: var(--border-card, #ccc);
  margin: 0.5em auto;
  display: block;
}

/* Investigator PC card */
div.pc-card {
  margin: 1.4em 0;
  padding: 0.8em 1.2em;
  border: 1px solid #999;
  border-color: var(--border-card, #999);
  border-left: 4px solid #6f8f6a;
  border-left-color: var(--border-dialogue, #6f8f6a);
  background: #f7f7f7;
  background: var(--bg-card, #f7f7f7);
  border-radius: 0 4px 4px 0;
  break-inside: avoid;
  page-break-inside: avoid;
}
p.pc-label {
  margin: 0 0 0.3em 0;
  font-weight: bold;
  letter-spacing: 0.15em;
  color: #2a5223;
  color: var(--speaker-color, #2a5223);
  text-indent: 0;
}
p.pc-desc {
  margin: 0.2em 0;
  text-indent: 0;
  color: inherit;
}
p.pc-talent {
  margin: 0.2em 0;
  color: #555;
  color: var(--note-color, #555);
  font-size: 0.95em;
  text-indent: 0;
}

em {
  font-style: italic;
  font-weight: bold;
}
`;

// cfg: { srcMd, epubOut, bookId, bookTitle, bookSubtitle, bookMeta, creator, editor, description, coverImage, authorAvatar, bilibiliUrl, disclaimer, images, imageDirs, appendices }
//   bookId:     fixed urn:uuid:... so readers treat every rebuild as the same book (keeps progress/notes)
//   appendices: extra md files whose chapters go after the main text, marked epub:type="appendix"
//   imageDirs:  [{ src, name }] -- every image file in `src` is packed as images/<name>/<file>
function buildEpub(cfg) {
  const REPO_DIR = path.resolve(__dirname, '..');
  const SRC = path.isAbsolute(cfg.srcMd) ? cfg.srcMd : path.join(REPO_DIR, cfg.srcMd);
  const EPUB_OUT = path.isAbsolute(cfg.epubOut) ? cfg.epubOut : path.join(REPO_DIR, cfg.epubOut);
  const OUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'coc-epub-'));
  const TEXT_DIR = path.join(OUT_DIR, 'OEBPS', 'text');
  const IMG_DIR = path.join(OUT_DIR, 'OEBPS', 'images');
  if (!cfg.bookId) throw new Error('cfg.bookId is required (a fixed urn:uuid:...)');
  const BOOK_UUID = cfg.bookId;

  const raw = fs.readFileSync(SRC, 'utf8').replace(/^﻿/, '');
  const chapters = parseIntermediateMarkdown(raw);
  for (const appMd of cfg.appendices || []) {
    const appSrc = path.isAbsolute(appMd) ? appMd : path.join(REPO_DIR, appMd);
    const appChapters = parseIntermediateMarkdown(fs.readFileSync(appSrc, 'utf8').replace(/^﻿/, ''));
    appChapters.forEach(c => { c.appendix = true; });
    chapters.push(...appChapters);
  }

  fs.mkdirSync(TEXT_DIR, { recursive: true });
  fs.mkdirSync(IMG_DIR, { recursive: true });

  const manifestItems = [];
  const spineItems = [];
  const navPoints = [];
  const MEDIA_TYPES = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
  };

  const XHTML_HEAD = (title) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-CN" xml:lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" type="text/css" href="../style.css" />
</head>
<body>
`;
  const XHTML_TAIL = `</body>\n</html>\n`;

  // 1. Cover image support
  let coverFileName = null;
  if (cfg.coverImage) {
    const coverSrc = path.isAbsolute(cfg.coverImage) ? cfg.coverImage : path.join(REPO_DIR, cfg.coverImage);
    const coverExt = path.extname(cfg.coverImage).toLowerCase();
    coverFileName = 'cover' + coverExt;
    fs.copyFileSync(coverSrc, path.join(IMG_DIR, coverFileName));
    manifestItems.push({
      id: 'cover-image',
      href: `images/${coverFileName}`,
      type: MEDIA_TYPES[coverExt] || 'image/png',
      properties: 'cover-image'
    });

    const coverHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-CN" xml:lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>封面</title>
<link rel="stylesheet" type="text/css" href="../style.css" />
</head>
<body class="cover-body">
<section epub:type="cover" class="cover-wrap">
  <img src="../images/${coverFileName}" alt="封面" class="cover-img" />
</section>
</body>
</html>
`;
    fs.writeFileSync(path.join(TEXT_DIR, 'cover.xhtml'), coverHtml, 'utf8');
    manifestItems.push({ id: 'cover-xhtml', href: 'text/cover.xhtml', type: 'application/xhtml+xml' });
    spineItems.push('cover-xhtml');
  }

  // 2. Title page (扉页)
  fs.writeFileSync(path.join(TEXT_DIR, 'title.xhtml'), XHTML_HEAD(cfg.bookTitle) + `
<section epub:type="titlepage" class="titlepage">
<div class="titleblock">
<h1 class="booktitle flexline">${splitFlexSpans(cfg.bookTitle, 'char')}</h1>
${cfg.bookTitleEn ? `<h2 class="booktitle-en flexline">${splitFlexSpans(cfg.bookTitleEn, 'char')}</h2>` : ''}
<p class="booksubtitle flexline">${splitFlexSpans(cfg.bookSubtitle || '', 'char')}</p>
${cfg.bookSeriesEn ? `<p class="bookseries-en flexline">${splitFlexSpans(cfg.bookSeriesEn, 'word')}</p>` : ''}
${cfg.bookMeta ? `<p class="bookmeta">${escapeHtml(cfg.bookMeta)}</p>` : ''}
</div>
</section>
` + XHTML_TAIL, 'utf8');
  manifestItems.push({ id: 'title', href: 'text/title.xhtml', type: 'application/xhtml+xml' });
  spineItems.push('title');

  // 3. Copyright page (出版版权信息页)
  const authorName = cfg.creator || '歌味觉死';
  const editorName = cfg.editor || 'r0k1s#i';
  const bilibiliUrl = cfg.bilibiliUrl || 'https://space.bilibili.com/374411';
  const pubDate = '2026年9月27日';

  const copyrightHtml = XHTML_HEAD('图书信息') + `
<section epub:type="colophon" class="colophon-page">
  <div class="colophon-box">
    <h2 class="colophon-title">图书出版信息 · Replay 整理本</h2>
    
    <div class="colophon-meta">
      <p class="colophon-item"><span class="colophon-label">书　　名：</span><span class="colophon-val">${escapeHtml(cfg.bookTitle)}</span></p>
      <p class="colophon-item"><span class="colophon-label">副　　标：</span><span class="colophon-val">${escapeHtml(cfg.bookSubtitle || '')}</span></p>
      <p class="colophon-item"><span class="colophon-label">作　　者：</span><span class="colophon-val">${escapeHtml(authorName)}</span></p>
      <p class="colophon-item"><span class="colophon-label">整　　理：</span><span class="colophon-val">${escapeHtml(editorName)}</span></p>
      <p class="colophon-item"><span class="colophon-label">整理日期：</span><span class="colophon-val">${pubDate}</span></p>
      <p class="colophon-item"><span class="colophon-label">作品形制：</span><span class="colophon-val">克苏鲁跑团（CoC）Replay 衍生录像文本校对整理本</span></p>
      <p class="colophon-item"><span class="colophon-label">原视频源：</span><span class="colophon-val"><a href="${escapeHtml(bilibiliUrl)}">${escapeHtml(bilibiliUrl)}</a></span></p>
    </div>

    <div class="colophon-divider"></div>

    <div class="colophon-notice">
      <p class="notice-title">【版权与整理说明】</p>
      <p>1. 本书为跑团 Replay 录像文本校对整理版，剧本内容与跑团演绎版权归原作者【${escapeHtml(authorName)}】及参团人员所有。</p>
      <p>2. 本电子书由【${escapeHtml(editorName)}】完成排版修护与 EPUB 标准封装，仅供跑团爱好者同好交流与阅读收藏，严禁任何形式的商业营利用途。</p>
      <p>3. 如需体验完整音画演出、原画立绘与氛围背景音乐，请前往哔哩哔哩支持并观看原作者发布的原版视频。</p>
    </div>
  </div>
</section>
` + XHTML_TAIL;
  fs.writeFileSync(path.join(TEXT_DIR, 'copyright.xhtml'), copyrightHtml, 'utf8');
  manifestItems.push({ id: 'copyright', href: 'text/copyright.xhtml', type: 'application/xhtml+xml' });
  spineItems.push('copyright');

  // 4. Author page (作者信息页)
  let authorAvatarName = null;
  if (cfg.authorAvatar) {
    const avatarSrc = path.isAbsolute(cfg.authorAvatar) ? cfg.authorAvatar : path.join(REPO_DIR, cfg.authorAvatar);
    const avatarExt = path.extname(cfg.authorAvatar).toLowerCase();
    authorAvatarName = 'author_avatar' + avatarExt;
    fs.copyFileSync(avatarSrc, path.join(IMG_DIR, authorAvatarName));
    manifestItems.push({
      id: 'author-avatar-img',
      href: `images/${authorAvatarName}`,
      type: MEDIA_TYPES[avatarExt] || 'image/jpeg'
    });
  }

  const authorHtml = XHTML_HEAD('作者信息') + `
<section class="author-page">
  <div class="author-card">
    ${authorAvatarName ? `
    <div class="author-avatar-wrap">
      <img src="../images/${authorAvatarName}" alt="${escapeHtml(authorName)} 头像" class="author-avatar" />
    </div>` : ''}
    <h2 class="author-name">${escapeHtml(authorName)}</h2>
    <p class="author-signature">“Teatro Grottesco”</p>
    
    <div class="author-links">
      <p class="author-link-row">
        <span class="author-link-label">B站主页：</span>
        <a href="https://space.bilibili.com/374411">https://space.bilibili.com/374411</a>
      </p>
    </div>
    
    <div class="author-bio">
      <p>Bilibili 知名 TRPG 跑团 Replay 创作者，代表作《路易斯安那系列》三部曲（《低电》《短见》《畅梦人》）。其跑团模组与 Replay 视频以极其硬核细腻的叙事结构、深厚的考据、独特的文学氛围与高超的镜头语言著称。</p>
    </div>
  </div>
</section>
` + XHTML_TAIL;
  fs.writeFileSync(path.join(TEXT_DIR, 'author.xhtml'), authorHtml, 'utf8');
  manifestItems.push({ id: 'author', href: 'text/author.xhtml', type: 'application/xhtml+xml' });
  spineItems.push('author');

  // 5. Notice / Disclaimer page (观前提示页，位于作者介绍页之后、正文之前)
  if (cfg.disclaimer) {
    const noticeHtml = XHTML_HEAD('观前提示') + `
<section epub:type="preface" class="notice-page">
  <div class="notice-box">
    <h2 class="notice-head">观前提示</h2>
    <div class="notice-content">
      <p>${escapeHtml(cfg.disclaimer)}</p>
    </div>
  </div>
</section>
` + XHTML_TAIL;
    fs.writeFileSync(path.join(TEXT_DIR, 'notice.xhtml'), noticeHtml, 'utf8');
    manifestItems.push({ id: 'notice', href: 'text/notice.xhtml', type: 'application/xhtml+xml' });
    spineItems.push('notice');
  }

  // 6. Chapters
  chapters.forEach((chap, idx) => {
    const fname = `ch${String(idx).padStart(2, '0')}.xhtml`;
    const isRules = chap.title === '规则序言';
    const body = isRules ? renderRulesPreface(chap.blocks)
      : chap.title === '制作人员' ? renderCredits(chap.blocks)
      : chap.blocks.map(renderBlock).join('\n');
    const html = XHTML_HEAD(chap.title) + `
<section epub:type="${chap.appendix ? 'appendix' : 'chapter'}">
<h1 class="chaptertitle" style="text-align: center; text-indent: 0;">${escapeHtml(chap.title)}</h1>
${body}
</section>
` + XHTML_TAIL;
    fs.writeFileSync(path.join(TEXT_DIR, fname), html, 'utf8');
    const id = `ch${idx}`;
    manifestItems.push({ id, href: `text/${fname}`, type: 'application/xhtml+xml' });
    spineItems.push(id);
    navPoints.push({ id, href: `text/${fname}`, title: chap.title, appendix: !!chap.appendix });
  });

  fs.writeFileSync(path.join(OUT_DIR, 'OEBPS', 'style.css'), CSS, 'utf8');

  // Additional images
  if (cfg.images && cfg.images.length) {
    cfg.images.forEach((img, i) => {
      const srcPath = path.isAbsolute(img.src) ? img.src : path.join(REPO_DIR, img.src);
      fs.copyFileSync(srcPath, path.join(IMG_DIR, img.name));
      const ext = path.extname(img.name).toLowerCase();
      manifestItems.push({ id: `img${i}`, href: `images/${img.name}`, type: MEDIA_TYPES[ext] || 'image/png' });
    });
  }
  (cfg.imageDirs || []).forEach((d, di) => {
    const srcDir = path.isAbsolute(d.src) ? d.src : path.join(REPO_DIR, d.src);
    fs.mkdirSync(path.join(IMG_DIR, d.name), { recursive: true });
    fs.readdirSync(srcDir).sort().forEach((f, i) => {
      const ext = path.extname(f).toLowerCase();
      if (!MEDIA_TYPES[ext]) return;
      fs.copyFileSync(path.join(srcDir, f), path.join(IMG_DIR, d.name, f));
      manifestItems.push({ id: `imgdir${di}-${i}`, href: `images/${d.name}/${f}`, type: MEDIA_TYPES[ext] });
    });
  });

  fs.mkdirSync(path.join(OUT_DIR, 'META-INF'), { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'META-INF', 'container.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`, 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'mimetype'), 'application/epub+zip', 'utf8');

  // nav.xhtml
  const navTocList = [];
  if (coverFileName) {
    navTocList.push('      <li><a href="text/cover.xhtml">封面</a></li>');
  }
  navTocList.push('      <li><a href="text/title.xhtml">扉页</a></li>');
  navTocList.push('      <li><a href="text/copyright.xhtml">版权信息</a></li>');
  navTocList.push('      <li><a href="text/author.xhtml">关于作者</a></li>');
  if (cfg.disclaimer) {
    navTocList.push('      <li><a href="text/notice.xhtml">观前提示</a></li>');
  }
  navPoints.forEach(np => {
    navTocList.push(`      <li><a href="${np.href}">${escapeHtml(np.title)}</a></li>`);
  });

  const landmarksList = [];
  if (coverFileName) {
    landmarksList.push('      <li><a epub:type="cover" href="text/cover.xhtml">封面</a></li>');
  }
  landmarksList.push('      <li><a epub:type="titlepage" href="text/title.xhtml">扉页</a></li>');
  landmarksList.push('      <li><a epub:type="toc" href="nav.xhtml">目录</a></li>');
  if (navPoints.length > 0) {
    landmarksList.push(`      <li><a epub:type="bodymatter" href="${navPoints[0].href}">正文</a></li>`);
  }
  const firstAppendix = navPoints.find(np => np.appendix);
  if (firstAppendix) {
    landmarksList.push(`      <li><a epub:type="appendix" href="${firstAppendix.href}">附录</a></li>`);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'OEBPS', 'nav.xhtml'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-CN" xml:lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>目录</title>
<link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目录</h1>
    <ol>
${navTocList.join('\n')}
    </ol>
  </nav>
  <nav epub:type="landmarks" hidden="">
    <h2>Landmarks</h2>
    <ol>
${landmarksList.join('\n')}
    </ol>
  </nav>
</body>
</html>
`, 'utf8');
  manifestItems.push({ id: 'nav', href: 'nav.xhtml', type: 'application/xhtml+xml', properties: 'nav' });

  // toc.ncx
  let playOrder = 1;
  const ncxEntries = [];
  if (coverFileName) {
    ncxEntries.push(`    <navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
      <navLabel><text>封面</text></navLabel>
      <content src="text/cover.xhtml"/>
    </navPoint>`);
    playOrder++;
  }
  ncxEntries.push(`    <navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
      <navLabel><text>扉页</text></navLabel>
      <content src="text/title.xhtml"/>
    </navPoint>`);
  playOrder++;

  ncxEntries.push(`    <navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
      <navLabel><text>版权信息</text></navLabel>
      <content src="text/copyright.xhtml"/>
    </navPoint>`);
  playOrder++;

  ncxEntries.push(`    <navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
      <navLabel><text>关于作者</text></navLabel>
      <content src="text/author.xhtml"/>
    </navPoint>`);
  playOrder++;

  if (cfg.disclaimer) {
    ncxEntries.push(`    <navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
      <navLabel><text>观前提示</text></navLabel>
      <content src="text/notice.xhtml"/>
    </navPoint>`);
    playOrder++;
  }

  navPoints.forEach((np) => {
    ncxEntries.push(`    <navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
      <navLabel><text>${escapeHtml(np.title)}</text></navLabel>
      <content src="${np.href}"/>
    </navPoint>`);
    playOrder++;
  });

  fs.writeFileSync(path.join(OUT_DIR, 'OEBPS', 'toc.ncx'), `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${BOOK_UUID}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageDepth" content="0"/>
  </head>
  <docTitle><text>${escapeHtml(cfg.bookTitle)}</text></docTitle>
  <navMap>
${ncxEntries.join('\n')}
  </navMap>
</ncx>
`, 'utf8');
  manifestItems.push({ id: 'ncx', href: 'toc.ncx', type: 'application/x-dtbncx+xml' });
  manifestItems.push({ id: 'css', href: 'style.css', type: 'text/css' });

  // content.opf
  const manifestXml = manifestItems.map(it => {
    const props = it.properties ? ` properties="${it.properties}"` : '';
    return `    <item id="${it.id}" href="${it.href}" media-type="${it.type}"${props}/>`;
  }).join('\n');
  const spineXml = spineItems.map(id => `    <itemref idref="${id}"/>`).join('\n');

  fs.writeFileSync(path.join(OUT_DIR, 'OEBPS', 'content.opf'), `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId" xml:lang="zh-CN">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${BOOK_UUID}</dc:identifier>
    <dc:title>${escapeHtml(cfg.bookTitle)}</dc:title>
    <dc:language>zh-CN</dc:language>
    <dc:creator>${escapeHtml(authorName)}</dc:creator>
    <dc:contributor>${escapeHtml(editorName)}</dc:contributor>
    <dc:description>${escapeHtml(cfg.description || `克苏鲁跑团 Replay《${cfg.bookTitle}》${cfg.bookSubtitle || ''}，全${chapters.length}集。`)}</dc:description>
    <dc:date>2026-09-27</dc:date>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
    ${coverFileName ? '<meta name="cover" content="cover-image"/>' : ''}
  </metadata>
  <manifest>
${manifestXml}
  </manifest>
  <spine toc="ncx">
${spineXml}
  </spine>
</package>
`, 'utf8');

  console.error('Build complete.');

  if (fs.existsSync(EPUB_OUT)) fs.rmSync(EPUB_OUT);
  execFileSync('zip', ['-X0', EPUB_OUT, 'mimetype'], { cwd: OUT_DIR });
  execFileSync('zip', ['-Xr9g', EPUB_OUT, 'META-INF', 'OEBPS'], { cwd: OUT_DIR });
  fs.rmSync(OUT_DIR, { recursive: true });
  console.error('Wrote', EPUB_OUT);
}

module.exports = { buildEpub };
