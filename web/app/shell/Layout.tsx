import { Route, Routes } from 'react-router-dom';
import { CalendarPage } from '../pages/CalendarPage';
import { D2DraftPage } from '../pages/D2DraftPage';
import { D2RatingsPage } from '../pages/D2RatingsPage';
import { FreeAgencyPage } from '../pages/FreeAgencyPage';
import { Home } from '../pages/Home';
import { LeaguePage } from '../pages/LeaguePage';
import { SchedulesPage } from '../pages/SchedulesPage';
import { TeamPage } from '../pages/TeamPage';
import { TradePage } from '../pages/TradePage';
import { TransactionsPage } from '../pages/TransactionsPage';
import { Placeholder } from '../components/Placeholder';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function Layout() {
  return (
    <div className="app">
      <TopBar />
      <Sidebar />
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/schedules" element={<SchedulesPage />} />
          <Route path="/league/fbad2/ratings" element={<D2RatingsPage />} />
          <Route path="/league/fbad2/draft" element={<D2DraftPage />} />
          <Route path="/league/:league" element={<LeaguePage />} />
          <Route path="/league/:league/free-agency" element={<FreeAgencyPage />} />
          <Route path="/league/:league/team/:teamId" element={<TeamPage />} />
          <Route path="/league/:league/transactions" element={<TransactionsPage />} />
          <Route path="/trade/:league" element={<TradePage />} />
          <Route path="/offseason" element={<Placeholder title="Offseason tools" note="Arrives in sub-project 7. For now, mark offseason steps done on the Calendar page." />} />
          <Route path="/history" element={<Placeholder title="History" note="League history arrives in sub-project 3." />} />
          <Route path="*" element={<Placeholder title="Not found" note="That page doesn't exist." />} />
        </Routes>
      </main>
    </div>
  );
}
