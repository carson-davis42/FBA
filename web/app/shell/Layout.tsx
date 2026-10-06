import { createRoutesFromElements, matchRoutes, Route, useLocation, useRoutes } from 'react-router-dom';
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
import { OffseasonHub } from '../pages/OffseasonHub';
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
import { BoxScorePage } from '../history/BoxScorePage';
import { AwardsHistoryPage } from '../history/AwardsHistoryPage';
import { ChampionshipsPage } from '../history/ChampionshipsPage';
import { HallOfFameHistoryPage } from '../history/HallOfFameHistoryPage';
import { HistoryHome } from '../history/HistoryHome';
import { LeadersPage } from '../history/LeadersPage';
import { PlayerHistoryPage } from '../history/PlayerHistoryPage';
import { PlayersHistoryPage } from '../history/PlayersHistoryPage';
import { DraftSeasonPage } from '../history/DraftSeasonPage';
import { PastTransactionsPage } from '../history/PastTransactionsPage';
import { TimelinePage } from '../history/TimelinePage';
import { D2AwardsPage } from '../history/d2/D2AwardsPage';
import { D2ChampionshipsPage } from '../history/d2/D2ChampionshipsPage';
import { D2DraftSeasonPage } from '../history/d2/D2DraftSeasonPage';
import { D2DraftsPage } from '../history/d2/D2DraftsPage';
import { D2HistoryHome } from '../history/d2/D2HistoryHome';
import { D2SeasonPage } from '../history/d2/D2SeasonPage';
import { D2TeamPage } from '../history/d2/D2TeamPage';
import { D2TeamsPage } from '../history/d2/D2TeamsPage';
import { JcAwardsHistoryPage } from '../history/jc/JcAwardsHistoryPage';
import { JcChampionshipsPage } from '../history/jc/JcChampionshipsPage';
import { JcHistoryHome } from '../history/jc/JcHistoryHome';
import { JcRecruitingPage } from '../history/jc/JcRecruitingPage';
import { JcSchoolPage } from '../history/jc/JcSchoolPage';
import { JcSchoolsPage } from '../history/jc/JcSchoolsPage';
import { JcSeasonPage } from '../history/jc/JcSeasonPage';
import { WcHistoryPage } from '../history/wc/WcHistoryPage';
import { WcTeamPage } from '../history/wc/WcTeamPage';
import { WcSeasonPage } from '../history/wc/WcSeasonPage';
import { DraftsPage } from '../history/DraftsPage';
import { FranchisePage } from '../history/FranchisePage';
import { SeasonHistoryPage } from '../history/SeasonHistoryPage';
import { StreaksPage } from '../history/StreaksPage';
import { TeamsHistoryPage } from '../history/TeamsHistoryPage';
import { LeadersPage as JcLeadersPage } from '../jc/LeadersPage';
import { JcAwardsPage } from '../jc/JcAwardsPage';
import { JcGamePage } from '../jc/JcGamePage';
import { WcGamePage } from '../wc/WcGamePage';
import { PostseasonPage as JcPostseasonPage } from '../jc/PostseasonPage';
import { RankingsPage as JcRankingsPage } from '../jc/RankingsPage';
import { ScoresPage as JcScoresPage } from '../jc/ScoresPage';
import { StandingsPage as JcStandingsPage } from '../jc/StandingsPage';
import { TournamentsPage as JcTournamentsPage } from '../jc/TournamentsPage';
import { QualifyingPage } from '../wc/QualifyingPage';
import { WorldCupPage } from '../wc/WorldCupPage';
import { SiteHeader } from './SiteHeader';

