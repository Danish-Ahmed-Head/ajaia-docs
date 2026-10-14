import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { markdownToHtml, textToHtml, fileToHtml } from '../server/convert.js';

test('textToHtml: paragraphs on blank lines, line breaks kept, HTML escaped', () => {
  assert.equal(textToHtml('a\nb\r\n\r\n<c> & d\n\n\n'), '<p>a<br>b</p>\n<p>&lt;c&gt; &amp; d</p>');
  assert.equal(textToHtml(''), '');
});

test('markdownToHtml: headings, emphasis, lists, paragraphs, escaping', () => {
  assert.equal(markdownToHtml('# A\n## B\n### C'), '<h1>A</h1>\n<h2>B</h2>\n<h3>C</h3>');
  assert.equal(markdownToHtml('**bold** and *it*'), '<p><strong>bold</strong> and <em>it</em></p>');
  assert.equal(markdownToHtml('1. one\n2) two\n- a\n* b'), '<ol>\n<li>one</li>\n<li>two</li>\n</ol>\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>');
  assert.equal(markdownToHtml('line one\nline two'), '<p>line one<br>line two</p>');
  assert.equal(markdownToHtml('<script>x</script>'), '<p>&lt;script&gt;x&lt;/script&gt;</p>');
  assert.equal(markdownToHtml('#### too deep'), '<p>#### too deep</p>');
});

test('fileToHtml: .docx converted with headings and bold kept', async () => {
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ text: 'Report', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun({ text: 'Key', bold: true }), new TextRun(' point')] }),
  ] }] });
  const html = await fileToHtml('report.DOCX', await Packer.toBuffer(doc));
  assert.equal(html, '<h1>Report</h1><p><strong>Key</strong> point</p>');
});

test('fileToHtml: unsupported or extension-less files are rejected with 415', async () => {
  for (const name of ['a.pdf', 'noext', 'x.docx.exe']) {
    await assert.rejects(fileToHtml(name, Buffer.from('x')), (e) => e.status === 415);
  }
});

test('fileToHtml: a corrupt .docx fails cleanly instead of crashing', async () => {
  await assert.rejects(fileToHtml('broken.docx', Buffer.from('not a zip')), (e) => e.status === 422);
});
