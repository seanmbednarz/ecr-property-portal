import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  Upload, BarChart3, AlertTriangle, X, Pencil, Save, Settings2, Printer, Download, ChevronRight,
} from 'lucide-react';
import { Client } from '../types';
import { Deal, TermOption, optionKey, optionTitle } from '../lib/financial/types';
import { parseWorkbook } from '../lib/financial/parseWorkbook';
import { computeStage, latestStage, savingsVsOpening, StageMetrics } from '../lib/financial/calc';
import {
  METRICS, GROUP_LABELS, DisplaySettings, MetricDef, defaultDisplay, labelOf, DEFAULT_NPV_RATE,
} from '../lib/financial/metrics';
import {
  Analysis, StoredWorkbook, loadAnalysis, saveAnalysis, loadWorkbook,
  fileToBase64, downloadWorkbook,
} from '../lib/financial/storage';
import FinancialSettings from './financial/FinancialSettings';
import FinancialDealPage from './financial/FinancialDealPage';
import FinancialExport from './financial/FinancialExport';
import {
  TotalRentChart, TiAllowanceChart, MonthlyRentChart, NegotiationChart, CumulativeChart, ConcessionsChart,
} from './financial/FinancialCharts';

interface FinancialAnalysisProps {
  clientId: string | null;
  clientName: string;
  clients: Client[];
  canManage: boolean;
}