/** Built once, so the page wrapper can key on the matched route pattern. */
const ROUTES = createRoutesFromElements(
  <>
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
  <Route path="/league/fbajc/scores" element={<JcScoresPage />} />
  <Route path="/league/fbajc/standings" element={<JcStandingsPage />} />
  <Route path="/league/fbajc/rankings" element={<JcRankingsPage />} />
  <Route path="/league/fbajc/tournaments" element={<JcTournamentsPage />} />
  <Route path="/league/fbajc/leaders" element={<JcLeadersPage />} />
  <Route path="/league/fbajc/game/:gameNo" element={<JcGamePage />} />
  <Route path="/league/fbawc/game/:gameNo" element={<WcGamePage />} />
  <Route path="/league/fbajc/postseason" element={<JcPostseasonPage />} />
  <Route path="/league/fbajc/awards" element={<JcAwardsPage />} />
  <Route path="/league/fbawc/qualifying" element={<QualifyingPage />} />
  <Route path="/league/fbawc/worldcup" element={<WorldCupPage />} />
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
  <Route path="/offseason" element={<OffseasonHub />} />
  <Route path="/history" element={<HistoryHome />} />
  <Route path="/history/fbad2" element={<D2HistoryHome />} />
  <Route path="/history/fbad2/championships" element={<D2ChampionshipsPage />} />
  <Route path="/history/fbad2/awards" element={<D2AwardsPage />} />
  <Route path="/history/fbad2/season/:season" element={<D2SeasonPage />} />
  <Route path="/history/fbad2/teams" element={<D2TeamsPage />} />
  <Route path="/history/fbad2/teams/:teamId" element={<D2TeamPage />} />
  <Route path="/history/fbad2/drafts" element={<D2DraftsPage />} />
  <Route path="/history/fbad2/drafts/:season" element={<D2DraftSeasonPage />} />
  <Route path="/history/fbajc" element={<JcHistoryHome />} />
  <Route path="/history/fbajc/championships" element={<JcChampionshipsPage />} />
  <Route path="/history/fbajc/recruiting" element={<JcRecruitingPage />} />
  <Route path="/history/fbajc/awards" element={<JcAwardsHistoryPage />} />
  <Route path="/history/fbajc/season/:season" element={<JcSeasonPage />} />
  <Route path="/history/fbajc/schools" element={<JcSchoolsPage />} />
  <Route path="/history/fbajc/schools/:teamId" element={<JcSchoolPage />} />
  <Route path="/history/fbawc" element={<WcHistoryPage />} />
  <Route path="/history/fbawc/season/:season" element={<WcSeasonPage />} />
  <Route path="/history/fbawc/teams/:teamId" element={<WcTeamPage />} />
  <Route path="/history/:league/season/:season/game/:seriesId" element={<BoxScorePage />} />
  <Route path="/history/fba/championships" element={<ChampionshipsPage />} />
  <Route path="/history/fba/awards" element={<AwardsHistoryPage />} />
  <Route path="/history/fba/awards/players" element={<AwardsByPlayerPage />} />
  <Route path="/history/fba/hall-of-fame" element={<HallOfFameHistoryPage />} />
  <Route path="/history/fba/leaders" element={<LeadersPage />} />
  <Route path="/history/fba/streaks" element={<StreaksPage />} />
  <Route path="/history/fba/season/:season" element={<SeasonHistoryPage />} />
  <Route path="/history/fba/teams" element={<TeamsHistoryPage />} />
  <Route path="/history/fba/teams/:teamId" element={<FranchisePage />} />
  <Route path="/history/fba/drafts" element={<DraftsPage />} />
  <Route path="/history/fba/drafts/:season" element={<DraftSeasonPage />} />
  <Route path="/history/fba/transactions" element={<PastTransactionsPage />} />
  <Route path="/history/fba/events" element={<TimelinePage />} />
  <Route path="/history/fba/players" element={<PlayersHistoryPage />} />
  <Route path="/history/fba/players/:playerId" element={<PlayerHistoryPage />} />
  <Route path="*" element={<Placeholder title="Not found" note="That page doesn't exist." />} />
  </>,
);

export function Layout() {
  const location = useLocation();
  const page = useRoutes(ROUTES, location);
  // Key on the route pattern, not the pathname: the page fades in when you move to another page,
  // but a param-only change (another season, team or game) keeps the page mounted and its state.
  const key = matchRoutes(ROUTES, location)?.map(m => m.route.path).join('|') ?? location.pathname;
  return (
    <div className="app">
      <SiteHeader />
      <main className="main">
        <div key={key} className="page-in">{page}</div>
      </main>
    </div>
  );
}
