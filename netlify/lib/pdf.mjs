/**
 * Builds the PDF an ISM shares with a district leader. Plain on purpose: black text in a standard PDF font, the
 * photos, and a line saying who shared it. A designed, branded version belongs to the brand system (see README).
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const W = 612, H = 792, M = 54; // US Letter, 0.75in margins
const BLACK = rgb(0, 0, 0), GREY = rgb(0.35, 0.35, 0.35), BOX = rgb(0.92, 0.93, 0.96);

/** The standard PDF fonts cover Western European text only; anything else becomes "?" so a stray character can't stop the PDF. */
const clean = (s) => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
  .replace(/[^\x20-\x7E\xA1-\xFF\n]/g, '?');

function wrap(text, font, size, width) {
  const lines = [];
  for (const para of clean(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next; else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

async function fetchImage(doc, url, origin) {
  try {
    const res = await fetch(new URL(url, origin));
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > 3_000_000) return null;
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await doc.embedJpg(bytes);
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await doc.embedPng(bytes);
    return null; // HEIC, WebP and the rest can't go in a PDF this way
  } catch { return null; }
}

/**
 * `works` are toWork() records. `opts.title` heads the first page; `opts.sharedBy` is the ISM's name.
 * One piece gets every photo (up to six); a district PDF gets the first photo of each piece.
 */
export async function buildPdf(works, { title, subtitle, sharedBy, origin, photosPerPiece = 1 }) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(clean(title)); doc.setAuthor('inquirED'); doc.setCreator('Inquiry Work Gallery');
  const footer = clean(`Shared by ${sharedBy}, inquirED, on ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'long' }).format(new Date())}. Student work shared with the teacher's permission.`);

  let page, y;
  const newPage = () => {
    page = doc.addPage([W, H]); y = H - M;
    page.drawText(footer, { x: M, y: M - 24, size: 8, font: regular, color: GREY });
  };
  const room = (h) => { if (y - h < M) newPage(); };
  const write = (text, { font = regular, size = 11, gap = 4, color = BLACK } = {}) => {
    for (const line of wrap(text, font, size, W - 2 * M)) { room(size + gap); y -= size; page.drawText(line, { x: M, y, size, font, color }); y -= gap; }
  };

  newPage();
  write(title, { font: bold, size: 22, gap: 8 });
  if (subtitle) write(subtitle, { size: 11, color: GREY });
  y -= 14;

  for (const w of works) {
    const single = works.length === 1 && clean(w.title) === clean(title);
    room(w.photos.length && photosPerPiece === 1 ? 340 : 140); // keep a piece's heading with its photo
    if (!single) write(w.title, { font: bold, size: 15, gap: 6 });
    write([w.grades.join(', '), w.school && w.school !== w.district ? w.school : '', w.district].filter(Boolean).join(' | '), { size: 10, color: GREY });
    y -= 6;
    const photos = w.photos.slice(0, photosPerPiece);
    for (const p of photos) {
      const img = await fetchImage(doc, photosPerPiece > 1 ? p.large : p.thumb, origin) ?? (photosPerPiece > 1 ? await fetchImage(doc, p.thumb, origin) : null);
      if (!img) continue;
      const maxW = W - 2 * M, maxH = photosPerPiece > 1 ? 380 : 250;
      const k = Math.min(maxW / img.width, maxH / img.height, 1.5);
      const iw = img.width * k, ih = img.height * k;
      room(ih + 10); y -= ih;
      page.drawImage(img, { x: M, y, width: iw, height: ih }); y -= 10;
    }
    if (!photos.length) { room(70); y -= 60; page.drawRectangle({ x: M, y, width: 160, height: 60, color: BOX }); page.drawText('No photo', { x: M + 12, y: y + 26, size: 9, font: regular, color: GREY }); y -= 10; }
    if (w.challenge) { write('Inquiry Challenge', { font: bold, size: 10 }); write(w.challenge, { size: 10 }); y -= 4; }
    if (w.description) { write('What the teacher said', { font: bold, size: 10 }); write(w.description, { size: 10 }); }
    y -= 18;
  }
  if (!works.length) write('There is no work to share from this district yet.', { size: 11 });
  return doc.save();
}
