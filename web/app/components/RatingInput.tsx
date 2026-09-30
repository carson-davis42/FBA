import { useEffect, useState } from 'react';
import { parseRatingInput } from '../../engine/d2/ratings';
import '../offseason/offseason.css';

/** A rating box that saves on blur (or Enter). Blank is only accepted when allowBlank is set. */
export function RatingInput({ value, name, disabled, allowBlank, onSave }: {
  value: number | null; name: string; disabled: boolean; allowBlank: boolean; onSave: (value: number | null) => void;
}) {
  const shown = value === null ? '' : String(value);
  const [text, setText] = useState(shown);
  const [problem, setProblem] = useState('');
  useEffect(() => { setText(shown); }, [shown]);
  const commit = () => {
    const parsed = parseRatingInput(text);
    if (!parsed.ok || (!allowBlank && parsed.value === null)) {
      setProblem(parsed.ok ? 'Enter a whole number from 1 to 99' : parsed.problem);
      return;
    }
    setProblem('');
    if (parsed.value !== value) onSave(parsed.value);
  };
  return (
    <>
      <input
        className={`rating-input${text !== shown ? ' changed' : ''}`} inputMode="numeric" aria-label={`New rating for ${name}`} value={text} disabled={disabled}
        onChange={e => setText(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
      {problem && <div className="error inline-problem">{problem}</div>}
    </>
  );
}
