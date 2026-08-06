// Full page for a single deal: every term option, every negotiation stage side
// by side, plus the rent schedule behind each one. This is where the complete
// history lives — the comparison table only shows one chosen stage per option.

import { useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { Deal, Stage, TermOption, optionKey } from '../../lib/financial/types';
import { computeStage, money, psf, sf, StageMetrics } from '../../lib/financial/calc';

interface Props {
  deal: Deal;
  /** Chosen stage index per `${dealId}::${optionIndex}`. */
  selectedStage: Record<string, number>;
  canManage: boolean;
  onBack: () => void;
  onSelectStage: (optionIndex: number, stageIndex: number) => void;
}

const ROWS: { label: string; get: (m: StageMetrics) => string; emphasize?: boolean }[] = [
  { label: 'Term', get: m => `${m.termMonths} mos` },
  { label: 'Starting rate / SF', get: m => psf(m.startingRate) },
  { label: 'Avg effective gross rate / SF / yr', get: m => psf(m.effectiveGrossRate) },
  { label: 'Net effective rent / SF / yr', get: m => psf(m.netEffectiveRent) },
  { label: 'Free rent (months)', get: m => `${m.freeRentMonths}` },
  { label: 'Avg gross rent / month', get: m => money(m.avgMonthlyRent) },
  { label: 'Total gross rent', get: m => money(m.totalGrossRent) },
  { label: 'Phase-in', get: m => (m.stage.phaseIn ? `Yes${m.stage.phaseSF ? ` · ${sf(m.stage.phaseSF)} SF` : ''}` : 'No') },
  { label: 'Parking ratio / 1,000 RSF', get: m => (m.stage.parkRatio ? m.stage.parkRatio.toFixed(2) : '—') },
  { label: 'Total parking spaces', get: m => (m.parkingSpaces ? m.parkingSpaces.toFixed(1) : '—') },
  { label: 'Reserved spaces / rate', get: m => (m.reservedSpaces ? `${m.reservedSpaces.toFixed(0)} @ ${money(m.stage.reservedRate)}` : '—') },
  { label: 'Unreserved spaces / rate', get: m => (m.unreservedSpaces ? `${m.unreservedSpaces.toFixed(0)} @ ${m.stage.unreservedRate ? money(m.stage.unreservedRate) : 'Free'}` : '—') },
  { label: 'Abated parking (months)', get: m => (m.parkingAbatedMonths ? `${m.parkingAbatedMonths}` : '—') },
  { label: 'Parking / month (incl. tax)', get: m => money(m.parkingMonthlyWithTax) },
  { label: 'Parking over term', get: m => money(m.parkingCostOverTerm) },
  { label: 'TI allowance / SF', get: m => (m.isTurnKey ? 'Turn-Key' : psf(m.tiAllowancePSF)) },
  { label: 'TI allowance (total)', get: m => (m.isTurnKey ? 'Turn-Key' : money(m.tiAllowanceTotal)) },
  { label: 'Est. construction (total)', get: m => (m.isTurnKey ? 'Turn-Key' : money(m.tiConstructionTotal)) },
  { label: 'Tenant out-of-pocket TI', get: m => (m.isTurnKey ? '$0' : `${money(m.tiOutOfPocket)} (${psf(m.tiOutOfPocketPSF)}/SF)`) },
  { label: 'Moving allowance', get: m => (m.movingAllowance ? money(m.movingAllowance) : '—') },
  { label: 'Other concession', get: m => (m.concession ? `${money(m.concession)}${m.stage.concessionDesc ? ` · ${m.stage.concessionDesc}` : ''}` : '—') },
  { label: 'Other one-time cost', get: m => (m.otherCost ? `${money(m.otherCost)}${m.stage.otherDesc ? ` · ${m.stage.otherDesc}` : ''}` : '—') },
  { label: 'Total occupancy cost', get: m => money(m.totalOccupancyCost), emphasize: true },
  { label: 'Per month', get: m => money(m.avgMonthlyOccupancyCost) },
  { label: 'Commencement', get: m => m.stage.commence || '—' },
  { label: 'Termination option(s)', get: m => m.stage.termination || '—' },
  { label: 'Renewal option(s)', get: m => m.stage.renewal || '—' },
  { label: 'Lease securitization', get: m => (m.securitization ? `${money(m.securitization)}${m.stage.securitizationTerms ? ` · ${m.stage.securitizationTerms}` : ''}` : (m.stage.securitizationTerms || '—')) },
  { label: 'Notes', get: m => m.stage.notes || '—' },
];

export default function FinancialDealPage({ deal, selectedStage, canManage, onBack, onSelectStage }: Props) {
  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: '#f0ede8' }}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest mb-4"
          style={{ color: '#6f7b76' }}>
          <ArrowLeft className="w-3.5 h-3.5" /> Back to comparison
        </button>

        <div className="rounded-2xl p-5 mb-5" style={{ backgroundColor: 'white', border: '1px solid #dedad3' }}>
          <h1 className="text-2xl font-extrabold uppercase leading-tight" style={{ color: '#37423f' }}>{deal.name}</h1>
          <p className="text-sm mt-1" style={{ color: '#6f7b76' }}>
            {[deal.building, deal.address].filter(Boolean).join(' · ') || '—'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-px mt-4 rounded-xl overflow-hidden"
            style={{ backgroundColor: '#e5e1d8' }}>
            {[
              ['Size', `${sf(deal.totalRSF)} RSF`],
              ['Suites', deal.suites.map(s => s.name).filter(Boolean).join(', ') || '—'],
              ['Deal type', deal.type],
              ['Structure', deal.structure],
              ['Term options', `${deal.options.length}`],
              ['Parking tax', `${((deal.parkingTaxRate || 0) * 100).toFixed(2).replace(/\.?0+$/, '')}%`],
            ].map(([k, v]) => (
              <div key={k} className="px-3 py-2.5" style={{ backgroundColor: '#f7f5f1' }}>
                <p className="text-xs uppercase tracking-wider" style={{ color: '#889893' }}>{k}</p>
                <p className="text-sm font-bold mt-0.5" style={{ color: '#1e2624' }}>{v}</p>
              </div>
            ))}
          </div>
        </div>

        {deal.options.map(option => (
          <OptionBlock
            key={option.index}
            deal={deal}
            option={option}
            selectedStageIndex={selectedStage[optionKey(deal.id, option.index)]
              ?? option.stages[option.stages.length - 1]?.index ?? 0}
            canManage={canManage}
            onSelectStage={idx => onSelectStage(option.index, idx)}
          />
        ))}
      </div>
    </div>
  );
}

