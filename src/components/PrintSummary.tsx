import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SummaryReport, ReportRow } from '../lib/summaryReport';
import logoUrl from '../assets/ecr-logo-block.png';

// Print-only rendering of the Property Summary Report. Lives in a portal on
// document.body so print CSS can hide the app and show only this. Screen
// styles keep it invisible; @media print in index.css flips that.
//
// Matches the dashboard's brand exactly — Montserrat, #DB202E header band,
// #334041 ink, alternating #DCE4E3/#BECCCB rows — and, unlike the .xlsx,
// carries a photo of each property.

const INK = '#334041';
const RED = '#DB202E';
const ROW_A = '#DCE4E3';
const ROW_B = '#BECCCB';

function money(v: number | null, decimals = 2): string {
  if (v == null) return '—';
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
function sf(v: number | null): string {
  return v == null ? '—' : v.toLocaleString();
}

const th: React.CSSProperties = {
  backgroundColor: RED,
  color: 'white',
  fontSize: '7.5pt',
  fontWeight: 700,
  padding: '6px 5px',
  border: '0.5pt solid #9aaba8',
  textAlign: 'center',
  verticalAlign: 'middle',
  letterSpacing: '0.02em',
};

function td(even: boolean, align: React.CSSProperties['textAlign'] = 'center'): React.CSSProperties {
  return {
    backgroundColor: even ? ROW_A : ROW_B,
    color: INK,
    fontSize: '8pt',
    padding: '5px',
    border: '0.5pt solid #9aaba8',
    textAlign: align,
    verticalAlign: 'middle',
  };
}

function PhotoCell({ url, even }: { url: string | null; even: boolean }) {
  return (
    <td style={{ ...td(even), width: 92, padding: 3 }}>
      {url
        ? <img src={url} alt="" style={{ width: 86, height: 58, objectFit: 'cover', borderRadius: 3, display: 'block' }} />
        : <span style={{ color: '#7a8a87' }}>—</span>}
    </td>
  );
}

function Flyer({ row, even }: { row: ReportRow; even: boolean }) {
  return (
    <td style={td(even)}>
      {row.brochureUrl
        ? <a href={row.brochureUrl} style={{ color: RED, fontWeight: 600, textDecoration: 'underline' }}>View Flyer</a>
        : '—'}
    </td>
  );
}

function ReportHeader({ report }: { report: SummaryReport }) {
  return (
    <thead>
      <tr>
        <td colSpan={99} style={{ padding: 0, border: 'none' }}>
          <div style={{
            backgroundColor: INK, display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', padding: '10px 14px', marginBottom: 0,
          }}>
            <img src={logoUrl} alt="ECR" style={{ height: 34 }} />
            <div style={{ color: 'white', textAlign: 'right', lineHeight: 1.25 }}>
              <div style={{ fontSize: '13pt', fontWeight: 500 }}>Property Summary Report</div>
              <div style={{ fontSize: '7.5pt', letterSpacing: '0.35em' }}>AUSTIN, TEXAS</div>
            </div>
          </div>
          <div style={{
            textAlign: 'center', color: INK, fontSize: '12pt', fontWeight: 700,
            padding: '8px 0 10px', letterSpacing: '0.06em',
          }}>
            {report.clientName.toUpperCase()}   |   {report.dateLabel.toUpperCase()}
          </div>
        </td>
      </tr>
    </thead>
  );
}

function LeaseTable({ report }: { report: SummaryReport }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 18 }}>
      <ReportHeader report={report} />
      <tbody>
        <tr>
          {['', 'PROPERTY #', 'BUILDING/ADDRESS', 'SUITE', 'SQUARE FEET', 'BASE RENT',
            `${report.year} OP. EXPENSES`, 'FULL SERVICE RATE', 'QUOTED MONTHLY RENT',
            'PARKING', 'FLYERS/FLOORPLANS', 'NOTES'].map((h, i) => (
            <th key={i} style={th}>{h}</th>
          ))}
        </tr>
        {report.lease.map((r, i) => {
          const even = i % 2 === 0;
          const fullSvc = r.baseRent != null && r.opEx != null ? r.baseRent + r.opEx : r.baseRent;
          const monthly = fullSvc != null && r.sf != null ? (fullSvc * r.sf) / 12 : null;
          return (
            <tr key={i} style={{ pageBreakInside: 'avoid' }}>
              <PhotoCell url={r.imageUrl} even={even} />
              <td style={td(even)}>{r.propertyNo}</td>
              <td style={{ ...td(even, 'left'), fontWeight: 700 }}>
                {r.building}
                {r.address && <div style={{ fontWeight: 400, fontSize: '7pt' }}>{r.address}</div>}
              </td>
              <td style={td(even)}>{r.suite || '—'}</td>
              <td style={td(even)}>{sf(r.sf)}</td>
              <td style={td(even)}>{money(r.baseRent)}</td>
              <td style={td(even)}>{money(r.opEx)}</td>
              <td style={td(even)}>{money(fullSvc)}</td>
              <td style={td(even)}>{monthly != null ? money(monthly) : '—'}</td>
              <td style={td(even)}>{r.parking ?? '—'}</td>
              <Flyer row={r} even={even} />
              <td style={{ ...td(even, 'left'), fontSize: '7pt' }}>{r.notes ?? '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SaleTable({ report, newPage }: { report: SummaryReport; newPage: boolean }) {
  return (
    <table style={{
      width: '100%', borderCollapse: 'collapse',
      // Start the sale report on its own sheet rather than running on from
      // the lease rows mid-page.
      pageBreakBefore: newPage ? 'always' : 'auto',
    }}>
      <ReportHeader report={report} />
      <tbody>
        <tr>
          {['', 'PROPERTY #', 'BUILDING/ADDRESS', 'SUITE', 'SQUARE FEET', 'SALES PRICE',
            'PRICE PER SF', 'PARKING', 'FLYER/FLOORPLAN', 'NOTES'].map((h, i) => (
            <th key={i} style={th}>{h}</th>
          ))}
        </tr>
        {report.sale.map((r, i) => {
          const even = i % 2 === 0;
          const perSf = r.salePrice != null && r.sf ? r.salePrice / r.sf : null;
          return (
            <tr key={i} style={{ pageBreakInside: 'avoid' }}>
              <PhotoCell url={r.imageUrl} even={even} />
              <td style={td(even)}>{r.propertyNo}</td>
              <td style={{ ...td(even, 'left'), fontWeight: 700 }}>
                {r.building}
                {r.address && <div style={{ fontWeight: 400, fontSize: '7pt' }}>{r.address}</div>}
              </td>
              <td style={td(even)}>{r.suite || '—'}</td>
              <td style={td(even)}>{sf(r.sf)}</td>
              <td style={td(even)}>{r.salePrice != null ? money(r.salePrice, 0) : '—'}</td>
              <td style={td(even)}>{money(perSf)}</td>
              <td style={td(even)}>{r.parking ?? '—'}</td>
              <Flyer row={r} even={even} />
              <td style={{ ...td(even, 'left'), fontSize: '7pt' }}>{r.notes ?? '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function PrintSummary({ report, onReady }: {
  report: SummaryReport;
  onReady: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fired = useRef(false);

  // Don't open the print dialog until the photos have actually decoded, or
  // the PDF comes out with holes where the images should be. A slow or dead
  // image can't block printing forever, so cap the wait.
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const imgs = Array.from(ref.current?.querySelectorAll('img') ?? []);
    const settled = imgs.map(img =>
      img.complete ? Promise.resolve() : new Promise<void>(res => {
        img.addEventListener('load', () => res(), { once: true });
        img.addEventListener('error', () => res(), { once: true });
      })
    );
    const timeout = new Promise<void>(res => setTimeout(res, 4000));
    Promise.race([Promise.all(settled), timeout]).then(() => onReady());
  }, [onReady]);

  return createPortal(
    <div id="print-summary" ref={ref} style={{ fontFamily: 'Montserrat, sans-serif' }}>
      {report.lease.length > 0 && <LeaseTable report={report} />}
      {report.sale.length > 0 && <SaleTable report={report} newPage={report.lease.length > 0} />}
    </div>,
    document.body,
  );
}
