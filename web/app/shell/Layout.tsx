import { Route, Routes } from 'react-router-dom';
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
          <Route path="/" element={<Placeholder title="Home" note="Dashboard arrives in the next task." />} />
          <Route path="/calendar" element={<Placeholder title="Calendar" note="Calendar arrives in the next task." />} />
          <Route path="/league/:league" element={<Placeholder title="League" note="League pages arrive soon." />} />
          <Route path="/league/:league/team/:teamId" element={<Placeholder title="Team" note="Team pages arrive soon." />} />
          <Route path="/offseason" element={<Placeholder title="Offseason tools" note="Arrives in sub-project 7. For now, mark offseason steps done on the Calendar page." />} />
          <Route path="/history" element={<Placeholder title="History" note="League history arrives in sub-project 3." />} />
          <Route path="*" element={<Placeholder title="Not found" note="That page doesn't exist." />} />
        </Routes>
      </main>
    </div>
  );
}