export default function FinancialAnalysis({ clientId, clientName, clients, canManage }: FinancialAnalysisProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedStage, setSelectedStage] = useState<Record<string, number>>({});
  const [display, setDisplay] = useState<DisplaySettings>(defaultDisplay);
  const [npvRate, setNpvRate] = useState(DEFAULT_NPV_RATE);
  const [keyDifferences, setKeyDifferences] = useState('');
  const [workbook, setWorkbook] = useState<StoredWorkbook | null>(null);

  // An analysis always belongs to one client — never "all clients".
  const [saveTarget, setSaveTarget] = useState<string | null>(clientId);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [openDealId, setOpenDealId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [editingDiff, setEditingDiff] = useState(false);
  const [printing, setPrinting] = useState(false);

  // Load whatever was saved for the client being viewed.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setWarnings([]); setError(null); setNotice(null);
    setOpenDealId(null);
    setSaveTarget(clientId);

    (async () => {
      const res = await loadAnalysis(clientId);
      if (cancelled) return;   // client switched while the request was in flight
      const a = res.analysis;
      setDeals(a?.deals ?? []);
      setSelectedStage(a?.selectedStage ?? {});
      setDisplay(a?.display ?? defaultDisplay());
      setNpvRate(a?.npvRate ?? DEFAULT_NPV_RATE);
      setKeyDifferences(a?.keyDifferences ?? '');
      setWorkbook(a?.workbook ?? null);
      setSavedAt(res.fromLocalOnly ? null : (a?.savedAt ?? null));
      // Work that only exists in this browser is unsaved by definition.
      setDirty(res.fromLocalOnly);
      if (res.error) setError(res.error);
      else if (res.fromLocalOnly) {
        setNotice('This analysis is only saved in this browser. Press Save to publish it to the client.');
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [clientId]);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await parseWorkbook(file);
      setDeals(res.deals);                 // a re-upload replaces what's loaded
      setWarnings(res.warnings);
      // Default every term option to its most recent stage.
      const sel: Record<string, number> = {};
      res.deals.forEach(d => d.options.forEach(o => {
        const s = latestStage(o);
        if (s) sel[optionKey(d.id, o.index)] = s.index;
      }));
      setSelectedStage(sel);
      setWorkbook({ name: file.name, uploadedAt: new Date().toISOString(), base64: await fileToBase64(file) });
      setDirty(true);
      setOpenDealId(null);
    } catch (err: any) {
      setError(`Couldn't read that workbook: ${err?.message ?? 'unexpected format'}.`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    const target = clients.find(c => c.id === saveTarget);
    if (!target) {
      setError('Choose which client this analysis belongs to before saving.');
      return;
    }
    const analysis: Analysis = {
      clientId: target.id,
      clientName: target.company || target.name,
      deals, selectedStage, display, npvRate, keyDifferences, workbook,
      savedAt: new Date().toISOString(),
    };
    setSaving(true);
    const res = await saveAnalysis(analysis);
    setSaving(false);
    if (res.ok) {
      setDirty(false);
      setSavedAt(analysis.savedAt);
      setError(null);
      setNotice(`Saved for ${analysis.clientName} — they'll see this when they sign in.`);
    } else {
      // Still unsaved as far as the client is concerned, so keep it flagged.
      setDirty(true);
      setNotice(null);
      setError(res.error ?? 'Save failed.');
    }
  }

  /**
   * The workbook's bytes aren't loaded with the analysis (they're large), so
   * fetch them on demand the first time someone downloads.
   */
  async function handleDownloadWorkbook() {
    if (!workbook) return;
    if (workbook.base64) { downloadWorkbook(workbook); return; }
    if (!clientId) return;
    setBusy(true);
    const wb = await loadWorkbook(clientId);
    setBusy(false);
    if (!wb) { setError("Couldn't fetch the saved spreadsheet."); return; }
    setWorkbook(wb);           // cache it for repeat downloads
    downloadWorkbook(wb);
  }

  // One comparison column per TERM OPTION — a deal quoting a 5-year and a
  // 3-year produces two columns side by side.
  const rows = useMemo(() => {
    const out: CompRow[] = [];
    for (const deal of deals) {
      const multi = deal.options.length > 1;
      for (const option of deal.options) {
        const key = optionKey(deal.id, option.index);
        const stage = option.stages.find(s => s.index === selectedStage[key]) ?? latestStage(option);
        if (!stage) continue;
        const m = computeStage(deal, stage, npvRate);
        out.push({
          key, title: optionTitle(deal, option, multi),
          deal, option, m,
          savings: savingsVsOpening(deal, option, m, npvRate),
        });
      }
    }
    return out;
  }, [deals, selectedStage, npvRate]);

  const openDeal = openDealId ? deals.find(d => d.id === openDealId) ?? null : null;

  if (openDeal) {
    return (
      <FinancialDealPage
        deal={openDeal}
        selectedStage={selectedStage}
        canManage={canManage}
        onBack={() => setOpenDealId(null)}
        onSelectStage={(optIdx, stageIdx) => {
          setSelectedStage(prev => ({ ...prev, [optionKey(openDeal.id, optIdx)]: stageIdx }));
          setDirty(true);
        }}
      />
    );
  }

  const groups: MetricDef['group'][] = ['financial', 'parking', 'nonfinancial'];
  const chartsOn = display.sections.charts !== false;

  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: '#f0ede8' }}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#889893' }}>Financial Analysis</p>
            <h1 className="text-2xl font-extrabold uppercase leading-tight" style={{ color: '#37423f' }}>
              Deal Comparison{clientName ? ` — ${clientName}` : ''}
            </h1>
            <p className="text-sm mt-1" style={{ color: '#6f7b76' }}>
              {rows.length > 0
                ? `${rows.length} deal${rows.length === 1 ? '' : 's'}${savedAt ? ` · saved ${new Date(savedAt).toLocaleString()}` : ''}`
                : 'Upload a completed ECR Deal Analysis workbook to compare proposals side by side.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {rows.length > 0 && (
              <button onClick={() => setPrinting(true)} className={ghostBtn}
                style={ghostStyle} title="Export a branded PDF of this comparison">
                <Printer className="w-3.5 h-3.5" /> Export PDF
              </button>
            )}
            {workbook && (
              <button onClick={handleDownloadWorkbook} disabled={busy} className={ghostBtn} style={ghostStyle}
                title={`Download ${workbook.name}`}>
                <Download className="w-3.5 h-3.5" /> {busy ? 'Fetching…' : 'Spreadsheet'}
              </button>
            )}
            {canManage && (
              <>
                <button onClick={() => setShowSettings(true)} className={ghostBtn} style={ghostStyle}>
                  <Settings2 className="w-3.5 h-3.5" /> Customize
                </button>
                <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
                <button onClick={() => fileRef.current?.click()} disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors disabled:opacity-50"
                  style={{ backgroundColor: '#d41f27', color: 'white' }}>
                  <Upload className="w-3.5 h-3.5" /> {busy ? 'Reading…' : deals.length ? 'Re-upload' : 'Upload template'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Save bar — which client this analysis belongs to */}
        {canManage && deals.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap px-4 py-3 mb-4 rounded-xl"
            style={{ backgroundColor: 'white', border: '1px solid #dedad3' }}>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#889893' }}>Save to client</span>
            <select value={saveTarget ?? ''} onChange={e => { setSaveTarget(e.target.value || null); setDirty(true); }}
              className="text-sm rounded-lg px-2 py-1.5"
              style={{
                border: `1px solid ${saveTarget ? '#dedad3' : '#d41f27'}`,
                color: saveTarget ? '#1e2624' : '#d41f27',
                backgroundColor: 'white',
              }}>
              <option value="">Select a client…</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.company || c.name}</option>
              ))}
            </select>
            {dirty && <span className="text-xs" style={{ color: '#d41f27' }}>Unsaved changes</span>}
            <div className="flex-1" />
            <button onClick={handleSave} disabled={!dirty || !saveTarget || saving}
              title={saveTarget ? 'Save so the client can see this' : 'Choose a client first'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors disabled:opacity-40"
              style={{ backgroundColor: '#37423f', color: 'white' }}>
              <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}

        {error && <Banner tone="error" onDismiss={() => setError(null)}>{error}</Banner>}
        {notice && <Banner tone="info" onDismiss={() => setNotice(null)}>{notice}</Banner>}
        {warnings.map((w, i) => <Banner key={i} tone="warn">{w}</Banner>)}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-5 h-5 border-2 rounded-full animate-spin"
              style={{ borderColor: '#dedad3', borderTopColor: '#d41f27' }} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState canManage={canManage} />
        ) : (
          <>
            {/* Comparison table */}
            <div className="rounded-2xl overflow-hidden mb-5" style={{ backgroundColor: 'white', border: '1px solid #dedad3' }}>
              <div className="overflow-x-auto">
                <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-widest sticky left-0 z-10"
                        style={{ color: 'white', backgroundColor: '#2a3330', minWidth: 240 }}>Metric</th>
                      {rows.map(({ key, title, deal, option, m }) => (
                        <th key={key} className="px-4 py-3 text-center align-top"
                          style={{ color: 'white', backgroundColor: '#2a3330', minWidth: 190 }}>
                          <button onClick={() => setOpenDealId(deal.id)}
                            className="text-sm font-extrabold uppercase leading-tight hover:underline inline-flex items-center gap-1">
                            {title} <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                          </button>
                          <div className="text-xs font-normal normal-case mt-0.5" style={{ color: '#b5c5c1' }}>
                            {deal.building || deal.address || '—'}
                          </div>
                          {canManage && option.stages.length > 1 ? (
                            <select
                              value={m.stage.index}
                              onChange={e => {
                                setSelectedStage(prev => ({ ...prev, [key]: Number(e.target.value) }));
                                setDirty(true);
                              }}
                              className="mt-1.5 text-xs rounded px-1.5 py-1 w-full"
                              style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
                            >
                              {option.stages.map(s => (
                                <option key={s.index} value={s.index} style={{ color: '#1e2624' }}>{s.label}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="text-xs font-normal normal-case mt-1" style={{ color: '#889893' }}>
                              {m.stage.label}
                            </div>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(g => {
                      if (display.sections[g] === false) return null;
                      const visible = METRICS.filter(mm => mm.group === g && display.metrics[mm.key]);
                      if (visible.length === 0) return null;
                      return (
                        <MetricGroup key={g} label={GROUP_LABELS[g]} defs={visible} rows={rows} npvRate={npvRate} />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Charts — between the table and the broker's notes */}
            {chartsOn && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
                {display.charts.totalRent && <TotalRentChart rows={rows} />}
                {display.charts.tiAllowance && <TiAllowanceChart rows={rows} />}
                {display.charts.monthlyRent && <MonthlyRentChart rows={rows} />}
                {display.charts.negotiation && <NegotiationChart rows={rows} />}
                {display.charts.concessions && <ConcessionsChart rows={rows} />}
                {display.charts.cumulative && (
                  <div className="lg:col-span-2"><CumulativeChart rows={rows} /></div>
                )}
              </div>
            )}

            {/* Notes */}
            {display.sections.keyDifferences !== false && (
              <div className="rounded-2xl p-5 mb-5" style={{ backgroundColor: 'white', border: '1px solid #dedad3' }}>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#889893' }}>Notes</p>
                  {canManage && !editingDiff && (
                    <button onClick={() => setEditingDiff(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
                      style={{ color: '#3a4a47', border: '1px solid #dedad3' }}>
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                  )}
                </div>
                {editingDiff ? (
                  <>
                    <textarea value={keyDifferences}
                      onChange={e => { setKeyDifferences(e.target.value); setDirty(true); }}
                      rows={5} placeholder="Notes for the client — what actually separates these options…"
                      className="w-full text-sm rounded-lg px-3 py-2 focus:outline-none"
                      style={{ border: '1px solid #dedad3', color: '#1e2624' }} />
                    <div className="flex justify-end mt-2">
                      <button onClick={() => setEditingDiff(false)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide"
                        style={{ backgroundColor: '#d41f27', color: 'white' }}>Done</button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm whitespace-pre-line" style={{ color: keyDifferences ? '#3a4a47' : '#9aaba8' }}>
                    {keyDifferences || 'No notes written yet.'}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {showSettings && (
        <FinancialSettings display={display} npvRate={npvRate} onClose={() => setShowSettings(false)}
          onChange={d => { setDisplay(d); setDirty(true); }}
          onNpvRateChange={r => { setNpvRate(r); setDirty(true); }} />
      )}
      {printing && (
        <FinancialExport rows={rows} display={display} clientName={clientName} npvRate={npvRate}
          keyDifferences={keyDifferences} onDone={() => setPrinting(false)} />
      )}
    </div>
  );
}

const ghostBtn = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors';
const ghostStyle = { color: '#3a4a47', border: '1px solid #dedad3', backgroundColor: 'white' } as const;

/** One comparison column: a term option of a deal, at a chosen stage. */
export interface CompRow {
  key: string;
  title: string;
  deal: Deal;
  option: TermOption;
  m: StageMetrics;
  savings: number | null;
}

// ---------------------------------------------------------------------------
function MetricGroup({ label, defs, rows, npvRate }: {
  label: string;
  defs: MetricDef[];
  rows: CompRow[];
  npvRate: number;
}) {
  return (
    <>
      <tr>
        <td colSpan={rows.length + 1} className="px-4 py-2 text-xs font-bold uppercase tracking-widest"
          style={{ backgroundColor: '#e7ecea', color: '#37423f', borderTop: '1px solid #dedad3' }}>
          {label}
        </td>
      </tr>
      {defs.map(def => {
        let bestIdx = -1;
        if (def.best && def.num) {
          const nums = rows.map(c => {
            const n = def.num!(c);
            return n == null || !isFinite(n) ? NaN : n;
          });
          const valid = nums.filter(n => !isNaN(n));
          if (valid.length > 1) {
            const target = def.best === 'max' ? Math.max(...valid) : Math.min(...valid);
            bestIdx = nums.indexOf(target);
          }
        }
        return (
          <tr key={def.key}>
            <td className="px-4 py-2.5 text-xs font-semibold sticky left-0 z-10"
              style={{
                color: def.emphasize ? '#37423f' : '#6f7b76',
                backgroundColor: def.emphasize ? '#f5f2ec' : 'white',
                borderBottom: '1px solid #f0ede8',
                textTransform: def.emphasize ? 'uppercase' : 'none',
                letterSpacing: def.emphasize ? '0.05em' : undefined,
              }}>
              {labelOf(def, npvRate)}
            </td>
            {rows.map((c, i) => (
              <td key={c.key} className="px-4 py-2.5 text-sm text-center tabular-nums"
                style={{
                  backgroundColor: def.emphasize ? '#f5f2ec' : 'white',
                  borderBottom: '1px solid #f0ede8',
                  fontWeight: def.emphasize || i === bestIdx ? 700 : 500,
                  color: i === bestIdx ? '#2e7d4f' : '#1e2624',
                }}>
                {def.text(c)}
                {i === bestIdx && <span className="ml-1 text-xs">▼</span>}
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}

function Banner({ tone, children, onDismiss }: {
  tone: 'error' | 'warn' | 'info';
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const palette = {
    error: { bg: 'rgba(212,31,39,0.06)', border: 'rgba(212,31,39,0.25)', fg: '#3a4a47', icon: '#d41f27' },
    warn: { bg: '#fcf3df', border: '#ecd9a6', fg: '#6b551c', icon: '#6b551c' },
    info: { bg: '#eef2ef', border: '#c9d6d2', fg: '#37423f', icon: '#2e7d4f' },
  }[tone];
  return (
    <div className="flex items-center gap-3 px-4 py-3 mb-3 rounded-xl"
      style={{ backgroundColor: palette.bg, border: `1px solid ${palette.border}` }}>
      <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: palette.icon }} />
      <p className="text-sm flex-1" style={{ color: palette.fg }}>{children}</p>
      {onDismiss && <button onClick={onDismiss} className="shrink-0" style={{ color: '#889893' }}><X className="w-4 h-4" /></button>}
    </div>
  );
}

function EmptyState({ canManage }: { canManage: boolean }) {
  return (
    <div className="rounded-2xl flex flex-col items-center justify-center text-center py-20 px-6"
      style={{ backgroundColor: 'white', border: '1px solid #dedad3' }}>
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(212,31,39,0.08)' }}>
        <BarChart3 className="w-7 h-7" style={{ color: '#d41f27' }} />
      </div>
      <h2 className="text-lg font-extrabold uppercase tracking-wide" style={{ color: '#37423f' }}>No deals loaded yet</h2>
      <p className="text-sm mt-2 max-w-md" style={{ color: '#6f7b76' }}>
        {canManage
          ? 'Upload a completed ECR Deal Analysis workbook to compare proposals side by side.'
          : 'Your broker hasn’t added any deals to compare yet.'}
      </p>
    </div>
  );
}
