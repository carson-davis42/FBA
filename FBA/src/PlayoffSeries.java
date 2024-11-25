public class PlayoffSeries {
    //instance variables
    private Team home;
    private Team away;
    private int homeWins;
    private int awayWins;
    private boolean over;
    private int seriesNum;

    public PlayoffSeries(int sn, Team h, Team a, int hw, int aw) {
        seriesNum = sn;
        home = h;
        away = a;
        homeWins = hw;
        awayWins = aw;
        if (homeWins == 4) {
            over = true;
        }
        if (awayWins == 4) {
            over = true;
        }
    }

    public Team getHome() {
        return home;
    }

    public Team getAway() {
        return away;
    }

    public int getHomeWins() {
        return homeWins;
    }

    public int getAwayWins() {
        return awayWins;
    }

    public boolean isOver() {
        return over;
    }

    public void awayWin() {
        awayWins++;
        if (awayWins == 4) {
            over = true;
        }
    }

    public void homeWin() {
        homeWins++;
        if (homeWins == 4) {
            over = true;
        }
    }

    public void newHome(Team t) {
        home = t;
        homeWins = 0;
    }

    public void newAway(Team t) {
        away = t;
        awayWins = 0;
    }

    public void setHomeWins(int hw) {
        homeWins = hw;
        if (hw == 4) {
            over = true;
        }
    }

    public void setAwayWins(int aw) {
        awayWins = aw;
        if (aw == 4) {
            over = true;
        }
    }

    public Team getWinningTeam() {
        if (homeWins == 4) {
            return home;
        }
        else if (awayWins == 4) {
            return away;
        }
        return null;
    }

    public int getSeriesNum() {
        return seriesNum;
    }

    public void setSeriesNum(int sn) {
        seriesNum = sn;
    }

    public boolean ready() {
        return home != null && away != null;
    }
}
