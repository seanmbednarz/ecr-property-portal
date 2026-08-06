// ECR-branded print/PDF export of the comparison view.
//
// Mounted only while exporting: it renders a clean branded sheet, prints it,
// then unmounts. The print stylesheet hides the app chrome so only this sheet
// reaches the page. Available to everyone — clients included.

import { Fragment, useEffect, useRef } from 'react';
import ECRLogo from '../../assets/ECR_Logo.svg';
import { CompRow } from '../FinancialAnalysis';
import { METRICS, GROUP_LABELS, DisplaySettings, MetricDef, labelOf } from '../../lib/financial/metrics';

interface Props {
  rows: CompRow[];
  display: DisplaySettings;
  clientName: string;
  npvRate: number;
  keyDifferences: string;
  onDone: () => void;
}

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #ecr-fin-print, #ecr-fin-print * { visibility: visible !important; }
  #ecr-fin-print { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; }
  @page { size: landscape; margin: 12mm; }
}
`;

export default function FinancialExport({ rows, display, clientName, npvRate, keyDifferences, onDone }: Props) {
  const printed = useRef(false);

  useEffect(() => {
    if (printed.current) return;
    printed.current = true;
    // Let the branded sheet paint before handing off to the print dialog.
    const t = window.setTimeout(() => {
      window.print();
      onDone();
    }, 120);
    return () => window.clearTimeout(t);
  }, [onDone]);

  const groups: MetricDef['group'][] = ['financial', 'parking', 'nonfinancial'];
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div id="ecr-fin-print" className="fixed inset-0 overflow-auto z-[200]" style={{ backgroundColor: 'white' }}>
        <div className="px-8 py-6">
          {/* Branded header */}
          <div className="flex items-end justify-between gap-6 pb-3 mb-5"
            style={{ borderBottom: `3px solid #2a3330` }}>
            <div className="flex items-center gap-4">
              <img src={ECRLogo} alt="ECR" style={{ height: 38 }} />
              <div style={{ borderLeft: '1px solid #dedad3', paddingLeft: 16 }}>
                <p className="text-lg font-extrabold uppercase tracking-wide" style={{ color: '#37423f' }}>
                  Deal Comparison
                </p>
                <p className="text-xs" style={{ color: '#6f7b76' }}>
                  {clientName ? `Prepared for ${clientName}` : 'Financial Analysis'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#37423f' }}>
                Equitable Commercial Realty
              </p>
              <p className="text-xs" style={{ color: '#6f7b76' }}>{today}</p>
            </div>
          </div>

          {/* Comparison table */}
          <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th className="text-left px-2 py-2 uppercase tracking-widest"
                  style={{ color: 'white', backgroundColor: '#2a3330', fontSize: 9, width: 190 }}>Metric</th>
                {rows.map(({ key, title, deal, m }) => (
                  <th key={key} className="px-2 py-2 text-center"
                    style={{ color: 'white', backgroundColor: '#2a3330' }}>
                    <div className="font-extrabold uppercase" style={{ fontSize: 10 }}>{title}</div>
                    <div style={{ fontSize: 8, color: '#b5c5c1', fontWeight: 400 }}>{deal.building || deal.address}</div>
                    <div style={{ fontSize: 8, color: '#889893', fontWeight: 400 }}>{m.stage.label}</div>
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
                  <Fragment key={g}>
                    <tr>
                      <td colSpan={rows.length + 1} className="px-2 py-1 uppercase tracking-widest font-bold"
                        style={{ backgroundColor: '#e7ecea', color: '#37423f', fontSize: 9 }}>
                        {GROUP_LABELS[g]}
                      </td>
                    </tr>
                    {visible.map(def => (
                      <tr key={def.key}>
                        <td className="px-2 py-1.5"
                          style={{
                            color: def.emphasize ? '#37423f' : '#6f7b76',
                            backgroundColor: def.emphasize ? '#f5f2ec' : 'white',
                            borderBottom: '1px solid #f0ede8',
                            fontWeight: def.emphasize ? 700 : 500,
                            textTransform: def.emphasize ? 'uppercase' : 'none',
                          }}>
                          {labelOf(def, npvRate)}
                        </td>
                        {rows.map(c => (
                          <td key={c.key} className="px-2 py-1.5 text-center"
                            style={{
                              backgroundColor: def.emphasize ? '#f5f2ec' : 'white',
                              borderBottom: '1px solid #f0ede8',
                              fontWeight: def.emphasize ? 700 : 500,
                              color: '#1e2624',
                            }}>
                            {def.text(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          {display.sections.keyDifferences !== false && keyDifferences.trim() && (
            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#37423f' }}>
                Notes
              </p>
              <p className="whitespace-pre-line" style={{ fontSize: 11, color: '#3a4a47', lineHeight: 1.6 }}>
                {keyDifferences}
              </p>
            </div>
          )}

          <p className="mt-6 pt-3" style={{ fontSize: 8, color: '#889893', borderTop: '1px solid #dedad3' }}>
            ECR // 114 W 7th St // Suite 1000 // Austin, TX 78701 // ecrtx.com — Figures derive from the
            broker's deal model. Estimates are subject to change; this summary is not a lease or an offer.
          </p>
        </div>
      </div>
    </>
  );
}
