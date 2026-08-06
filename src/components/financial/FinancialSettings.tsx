// Drawer for choosing what the client sees: sections, charts, and every
// individual metric. Standard metrics start on; the rest are opt-in.

import { X, RotateCcw } from 'lucide-react';
import {
  CHARTS, GROUP_LABELS, METRICS, SECTIONS, DisplaySettings, MetricDef, defaultDisplay,
} from '../../lib/financial/metrics';

interface Props {
  display: DisplaySettings;
  npvRate: number;
  onChange: (d: DisplaySettings) => void;
  onNpvRateChange: (r: number) => void;
  onClose: () => void;
}

function Toggle({ on, onChange, label, hint }: {
  on: boolean; onChange: (v: boolean) => void; label: string; hint?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-2 cursor-pointer select-none"
      style={{ borderBottom: '1px solid #f0ede8' }}>
      <span className="min-w-0">
        <span className="text-sm block" style={{ color: '#3a4a47' }}>{label}</span>
        {hint && <span className="text-xs block mt-0.5" style={{ color: '#9aaba8' }}>{hint}</span>}
      </span>
      <span className="relative shrink-0" style={{ width: 38, height: 22 }}>
        <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)}
          className="sr-only peer" />
        <span className="absolute inset-0 rounded-full transition-colors"
          style={{ backgroundColor: on ? '#2e7d4f' : '#d6d3c8' }} />
        <span className="absolute rounded-full bg-white transition-transform"
          style={{ width: 16, height: 16, top: 3, left: 3, transform: on ? 'translateX(16px)' : 'none' }} />
      </span>
    </label>
  );
}

export default function FinancialSettings({ display, npvRate, onChange, onNpvRateChange, onClose }: Props) {
  const set = (patch: Partial<DisplaySettings>) => onChange({ ...display, ...patch });
  const setMetric = (k: string, v: boolean) => set({ metrics: { ...display.metrics, [k]: v } });
  const setChart = (k: string, v: boolean) => set({ charts: { ...display.charts, [k]: v } });
  const setSection = (k: string, v: boolean) => set({ sections: { ...display.sections, [k]: v } });

  const groups: MetricDef['group'][] = ['financial', 'parking', 'nonfinancial'];

  return (
    <div className="fixed inset-0 z-[95]">
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(38,43,41,0.5)' }} onClick={onClose} />
      <aside className="absolute top-0 right-0 h-full w-full sm:w-[460px] overflow-y-auto"
        style={{ backgroundColor: '#f7f5f1', boxShadow: '0 14px 50px rgba(38,43,41,0.22)' }}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4"
          style={{ backgroundColor: '#2a3330' }}>
          <div>
            <h2 className="text-base font-extrabold uppercase tracking-wide text-white">Customize view</h2>
            <p className="text-xs mt-0.5" style={{ color: '#b5c5c1' }}>Choose what appears in the comparison.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: 'white' }}><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          <Panel title="Sections">
            {SECTIONS.map(s => (
              <Toggle key={s.key} label={s.label} on={display.sections[s.key] !== false}
                onChange={v => setSection(s.key, v)} />
            ))}
          </Panel>

          <Panel title="Charts">
            {CHARTS.map(c => (
              <Toggle key={c.key} label={c.label} hint={c.hint} on={!!display.charts[c.key]}
                onChange={v => setChart(c.key, v)} />
            ))}
          </Panel>

          <Panel title="NPV discount rate">
            <p className="text-xs mb-3 mt-1" style={{ color: '#6f7b76', lineHeight: 1.5 }}>
              Use this client’s cost of capital — their borrowing rate or WACC. It only affects the
              optional NPV metric, and the rate is shown alongside it so the assumption is never hidden.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number" step={0.25} min={0} max={30}
                value={+(npvRate * 100).toFixed(2)}
                onChange={e => {
                  const pct = parseFloat(e.target.value);
                  if (!isNaN(pct)) onNpvRateChange(Math.min(30, Math.max(0, pct)) / 100);
                }}
                className="w-24 text-sm rounded-lg px-2 py-1.5"
                style={{ border: '1px solid #dedad3', color: '#1e2624' }}
              />
              <span className="text-sm" style={{ color: '#6f7b76' }}>% per year</span>
            </div>
          </Panel>

          {groups.map(g => {
            const std = METRICS.filter(m => m.group === g && m.std);
            const opt = METRICS.filter(m => m.group === g && !m.std);
            return (
              <Panel key={g} title={`${GROUP_LABELS[g]} metrics`}>
                {std.map(m => (
                  <Toggle key={m.key} label={m.label} on={!!display.metrics[m.key]}
                    onChange={v => setMetric(m.key, v)} />
                ))}
                {opt.length > 0 && (
                  <>
                    <p className="text-xs font-bold uppercase tracking-widest mt-4 mb-1" style={{ color: '#9aaba8' }}>
                      Optional
                    </p>
                    {opt.map(m => (
                      <Toggle key={m.key} label={m.label} on={!!display.metrics[m.key]}
                        onChange={v => setMetric(m.key, v)} />
                    ))}
                  </>
                )}
              </Panel>
            );
          })}

          <button onClick={() => onChange(defaultDisplay())}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
            style={{ color: '#3a4a47', border: '1px solid #dedad3', backgroundColor: 'white' }}>
            <RotateCcw className="w-3.5 h-3.5" /> Reset to standard view
          </button>
        </div>
      </aside>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl px-4 py-3" style={{ backgroundColor: 'white', border: '1px solid #dedad3' }}>
      <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#37423f' }}>{title}</p>
      {children}
    </section>
  );
}
