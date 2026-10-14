import mammoth from 'mammoth';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>');
}

/** Minimal Markdown subset: #-headings, **bold**, *italic*, - / 1. lists, paragraphs. */
export function markdownToHtml(md) {
  const out = [];
  let list = null; // 'ul' | 'ol'
  let para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${para.join('<br>')}</p>`); para = []; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    let m;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) {
      flushPara(); closeList();
      out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
    } else if ((m = /^\s*[-*+]\s+(.*)$/.exec(line))) {
      flushPara();
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
      flushPara();
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if (line.trim() === '') {
      flushPara(); closeList();
    } else {
      closeList(); para.push(inline(line.trim()));
    }
  }
  flushPara(); closeList();
  return out.join('\n');
}

export function textToHtml(txt) {
  return txt.replace(/\r\n/g, '\n').split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n');
}

export const SUPPORTED = ['.txt', '.md', '.docx'];

export async function fileToHtml(filename, buffer) {
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : '';
  if (ext === '.txt') return textToHtml(buffer.toString('utf8'));
  if (ext === '.md') return markdownToHtml(buffer.toString('utf8'));
  if (ext === '.docx') return (await mammoth.convertToHtml({ buffer })).value;
  const err = new Error(`Unsupported file type "${ext || filename}". Supported: ${SUPPORTED.join(', ')}`);
  err.status = 415;
  throw err;
}
