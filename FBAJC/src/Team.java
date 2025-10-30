import java.util.*;

public class Team implements Comparable<Team> {
    //instance variables
    private final String name;
    private final String abreviation;
    private Player[] players;
    public PriorityQueue<Player> roster;
    private PriorityQueue<Player> reserves;
    private int win;
    private int loss;
    private int conWin;
    private int conLoss;
    private double conWinPerc;
    private String conference;
    private List<Team> conf;
    private int seed;
    private int conf_seed = 0;

    /**
     * create a team and all values
     *
     * @param n pre: none
     * @param p pre: none
     */
    public Team(String n, PriorityQueue<Player> p, String a, String c) {
        name = n;
        roster = new PriorityQueue<>();
        reserves = new PriorityQueue<>();
        abreviation = a;
        conference = c;
        conf = new ArrayList<>();
        win = 0;
        conWin = 0;
        conLoss = 0;
        loss = 0;
        seed = 0;
        conWinPerc = 0.0;
        Iterator<Player> pit = p.iterator();
        int index = 0;
        boolean[] positions = new boolean[5];
        //Add top 5 players to the roster
        while (pit.hasNext() && index < 5) {
            Player curPlayer = pit.next();
            pit.remove();
            roster.add(curPlayer);
            index++;
            switch (curPlayer.getPosition()) {
                case "PG":
                    positions[0] = true;
                    break;
                case "SG":
                    positions[1] = true;
                    break;
                case "SF":
                    positions[2] = true;
                    break;
                case "PF":
                    positions[3] = true;
                    break;
                default:
                    positions[4] = true;
                    break;
            }
        }
        for (int i = 0; i < 5; i++) {
            if (!positions[i]) {
                int c_rat;
                if (c.equals("B12") || c.equals("ACC") ||
                        c.equals("BE") || c.equals("SEC") ||
                        c.equals("B10") || c.equals("P12")) {
                    c_rat = (int) (Math.random() * 13) + 60;
                }
                else if (c.equals("AAC") || c.equals("A10") ||
                        c.equals("MWC")) {
                    c_rat = (int) (Math.random() * 13) + 58;
                }
                else {
                    c_rat = (int) (Math.random() * 13) + 55;
                }
                String clas = "Fr";
                if (i == 0) {
                    roster.add (new Player("X", "PG", "X", clas, c_rat, 0));
                }
                else if (i == 1) {
                    roster.add (new Player("X", "SG", "X", clas, c_rat, 0));
                }
                else if (i == 2) {
                    roster.add (new Player("X", "SF", "X", clas, c_rat, 0));
                }
                else if (i == 3) {
                    roster.add (new Player("X", "PF", "X", clas, c_rat, 0));
                }
                else {
                    roster.add (new Player("X", "C", "X", clas, c_rat, 0));
                }
            }
        }
        //Add everyone else to the reserves
        while (pit.hasNext()) {
            Player curPlayer = pit.next();
            pit.remove();
            reserves.add(curPlayer);
        }
        //assign one, two, three, four, and five
        putPlayersInPositions();
        for (Player play: roster) {
            play.setTeam(this);
        }
    }

    /**
     * assign the players given to one, two, three, four, and five
     */
    private void putPlayersInPositions() {
        ArrayList<Player> PG = new ArrayList<>();
        ArrayList<Player> SG = new ArrayList<>();
        ArrayList<Player> SF = new ArrayList<>();
        ArrayList<Player> PF = new ArrayList<>();
        ArrayList<Player> C = new ArrayList<>();
        final int NUM_OF_PLAYERS = 5;
        //Sort the players by position
        for (Player p : roster) {
            if (p.getPosition().equals("PG")) {
                PG.add(p);
            }
            else if (p.getPosition().equals("SG")) {
                SG.add(p);
            }
            else if (p.getPosition().equals("SF")) {
                SF.add(p);
            }
            else if (p.getPosition().equals("PF")) {
                PF.add(p);
            }
            else {
                C.add(p);
            }
        }
        //Add the in order players to inOrder
        ArrayList<Player> inOrder = new ArrayList<>(PG);
        inOrder.addAll(SG);
        inOrder.addAll(SF);
        inOrder.addAll(PF);
        inOrder.addAll(C);
        //assign players to the teams spots
        players = new Player[NUM_OF_PLAYERS];
        for (int a = 0; a < NUM_OF_PLAYERS && a < inOrder.size(); a++) {
            players[a] = inOrder.get(a);
        }
    }

    /**
     * @return the list of players in position order for a team
     */
    public Player[] getPlayers() {
        return players;
    }

    /**
     * @return the list of reserves
     */
    public PriorityQueue<Player> getReserves() {
        return reserves;
    }

    /**
     * @return the team's abreviation
     */
    public String getAbreviation() {
        return abreviation;
    }

    /**
     * @return the team's name
     */
    public String getName() {
        return name;
    }

    public void setConf(List<Team> con) {
        conf = con;
    }

