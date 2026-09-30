import { CAP } from '../../engine/roster/rules';

/** Payroll meter. The scale runs a little past the cap so the cap tick (the only threshold in the rules) sits inside the track. */
export function PayrollBar({ total }: { total: number }) {
  const scale = Math.max(CAP * 1.2, total);
  const fill = Math.min(100, (total / scale) * 100);
  const capAt = (CAP / scale) * 100;
  return (
    <div className="payroll" aria-label={`Payroll $${total} of $${CAP}`}>
      <div className="payroll-label">Payroll ${total} / ${CAP}</div>
      <div className="payroll-track">
        <i className={total > CAP ? 'over' : ''} style={{ width: `${fill}%` }} />
        <span className="payroll-tick" style={{ left: `${capAt}%` }} aria-hidden="true" />
      </div>
      <div className="payroll-marks" aria-hidden="true"><span className="payroll-cap" style={{ left: `${capAt}%` }}>Cap ${CAP}</span></div>
    </div>
  );
}
