import { localMs } from './time.js';

const KNOWN = ['START DATE(UTC)', 'END DATE(UTC)', 'START TIME(LOCAL)', 'END TIME(LOCAL)', 'DURATION', 'NAME', 'LOCATION', 'NOTE'];
const REQUIRED = ['START TIME(LOCAL)', 'END TIME(LOCAL)', 'NAME'];

// Minimal CSV reader: commas, double-quoted fields, doubled quotes. Returns rows with their line numbers.
function readRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const endRow = () => {
    row.push(field);
    field = '';
    if (row.some((c) => c.trim() !== '')) rows.push({ line: rowLine, cells: row });
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else { if (c === '\n') line++; field += c; }
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { endRow(); line++; rowLine = line; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) endRow();
  return rows;
}

export function parseLifeCycleCsv(text) {
  const rows = readRows(text.replace(/^﻿/, ''));
  if (rows.length === 0) throw new Error('The Life Cycle file is empty.');
  const header = rows[0].cells.map((c) => c.trim());
  const unknown = header.filter((h) => !KNOWN.includes(h));
  if (unknown.length) throw new Error(`Unknown column in the Life Cycle file: ${unknown.join(', ')}`);
  const missing = REQUIRED.filter((h) => !header.includes(h));
  if (missing.length) throw new Error(`Missing column in the Life Cycle file: ${missing.join(', ')}`);
  const at = (name) => header.indexOf(name);

  const blocks = [];
  for (const { line, cells } of rows.slice(1)) {
    const start = localMs(cells[at('START TIME(LOCAL)')] ?? '');
    const end = localMs(cells[at('END TIME(LOCAL)')] ?? '');
    const name = (cells[at('NAME')] ?? '').trim();
    if (Number.isNaN(start) || Number.isNaN(end) || !name) {
      throw new Error(`Unreadable row at line ${line} of the Life Cycle file.`);
    }
    blocks.push({ start, end, name, location: (cells[at('LOCATION')] ?? '').trim() });
  }
  return blocks;
}

// A block is identified by its start and name.
export const blockKey = (b) => `${b.start}|${b.name}`;

// Merge a newer export into what is already stored. A block is identified by
// its start and name; the newer export wins, because an open block (such as
// Home at export time) keeps growing between exports.
export function mergeBlocks(existing, incoming) {
  const map = new Map(existing.map((b) => [blockKey(b), b]));
  for (const b of incoming) map.set(blockKey(b), b);
  return [...map.values()].sort((a, b) => a.start - b.start || a.end - b.end);
}
