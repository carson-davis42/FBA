import { CAP, TRADE_CAP } from '../../engine/roster/rules';

/** Payroll meter. The scale runs past the $27 trade ceiling so the $25 cap tick sits inside the track. Payroll between the two is legal (trades, own re-signings) but outside signings are held to the cap. */
export function PayrollBar({ total }: { total: number }) {
  const scale = Math.max(TRADE_CAP * 1.1, total);
  const fill = Math.min(100, (total / scale) * 100);
  const capAt = (CAP / scale) * 100;
  return (
    <div className="payroll" aria-label={`Payroll $${total} of $${CAP}`}>
      <div className="payroll-label">Payroll ${total} / ${CAP}</div>
      <div className="payroll-track">
        <i className={total > TRADE_CAP ? 'over' : ''} style={{ width: `${fill}%` }} />
        <span className="payroll-tick" style={{ left: `${capAt}%` }} aria-hidden="true" />
      </div>
      <div className="payroll-marks" aria-hidden="true"><span className="payroll-cap" style={{ left: `${capAt}%` }}>Cap ${CAP}</span></div>
      <div className="muted">Signings and extensions stop at ${CAP}; trades and re-signing your own players can go up to ${TRADE_CAP}.</div>
    </div>
  );
}
