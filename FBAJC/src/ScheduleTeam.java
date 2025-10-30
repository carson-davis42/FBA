import java.util.*;

public class ScheduleTeam implements Comparable<ScheduleTeam> {
    //instance variables
    private Team team;
    private String conf;
    private int gamesLeft;
    private int homeGamesLeft;
    private int awayGamesLeft;
    private HashMap<Team, Integer> home;
    private HashMap<Team, Integer> away;

    /**
     * creates a ScheduleTeam
     */
    public ScheduleTeam(Team t, String c, ArrayList<Team> con) {
        gamesLeft = 22;
        homeGamesLeft = 11;
        awayGamesLeft = 11;
        TreeMap<Team, Integer> opponents = new TreeMap<>();
        //find home games
        home = new HashMap<>();
        //find away games
        away = new HashMap<>();
        for (Team te : con) {
            if (!te.equals(t)) {
                home.put(te, 1);
                away.put(te, 1);
            }
        }
        team = t;
        conf = c;
    }

    public int alreadyPlayedAtHome (Team t) {
        return home.get (t);
    }

    public int alreadyPlayedAway (Team t) {
        return away.get (t);
    }

    public boolean moreGames() {
        return gamesLeft != 0;
    }

    public int getGamesLeft() {
        return gamesLeft;
    }

    public boolean noHomeGames() {
        return homeGamesLeft == 0;
    }

    public boolean noAwayGames() {
        return awayGamesLeft == 0;
    }

    public int getAwayGamesLeft() {
        return awayGamesLeft;
    }

    public int getHomeGamesLeft() {
        return homeGamesLeft;
    }

    public Team findHomeOpp() {
        int random = (int) (Math.random() * home.size());
        ArrayList<Team> teamsList = new ArrayList<>(home.keySet());
        Team opp = teamsList.get(random);
//        gamesLeft--;
//        homeGamesLeft--;
//        home.put(opp, home.get(opp) - 1);
//        if (home.get(opp) <= 0) {
//            home.remove(opp);
//        }
        return opp;
    }

    public Team findAwayOpp() {

        int random = (int) (Math.random() * away.size());
        ArrayList<Team> teamsList = new ArrayList<>(away.keySet());
        Team opp = teamsList.get(random);
//        gamesLeft--;
//        awayGamesLeft--;
//        away.put(opp, away.get(opp) - 1);
//        if (away.get(opp) <= 0) {
//            away.remove(opp);
//        }
        return opp;
    }

    public Team getTeam() {
        return team;
    }

    public void adjustSchedule(Team opp, boolean homeT) {
        if (homeT) {
            int gl = home.get(opp);
            gl--;
            if (gl > 0) {
                home.put(opp, gl);
            }
            else {
                home.remove(opp);
            }
            homeGamesLeft--;
        }
        else {
            int gl = away.get(opp);
            gl--;
            if (gl > 0) {
                away.put(opp, gl);
            }
            else {
                away.remove(opp);
            }
            awayGamesLeft--;
        }
        gamesLeft--;
    }

    public HashMap<Team, Integer> getHome() {
        return home;
    }

    public HashMap<Team, Integer> getAway() {
        return away;
    }

    @Override
    public int compareTo(ScheduleTeam o) {
        if (gamesLeft < o.gamesLeft) {
            return 1;
        }
        else if (gamesLeft > o.gamesLeft) {
            return -1;
        }
        int r = (int) (Math.random() * 2);
        if (r == 0) {
            return -1;
        }
        return 1;
    }
}
