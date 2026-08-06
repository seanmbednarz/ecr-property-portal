// Comparison charts. Hand-rolled SVG/CSS rather than a charting dependency —
// these are simple shapes and the project has no chart library.

import { Deal, TermOption } from '../../lib/financial/types';
import { StageMetrics, computeStage, cumulativeCurve, money, psf, sf } from '../../lib/financial/calc';

/** One comparison column: a specific term option of a specific deal. */
export interface ChartRow {
  key: string;
  title: string;
  deal: Deal;
  option: TermOption;
  m: StageMetrics;
}

const CHARCOAL = '#37423f';
const SAGE = '#889893';
const GREEN = '#2e7d4f';
const RED = '#d41f27';
const TRACK = '#efece5';

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: 'white', border: '1px solid #dedad3' }}>
      <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#889893' }}>{title}</p>
      {children}
    </div>
  );
}

/** Horizontal bar with the value inside the fill, as in the deal summary. */
function Bar({ label, sub, pct, fill, inside, right, rightColor }: {
  label: string; sub: string; pct: number; fill: string;
  inside: string; right: string; rightColor?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-3 last:mb-0">
      <div className="w-40 sm:w-52 shrink-0 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: '#1e2624' }}>{label}</p>
        <p className="text-xs" style={{ color: '#889893' }}>{sub}</p>
      </div>
      <div className="flex-1 h-7 rounded-md overflow-hidden min-w-0" style={{ backgroundColor: TRACK }}>
        <div className="h-full rounded-md flex items-center px-2 whitespace-nowrap"
          style={{ width: `${Math.max(6, Math.min(100, pct))}%`, backgroundColor: fill }}>
          <span className="text-xs font-bold text-white truncate">{inside}</span>
        </div>
      </div>
      <div className="w-28 shrink-0 text-right text-sm font-bold tabular-nums"
        style={{ color: rightColor ?? '#1e2624' }}>{right}</div>
    </div>
  );
}

export function TotalRentChart({ rows }: { rows: ChartRow[] }) {
  const max = Math.max(...rows.map(r => r.m.totalGrossRent), 1);
  return (
    <ChartCard title="Total rent commitment">
      {rows.map(({ key, title, deal, m }) => (
        <Bar key={key} label={title}
          sub={`${sf(deal.totalRSF)} RSF · ${m.termMonths} mos`}
          pct={(m.totalGrossRent / max) * 100} fill={CHARCOAL}
          inside={money(m.totalGrossRent)} right={money(m.totalGrossRent)} />
      ))}
    </ChartCard>
  );
}

export function MonthlyRentChart({ rows }: { rows: ChartRow[] }) {
  const max = Math.max(...rows.map(r => r.m.avgMonthlyRent), 1);
  return (
    <ChartCard title="Monthly rent commitment">
      {rows.map(({ key, title, deal, m }) => (
        <Bar key={key} label={title}
          sub={`${sf(deal.totalRSF)} RSF · ${psf(m.effectiveGrossRate)}/SF/yr`}
          pct={(m.avgMonthlyRent / max) * 100} fill={CHARCOAL}
          inside={`${money(m.avgMonthlyRent)}/mo`} right={money(m.avgMonthlyRent)} />
      ))}
    </ChartCard>
  );
}

export function TiAllowanceChart({ rows }: { rows: ChartRow[] }) {
  const max = Math.max(...rows.map(r => r.m.tiAllowanceTotal), 1);
  return (
    <ChartCard title="TI allowance comparison">
      {rows.map(({ key, title, deal, m }) => (
        m.isTurnKey ? (
          <Bar key={key} label={title} sub={`${sf(deal.totalRSF)} RSF · turn-key`}
            pct={100} fill={GREEN} inside="Turn-Key delivery" right="Turn-Key" rightColor={GREEN} />
        ) : (
          <Bar key={key} label={title}
            sub={`${sf(deal.totalRSF)} RSF · ${psf(m.tiAllowancePSF)}/RSF`}
            pct={(m.tiAllowanceTotal / max) * 100} fill={SAGE}
            inside={money(m.tiAllowanceTotal)} right={money(m.tiAllowanceTotal)} />
        )
      ))}
    </ChartCard>
  );
}