    public List<Team> getConf() {
        return conf;
    }

    /**
     * @return a string representation of the Team
     */
    public String toString() {
        //Give each player their spaces for printing
        int longest = 0;
        for (Player pl : players) {
            if (pl.getName().length() > longest) {
                longest = pl.getName().length();
            }
        }
        for (Player pl : players) {
            pl.setSpaces(longest);
        }
        StringBuilder sb = new StringBuilder("       -" + name + "-" + "\n" +
                "Conference: " + conference + "\n" + "   -Roster-" + "\n");
        //add the starters
        if (players[0] == null) {
            sb.append("none").append("\n");
        }
        else {
            for (Player p : players) {
                sb.append(p).append("\n");
            }
        }
        return sb.toString();
    }

    /**
     * @return a display string representation of the Team
     */
    public String displayToString() {
        //Give each player their spaces for printing
        int longest = 0;
        for (Player pl : roster) {
            if (pl.getName().length() > longest) {
                longest = pl.getName().length();
            }
        }
        for (Player pl : roster) {
            pl.setSpaces(longest);
        }
        StringBuilder sb = new StringBuilder();
        int rank;
        if (Main.confTournies) {
            if (conf_seed != 0) {
                rank = conf_seed;
            }
            else {
                rank = conf.indexOf(this) + 1;
            }
        }
        else if (Main.marchMadness) {
            rank  = seed;
        }
        else {
            rank = Main.inRanks.indexOf(this) + 1;
        }
        if (Main.inRanks.contains(this) || Main.confTournies || Main.marchMadness) {
            sb.append("       -").append("(").append(rank).append(")")
                    .append(name).append("-").append("\n");
        }
        else {
            sb.append("       -").append(name).append("-").append("\n");
        }
        //add the starters
        if (players[0] == null) {
            sb.append("none").append("\n");
        }
        else {
            int player = 0;
            for (Player p : players) {
                if (players[player] != null) {
                    sb.append(p).append("\n");
                }
                player++;
            }
        }
        return sb.toString();
    }

    /**
     * @return win
     */
    public int getWin() {
        return win;
    }

    /**
     * @return loss
     */
    public int getLoss() {
        return loss;
    }

    /**
     * @return conference
     */
    public String getConference() {
        return conference;
    }

    /**
     * set win
     *
     * @param w pre: none
     */
    public void setWin(int w, boolean sameConf) {
        win = w;
        if (sameConf) {
            conWin++;
        }
    }

    public int getConWin() {
        return conWin;
    }

    public void setConWin(int cw) {
        conWin = cw;
    }

    public int getConLoss() {
        return conLoss;
    }

    public void setConLoss(int cl) {
        conLoss = cl;
    }

    /**
     * set loss
     *
     * @param l pre: none
     */
    public void setLoss(int l, boolean sameConf) {
        loss = l;
        if (sameConf) {
            conLoss++;
        }
    }

    public double getWinPerc() {
        if (win + loss > 0) {
            return ((double) win) / ((double) (win + loss));
        }
        return 0.0;
    }

    public int getSeed() {
        return seed;
    }

    public void setSeed(int s) {
        seed = s;
    }

    public void setConfSeed(int s) {
        conf_seed = s;
    }

    public int getConfSeed() {
        return conf_seed;
    }

    public boolean isBetterThan(Team t) {
        double gb = ((getConWin() - t.getConWin()) + (t.getConLoss() - getConLoss())) / 2.0;
        if (gb > 0) {
            return true;
        }
        else if (gb < 0) {
            return false;
        }
        if (getConWin() + getConLoss() < t.getConWin() + t.getConLoss()) {
            return true;
        }
        else if (getConWin() + getConLoss() > t.getConWin() + t.getConLoss()) {
            return false;
        }
        if ((((double) getWin()) / ((double) (getWin() + getLoss()))) > (((double) t.getWin()) /
                ((double) (t.getWin() + t.getLoss())))) {
            return true;
        }
        else if ((((double) getWin()) / ((double) (getWin() + getLoss()))) < (((double) t.getWin())
                / ((double) (t.getWin() + t.getLoss())))) {
            return false;
        }
        if (Main.rankings.contains(this) && Main.rankings.contains(t)) {
            return Main.rankings.indexOf(this) < Main.rankings.indexOf(t);
        }
        return Main.rankings.contains(this);
    }

    @Override
    public int compareTo(Team o) {
        if (conWinPerc > o.conWinPerc) {
            return -3;
        }
        else if (conWinPerc < o.conWinPerc) {
            return 3;
        }
        else {
            if ((win + loss) > (o.win + o.loss)) {
                return 2;
            }
            else if ((win + loss) < (o.win + o.loss)) {
                return -2;
            }
        }
        int rand = (int) (Math.random() * 2);
        if (rand == 0) {
            return -1;
        }
        else if (rand == 1) {
            return 1;
        }
        return name.compareTo(o.getName());
    }
}