function OptionBlock({ deal, option, selectedStageIndex, canManage, onSelectStage }: {
  deal: Deal; option: TermOption; selectedStageIndex: number;
  canManage: boolean; onSelectStage: (stageIndex: number) => void;
}) {
  const metrics = option.stages.map(s => computeStage(deal, s));
  const [openSchedule, setOpenSchedule] = useState<number | null>(
    option.stages.length ? option.stages[option.stages.length - 1].index : null
  );

  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className="px-3 py-1 rounded-lg text-xs font-extrabold uppercase tracking-widest"
          style={{ backgroundColor: '#37423f', color: 'white' }}>
          {option.label || `Term Option ${option.index + 1}`}
        </span>
        <span className="text-xs" style={{ color: '#889893' }}>
          {option.stages.length} stage{option.stages.length === 1 ? '' : 's'}
        </span>
        {canManage && (
          <span className="text-xs" style={{ color: '#889893' }}>· tick a stage to use it in the comparison</span>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden mb-3" style={{ backgroundColor: 'white', border: '1px solid #dedad3' }}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-widest sticky left-0 z-10"
                  style={{ color: 'white', backgroundColor: '#2a3330', minWidth: 220 }}>Metric</th>
                {option.stages.map(stage => {
                  const chosen = stage.index === selectedStageIndex;
                  return (
                    <th key={stage.index} className="px-4 py-3 align-top"
                      style={{
                        backgroundColor: chosen ? '#37423f' : '#2a3330',
                        minWidth: 200,
                        borderLeft: '1px solid rgba(255,255,255,0.08)',
                        boxShadow: chosen ? 'inset 0 3px 0 #d41f27' : undefined,
                      }}>
                      <p className="text-xs font-extrabold uppercase leading-tight text-white">{stage.label}</p>
                      <p className="text-xs font-normal mt-0.5" style={{ color: '#b5c5c1' }}>
                        {stage.party === 'tenant' ? 'Tenant' : 'Landlord'}
                      </p>
                      {canManage ? (
                        <button onClick={() => onSelectStage(stage.index)}
                          className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold uppercase tracking-wide"
                          style={chosen
                            ? { backgroundColor: '#d41f27', color: 'white' }
                            : { backgroundColor: 'rgba(255,255,255,0.12)', color: '#d8ddda' }}>
                          {chosen && <Check className="w-3 h-3" />}
                          {chosen ? 'In comparison' : 'Use this'}
                        </button>
                      ) : chosen && (
                        <span className="mt-2 inline-block px-2 py-1 rounded text-xs font-bold uppercase tracking-wide"
                          style={{ backgroundColor: '#d41f27', color: 'white' }}>Current</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(row => (
                <tr key={row.label}>
                  <td className="px-4 py-2.5 text-xs font-semibold sticky left-0 z-10"
                    style={{
                      color: row.emphasize ? '#37423f' : '#6f7b76',
                      backgroundColor: row.emphasize ? '#f5f2ec' : 'white',
                      borderBottom: '1px solid #f0ede8',
                      textTransform: row.emphasize ? 'uppercase' : 'none',
                      letterSpacing: row.emphasize ? '0.05em' : undefined,
                    }}>
                    {row.label}
                  </td>
                  {metrics.map(m => (
                    <td key={m.stage.index} className="px-4 py-2.5 text-sm text-center tabular-nums"
                      style={{
                        backgroundColor: row.emphasize ? '#f5f2ec' : 'white',
                        borderBottom: '1px solid #f0ede8',
                        borderLeft: '1px solid #f7f5f1',
                        fontWeight: row.emphasize ? 700 : 500,
                        color: '#1e2624',
                      }}>
                      {row.get(m)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {option.stages.map(stage => (
          <ScheduleCard key={stage.index} deal={deal} stage={stage}
            open={openSchedule === stage.index}
            onToggle={() => setOpenSchedule(openSchedule === stage.index ? null : stage.index)} />
        ))}
      </div>
    </section>
  );
}

function ScheduleCard({ deal, stage, open, onToggle }: {
  deal: Deal; stage: Stage; open: boolean; onToggle: () => void;
}) {
  const anyDirect = stage.periods.some(p => (p.directExp || 0) > 0);
  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'white', border: '1px solid #dedad3' }}>
      <button onClick={onToggle} className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left"
        style={{ backgroundColor: '#f5f2ec', borderBottom: open ? '1px solid #dedad3' : undefined }}>
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#37423f' }}>
          Rent schedule · {stage.label}
        </span>
        <span className="text-xs" style={{ color: '#889893' }}>{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: '#6f7b76' }}>
                {['Period', 'Months', 'SF', 'Base $/SF', 'OpEx $/SF',
                  ...(anyDirect ? ['Direct exp $/SF'] : []), 'Monthly gross', 'Period total'].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs font-semibold whitespace-nowrap"
                    style={{ borderBottom: '1px solid #f0ede8' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stage.periods.map((p, i) => {
                const psf_ = p.sf && p.sf > 0 ? p.sf : deal.totalRSF;
                const isFree = (p.baseRate || 0) === 0;
                const rate = (isFree ? 0 : p.baseRate) + p.opex + (p.directExp || 0);
                const monthly = rate * psf_ / 12;
                const cell = { borderBottom: '1px solid #f7f5f1' };
                return (
                  <tr key={i}>
                    <td className="px-4 py-2" style={cell}>
                      {p.mos || `${i + 1}`}
                      {isFree && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-xs font-semibold"
                          style={{ backgroundColor: '#fcf3df', color: '#6b551c' }}>free</span>
                      )}
                      {p.sf != null && p.sf > 0 && p.sf !== deal.totalRSF && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-xs font-semibold"
                          style={{ backgroundColor: '#e7ecea', color: '#37423f' }}>phase-in</span>
                      )}
                    </td>
                    <td className="px-4 py-2 tabular-nums" style={cell}>{p.months}</td>
                    <td className="px-4 py-2 tabular-nums" style={cell}>{sf(psf_)}</td>
                    <td className="px-4 py-2 tabular-nums" style={cell}>{psf(p.baseRate)}</td>
                    <td className="px-4 py-2 tabular-nums" style={cell}>{psf(p.opex)}</td>
                    {anyDirect && <td className="px-4 py-2 tabular-nums" style={cell}>{psf(p.directExp || 0)}</td>}
                    <td className="px-4 py-2 tabular-nums" style={cell}>{money(monthly)}</td>
                    <td className="px-4 py-2 tabular-nums" style={cell}>{money(monthly * p.months)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