/** Total occupancy cost at each negotiation stage — what the back-and-forth moved. */
export function NegotiationChart({ rows }: { rows: ChartRow[] }) {
  const all = rows.flatMap(({ deal, option }) =>
    option.stages.map(s => computeStage(deal, s).totalOccupancyCost));
  const max = Math.max(...all, 1);
  return (
    <ChartCard title="Negotiation progress">
      {rows.map(({ key, title, deal, option }) => (
        <div key={key} className="mb-4 last:mb-0">
          <p className="text-sm font-semibold mb-2" style={{ color: '#1e2624' }}>{title}</p>
          {option.stages.map(stage => {
            const sm = computeStage(deal, stage);
            const isTenant = stage.party === 'tenant';
            return (
              <div key={stage.index} className="flex items-center gap-3 mb-1.5">
                <div className="w-32 sm:w-44 shrink-0 text-xs truncate" style={{ color: '#6f7b76' }}>
                  {stage.label}
                </div>
                <div className="flex-1 h-5 rounded overflow-hidden min-w-0" style={{ backgroundColor: TRACK }}>
                  <div className="h-full rounded"
                    style={{
                      width: `${Math.max(4, (sm.totalOccupancyCost / max) * 100)}%`,
                      backgroundColor: isTenant ? RED : CHARCOAL,
                    }} />
                </div>
                <div className="w-28 shrink-0 text-right text-xs font-bold tabular-nums" style={{ color: '#1e2624' }}>
                  {money(sm.totalOccupancyCost)}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <div className="flex gap-4 mt-3 pt-3" style={{ borderTop: '1px solid #f0ede8' }}>
        <Legend color={CHARCOAL} label="Landlord" />
        <Legend color={RED} label="Tenant" />
      </div>
    </ChartCard>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs" style={{ color: '#6f7b76' }}>
      <span className="w-3 h-1.5 rounded-sm inline-block" style={{ backgroundColor: color }} />{label}
    </span>
  );
}

const LINE_COLORS = [CHARCOAL, RED, SAGE, '#2e7d4f', '#7a5c3e', '#4a6fa5'];

/** Cumulative occupancy cost month by month — reveals the crossover point. */
export function CumulativeChart({ rows }: { rows: ChartRow[] }) {
  const series = rows.map(({ title, deal, m }) => ({
    name: title,
    pts: cumulativeCurve(deal, m.stage),
  }));
  const maxMonths = Math.max(...series.map(s => s.pts.length), 1);
  const maxCost = Math.max(...series.flatMap(s => s.pts), 1);
  const W = 760, H = 240, PAD_L = 62, PAD_B = 26, PAD_T = 10, PAD_R = 10;
  const x = (i: number) => PAD_L + (i / Math.max(1, maxMonths - 1)) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - v / maxCost) * (H - PAD_T - PAD_B);

  return (
    <ChartCard title="Cumulative cost over time">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 520 }} role="img"
          aria-label="Cumulative occupancy cost by month for each deal">
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <g key={f}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y(maxCost * f)} y2={y(maxCost * f)} stroke="#efece5" strokeWidth={1} />
              <text x={PAD_L - 8} y={y(maxCost * f) + 3} textAnchor="end" fontSize={9} fill="#889893">
                {money(maxCost * f)}
              </text>
            </g>
          ))}
          {[0, 12, 24, 36, 48, 60].filter(mo => mo < maxMonths).map(mo => (
            <text key={mo} x={x(mo)} y={H - 8} textAnchor="middle" fontSize={9} fill="#889893">
              {mo === 0 ? 'Start' : `Yr ${mo / 12}`}
            </text>
          ))}
          {series.map((s, i) => (
            <polyline key={s.name} fill="none" strokeWidth={2}
              stroke={LINE_COLORS[i % LINE_COLORS.length]}
              points={s.pts.map((v, idx) => `${x(idx)},${y(v)}`).join(' ')} />
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap gap-4 mt-2">
        {series.map((s, i) => <Legend key={s.name} color={LINE_COLORS[i % LINE_COLORS.length]} label={s.name} />)}
      </div>
    </ChartCard>
  );
}

/** Free rent + TI allowance + abated parking, stacked per deal. */
export function ConcessionsChart({ rows }: { rows: ChartRow[] }) {
  const max = Math.max(...rows.map(r => r.m.totalConcessions), 1);
  return (
    <ChartCard title="Concessions breakdown">
      {rows.map(({ key, title, deal, m }) => {
        const parts = [
          { v: m.freeRentValue, c: CHARCOAL },
          { v: m.tiAllowanceTotal, c: SAGE },
          { v: m.parkingAbatedValue, c: GREEN },
        ].filter(p => p.v > 0);
        return (
          <div key={key} className="flex items-center gap-3 mb-3 last:mb-0">
            <div className="w-40 sm:w-52 shrink-0 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: '#1e2624' }}>{title}</p>
              <p className="text-xs" style={{ color: '#889893' }}>{sf(deal.totalRSF)} RSF</p>
            </div>
            <div className="flex-1 h-7 rounded-md overflow-hidden flex min-w-0" style={{ backgroundColor: TRACK }}>
              {parts.map((p, i) => (
                <div key={i} style={{ width: `${(p.v / max) * 100}%`, backgroundColor: p.c }} />
              ))}
            </div>
            <div className="w-28 shrink-0 text-right text-sm font-bold tabular-nums" style={{ color: '#1e2624' }}>
              {money(m.totalConcessions)}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-4 mt-3 pt-3" style={{ borderTop: '1px solid #f0ede8' }}>
        <Legend color={CHARCOAL} label="Free rent" />
        <Legend color={SAGE} label="TI allowance" />
        <Legend color={GREEN} label="Abated parking" />
      </div>
    </ChartCard>
  );
}
