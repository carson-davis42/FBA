import { SectionNav } from './SectionNav';
import { Ticker } from './Ticker';
import { TopBar } from './TopBar';
import { useCurrentLeague } from './useCurrentLeague';

/** Masthead, ticker and sticky section nav, as siblings so the nav can stick for the whole page. */
export function SiteHeader() {
  const league = useCurrentLeague();
  return (
    <>
      <TopBar league={league} />
      <Ticker league={league} />
      <SectionNav league={league} />
    </>
  );
}
