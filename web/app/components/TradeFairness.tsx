import type { TradeAssessment, TradeVerdict } from '../../engine/roster/tradeValue';

const WORDS: Record<TradeVerdict, string> = { fair: 'Fair trade', slight: 'Slightly favours', clear: 'Favours', lopsided: 'Lopsided toward' };

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n))}`;

/** How even a trade is: a bar tipping toward the team that comes out ahead (two teams), a verdict, and what each team receives and gives. */
export function TradeFairness({ assessment, nameOf }: { assessment: TradeAssessment; nameOf: (teamId: string) => string }) {
  const { sides, favoured, verdict, imbalance } = assessment;
  const text = favoured === null ? WORDS.fair : `${WORDS[verdict]} ${nameOf(favoured)}`;
  // Two teams: the marker sits left of centre when the first team comes out ahead, right when the second does.
  const tilt = sides.length === 2 && assessment.moved > 0 ? (sides[1].net - sides[0].net) / 2 / assessment.moved : 0;
  return (
    <div className={`fairness fairness-${verdict}`}>
      <div className="fairness-head">
        <h3>Fairness</h3>
        <b className="fairness-verdict">{text}</b>
      </div>
      {sides.length === 2 && (
        <div className="fairness-bar" role="img" aria-label={`${text}: ${Math.round(imbalance * 100)}% off even`}>
          <span className="fairness-end">{nameOf(sides[0].teamId)}</span>
          <span className="fairness-track">
            <i className="fairness-mid" />
            <i className="fairness-marker" style={{ left: `${50 + 50 * Math.max(-1, Math.min(1, tilt))}%` }} />
          </span>
          <span className="fairness-end">{nameOf(sides[1].teamId)}</span>
        </div>
      )}
      <ul className="fairness-sides">
        {sides.map(s => (
          <li key={s.teamId}>
            <b>{nameOf(s.teamId)}</b> receives {Math.round(s.receives)}, gives {Math.round(s.gives)} <span className={s.net > 0 ? 'delta-up' : s.net < 0 ? 'delta-down' : 'muted'}>({signed(s.net)})</span>
          </li>
        ))}
      </ul>
      <p className="muted fairness-note">An estimate from each player&apos;s rating, age and contract, and each pick&apos;s original team and protection. It doesn&apos;t block a trade.</p>
    </div>
  );
}
