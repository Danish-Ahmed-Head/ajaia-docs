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
const MAX_DOCX_EXPANDED = 20 * 1024 * 1024;

/**
 * Sum of the uncompressed sizes declared in a .docx (zip) central directory, read without inflating anything.
 * A 2 MB upload can otherwise expand to gigabytes inside mammoth (a "zip bomb") and exhaust memory.
 * Returns Infinity for ZIP64 entries or a malformed directory, so those are treated as too large.
 */
export function zipExpandedSize(buf) {
  const EOCD = 0x06054b50, CEN = 0x02014b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) return null; // not a zip: let mammoth reject it with its own error
  const entries = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN) return Infinity;
    const size = buf.readUInt32LE(p + 24);
    if (size === 0xffffffff) return Infinity; // ZIP64: real size is elsewhere; no legitimate small .docx needs it
    total += size;
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return total;
}

export async function fileToHtml(filename, buffer) {
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : '';
  if (ext === '.txt') return textToHtml(buffer.toString('utf8'));
  if (ext === '.md') return markdownToHtml(buffer.toString('utf8'));
  if (ext === '.docx') {
    if (zipExpandedSize(buffer) > MAX_DOCX_EXPANDED) {
      throw Object.assign(new Error('This .docx expands to more than 20 MB of content, which is too large to import'), { status: 413 });
    }
    try {
      return (await mammoth.convertToHtml({ buffer })).value;
    } catch {
      throw Object.assign(new Error('Could not read this .docx file. Is it a valid Word document?'), { status: 422 });
    }
  }
  const err = new Error(`Unsupported file type "${ext || filename}". Supported: ${SUPPORTED.join(', ')}`);
  err.status = 415;
  throw err;
}
