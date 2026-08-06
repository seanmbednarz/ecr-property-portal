// Phase 1 persistence: the browser's own storage, scoped per client.
//
// Deliberately NOT the database. Everything saved here lives on this computer
// and in this browser only — it is not shared with clients or teammates. The
// read/write surface below is intentionally narrow so Phase 2 can swap the
// body of these four functions for Supabase without touching the UI.

import { Deal } from './types';
import { DisplaySettings, mergeDisplay } from './metrics';

const PREFIX = 'ecr.financial.v1';
const keyFor = (clientId: string | null) => `${PREFIX}.${clientId ?? 'all'}`;

export interface StoredWorkbook {
  name: string;
  uploadedAt: string;
  /** The original .xlsx, base64-encoded, so it can be downloaded again. */
  base64: string;
}

export interface Analysis {
  /** Always a real client — analyses are never saved unassigned. */
  clientId: string;
  clientName: string;
  deals: Deal[];
  /** Which stage index feeds the comparison, per deal id. */
  selectedStage: Record<string, number>;
  display: DisplaySettings;
  /** Client's cost of capital, as a decimal — drives the NPV metric. */
  npvRate: number;
  /** Broker's written notes shown beneath the comparison. */
  keyDifferences: string;
  workbook: StoredWorkbook | null;
  savedAt: string;
}

export function loadAnalysis(clientId: string | null): Analysis | null {
  if (!clientId) return null; // analyses always belong to a specific client
  try {
    const raw = localStorage.getItem(keyFor(clientId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Analysis;
    return {
      ...parsed,
      display: mergeDisplay(parsed.display),
      npvRate: typeof parsed.npvRate === 'number' ? parsed.npvRate : 0.08,
    };
  } catch {
    return null; // corrupt or unreadable — behave as if nothing was saved
  }
}

export function saveAnalysis(a: Analysis): { ok: true } | { ok: false; error: string } {
  try {
    localStorage.setItem(keyFor(a.clientId), JSON.stringify({ ...a, savedAt: new Date().toISOString() }));
    return { ok: true };
  } catch (e: any) {
    // Browser storage is capped (~5MB). The workbook copy is the bulky part,
    // so retry without it rather than losing the analysis entirely.
    try {
      localStorage.setItem(keyFor(a.clientId), JSON.stringify({ ...a, workbook: null, savedAt: new Date().toISOString() }));
      return { ok: false, error: 'Saved, but the spreadsheet copy was too large to keep for re-download.' };
    } catch {
      return { ok: false, error: `Couldn't save: ${e?.name === 'QuotaExceededError' ? 'browser storage is full.' : e?.message ?? 'unknown error'}` };
    }
  }
}

export function clearAnalysis(clientId: string | null) {
  try { localStorage.removeItem(keyFor(clientId)); } catch { /* nothing to clear */ }
}

/** Client ids that currently have a saved analysis, for "saved for" hints. */
export function savedClientIds(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(`${PREFIX}.`)) out.push(k.slice(PREFIX.length + 1));
    }
  } catch { /* storage unavailable */ }
  return out;
}

// --- file helpers ----------------------------------------------------------

export async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000; // avoid blowing the argument limit on large files
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function downloadWorkbook(wb: StoredWorkbook) {
  const bytes = Uint8Array.from(atob(wb.base64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = wb.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
