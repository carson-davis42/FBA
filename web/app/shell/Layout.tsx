import { Route, Routes, useLocation } from 'react-router-dom';
import { AllStarPage } from '../allstar/AllStarPage';
import { CalendarPage } from '../pages/CalendarPage';
import { D2DraftPage } from '../pages/D2DraftPage';
import { D2RatingsPage } from '../pages/D2RatingsPage';
import { FreeAgencyPage } from '../pages/FreeAgencyPage';
import { GamePage } from '../pages/GamePage';
import { Home } from '../pages/Home';
import { NextSeasonPage } from '../pages/NextSeasonPage';
import { LeaguePage } from '../pages/LeaguePage';
import { AwardsPage } from '../awards/AwardsPage';
import { PlayoffGamePage } from '../playoffs/PlayoffGamePage';
import { PlayoffsPage } from '../playoffs/PlayoffsPage';
import { RankingsPage } from '../rankings/RankingsPage';
import { RatingPausePage } from '../pages/RatingPausePage';
import { SchedulesPage } from '../pages/SchedulesPage';
import { ScoresPage } from '../pages/ScoresPage';
import { StandingsPage } from '../pages/StandingsPage';
import { TeamPage } from '../pages/TeamPage';
import { TradePage } from '../pages/TradePage';
import { TransactionsPage } from '../pages/TransactionsPage';
import { Placeholder } from '../components/Placeholder';
import { CollegeRatingsPage } from '../college/CollegeRatingsPage';
import { ClassRankingPage } from '../college/ClassRankingPage';
import { PortalPage } from '../college/PortalPage';
import { RecruitingPage } from '../college/RecruitingPage';
import { HallOfFamePage } from '../offseason/HallOfFamePage';
import { LotteryPage } from '../offseason/LotteryPage';
import { AdjustAgePage } from '../offseason/AdjustAgePage';
import { FbaDraftPage } from '../offseason/FbaDraftPage';
import { ProRatingsPage } from '../offseason/ProRatingsPage';
import { RetirementPage } from '../offseason/RetirementPage';
import { AwardsByPlayerPage } from '../history/AwardsByPlayerPage';
import { AwardsHistoryPage } from '../history/AwardsHistoryPage';
import { ChampionshipsPage } from '../history/ChampionshipsPage';
import { HallOfFameHistoryPage } from '../history/HallOfFameHistoryPage';
import { HistoryHome } from '../history/HistoryHome';
import { LeadersPage } from '../history/LeadersPage';
import { PlayerHistoryPage } from '../history/PlayerHistoryPage';
import { PlayersHistoryPage } from '../history/PlayersHistoryPage';
import { SeasonHistoryPage } from '../history/SeasonHistoryPage';
import { SiteHeader } from './SiteHeader';

export function Layout() {
  const { pathname } = useLocation();
  return (
    <div className="app">
      <SiteHeader />
      <main className="main">
        <div key={pathname} className="page-in">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/next-season" element={<NextSeasonPage />} />
          <Route path="/schedules" element={<SchedulesPage />} />
          <Route path="/league/fbad2/ratings" element={<D2RatingsPage />} />
          <Route path="/league/fbad2/draft" element={<D2DraftPage />} />
          <Route path="/league/fbajc/recruiting" element={<RecruitingPage />} />
          <Route path="/league/fbajc/portal" element={<PortalPage />} />
          <Route path="/league/fbajc/class-ranking" element={<ClassRankingPage />} />
          <Route path="/league/fbajc/ratings" element={<CollegeRatingsPage />} />
          <Route path="/league/fba/lottery" element={<LotteryPage />} />
          <Route path="/retirement" element={<RetirementPage />} />
          <Route path="/offseason/adjust-age" element={<AdjustAgePage />} />
          <Route path="/league/fba/ratings" element={<ProRatingsPage />} />
          <Route path="/league/fba/draft" element={<FbaDraftPage />} />
          <Route path="/league/fba/hall-of-fame" element={<HallOfFamePage />} />
          <Route path="/league/fba/ratings-pause" element={<RatingPausePage />} />
          <Route path="/league/fba/all-star" element={<AllStarPage />} />
          <Route path="/league/:league/scores" element={<ScoresPage />} />
          <Route path="/league/:league/game/:gameNo" element={<GamePage />} />
          <Route path="/league/:league/playoffs/game/:n" element={<PlayoffGamePage />} />
          <Route path="/league/:league/standings" element={<StandingsPage />} />
          <Route path="/league/:league/playoffs" element={<PlayoffsPage />} />
          <Route path="/league/:league/awards" element={<AwardsPage />} />
          <Route path="/league/:league/rankings" element={<RankingsPage />} />
          <Route path="/league/:league" element={<LeaguePage />} />
          <Route path="/league/:league/free-agency" element={<FreeAgencyPage />} />
          <Route path="/league/:league/team/:teamId" element={<TeamPage />} />
          <Route path="/league/:league/transactions" element={<TransactionsPage />} />
          <Route path="/trade/:league" element={<TradePage />} />
          <Route path="/offseason" element={<Placeholder title="Offseason tools" note="Arrives in sub-project 7. For now, mark offseason steps done on the Calendar page." />} />
          <Route path="/history" element={<HistoryHome />} />
          <Route path="/history/fba/championships" element={<ChampionshipsPage />} />
          <Route path="/history/fba/awards" element={<AwardsHistoryPage />} />
          <Route path="/history/fba/awards/players" element={<AwardsByPlayerPage />} />
          <Route path="/history/fba/hall-of-fame" element={<HallOfFameHistoryPage />} />
          <Route path="/history/fba/leaders" element={<LeadersPage />} />
          <Route path="/history/fba/season/:season" element={<SeasonHistoryPage />} />
          <Route path="/history/fba/players" element={<PlayersHistoryPage />} />
          <Route path="/history/fba/players/:playerId" element={<PlayerHistoryPage />} />
          <Route path="*" element={<Placeholder title="Not found" note="That page doesn't exist." />} />
        </Routes>
        </div>
      </main>
    </div>
  );
}
