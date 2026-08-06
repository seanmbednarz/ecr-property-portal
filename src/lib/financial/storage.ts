// Persistence for the Financial Analysis tab.
//
// Phase 2: the database is the source of truth, so a saved analysis follows
// the client to their own login instead of living in one browser.
//
// The browser copy is kept as a safety net, not as the store:
//   - it lets an in-progress analysis survive a refresh before it's saved
//   - it carries forward anything saved during Phase 1, so nothing is lost
// On load we prefer the database; we only fall back to the browser copy when
// the database has nothing for that client.
//
// The uploaded workbook is fetched separately (see loadWorkbook) because it's
// far larger than the analysis itself and is only needed on download.

import { supabase } from '../supabase';
import { Deal } from './types';
import { DisplaySettings, mergeDisplay } from './metrics';

const TABLE = 'financial_analyses';
const PREFIX = 'ecr.financial.v1';
const keyFor = (clientId: string) => `${PREFIX}.${clientId}`;

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
  /** Which stage index feeds the comparison, per `${dealId}::${optionIndex}`. */
  selectedStage: Record<string, number>;
  display: DisplaySettings;
  /** Client's cost of capital, as a decimal — drives the NPV metric. */
  npvRate: number;
  /** Broker's written notes shown beneath the comparison. */
  keyDifferences: string;
  workbook: StoredWorkbook | null;
  savedAt: string;
}

/**
 * The JSON document stored in `financial_analyses.data`. `savedAt` is left out
 * on purpose — the row's own `updated_at` is the authoritative timestamp.
 */
type AnalysisDoc = Omit<Analysis, 'workbook' | 'clientId' | 'savedAt'> & {
  workbookName?: string | null;
  workbookUploadedAt?: string | null;
};

export interface LoadResult {
  analysis: Analysis | null;
  /** True when this came from the browser and has never been saved. */
  fromLocalOnly: boolean;
  error: string | null;
}

function normalize(clientId: string, doc: Partial<AnalysisDoc>, savedAt: string): Analysis {
  return {
    clientId,
    clientName: doc.clientName ?? '',
    deals: doc.deals ?? [],
    selectedStage: doc.selectedStage ?? {},
    display: mergeDisplay(doc.display),
    npvRate: typeof doc.npvRate === 'number' ? doc.npvRate : 0.08,
    keyDifferences: doc.keyDifferences ?? '',
    // Presence only — the bytes are fetched on demand by loadWorkbook().
    workbook: doc.workbookName
      ? { name: doc.workbookName, uploadedAt: doc.workbookUploadedAt ?? savedAt, base64: '' }
      : null,
    savedAt,
  };
}

function readLocal(clientId: string): Analysis | null {
  try {
    const raw = localStorage.getItem(keyFor(clientId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Analysis;
    return { ...parsed, display: mergeDisplay(parsed.display) };
  } catch {
    return null; // corrupt or unreadable — behave as if nothing was cached
  }
}

function writeLocal(a: Analysis) {
  try {
    localStorage.setItem(keyFor(a.clientId), JSON.stringify(a));
  } catch {
    // Browser storage is capped; the database already has the real copy.
  }
}

export async function loadAnalysis(clientId: string | null): Promise<LoadResult> {
  if (!clientId) return { analysis: null, fromLocalOnly: false, error: null };

  const { data, error } = await supabase
    .from(TABLE)
    .select('data, updated_at')
    .eq('client_id', clientId)
    .maybeSingle();

  if (error) {
    // Don't strand the user on a network blip — show the browser copy and say so.
    const local = readLocal(clientId);
    return {
      analysis: local,
      fromLocalOnly: !!local,
      error: `Couldn't reach the database (${error.message}).${local ? ' Showing the copy saved in this browser.' : ''}`,
    };
  }

  if (data) {
    return {
      analysis: normalize(clientId, (data.data ?? {}) as Partial<AnalysisDoc>, data.updated_at),
      fromLocalOnly: false,
      error: null,
    };
  }

  // Nothing saved yet. Anything in this browser is Phase-1 work or an
  // in-progress upload — offer it, flagged as unsaved.
  const local = readLocal(clientId);
  return { analysis: local, fromLocalOnly: !!local, error: null };
}

export async function saveAnalysis(a: Analysis): Promise<{ ok: boolean; error?: string }> {
  const doc: AnalysisDoc = {
    clientName: a.clientName,
    deals: a.deals,
    selectedStage: a.selectedStage,
    display: a.display,
    npvRate: a.npvRate,
    keyDifferences: a.keyDifferences,
    workbookName: a.workbook?.name ?? null,
    workbookUploadedAt: a.workbook?.uploadedAt ?? null,
  };

  const row: Record<string, unknown> = { client_id: a.clientId, data: doc };
  // Only rewrite the workbook when we actually hold its bytes, so re-saving
  // after a page load doesn't wipe a previously uploaded file.
  if (a.workbook?.base64) {
    row.workbook_name = a.workbook.name;
    row.workbook_base64 = a.workbook.base64;
  }

  const { error } = await supabase.from(TABLE).upsert(row, { onConflict: 'client_id' });

  // Keep a local copy either way: it's the fallback if the database is
  // unreachable next time.
  writeLocal({ ...a, savedAt: new Date().toISOString() });

  if (error) {
    return {
      ok: false,
      error: /row-level security|permission/i.test(error.message)
        ? "You don't have permission to save for this client. Saved in this browser only."
        : `Couldn't save to the database (${error.message}). Saved in this browser only.`,
    };
  }
  return { ok: true };
}

/** Fetches the stored workbook bytes — only called when someone downloads. */
export async function loadWorkbook(clientId: string): Promise<StoredWorkbook | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('workbook_name, workbook_base64, updated_at')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error || !data?.workbook_base64) return null;
  return {
    name: data.workbook_name ?? 'deal-analysis.xlsx',
    uploadedAt: data.updated_at,
    base64: data.workbook_base64,
  };
}

export async function clearAnalysis(clientId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from(TABLE).delete().eq('client_id', clientId);
  try { localStorage.removeItem(keyFor(clientId)); } catch { /* nothing cached */ }
  return error ? { ok: false, error: error.message } : { ok: true };
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
