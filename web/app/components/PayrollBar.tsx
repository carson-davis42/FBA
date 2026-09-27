import { CAP } from '../../engine/roster/rules';

export function PayrollBar({ total }: { total: number }) {
  const pct = Math.min(100, Math.round((total / CAP) * 100));
  return (
    <div className="payroll" aria-label={`Payroll $${total} of $${CAP}`}>
      <div className="payroll-label">Payroll ${total} / ${CAP}</div>
      <div className="payroll-track"><i className={total > CAP ? 'over' : ''} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
