package fba;
import java.util.*;

public class Team implements Comparable<Team> {
    //instance variables
    private final String name;
    private final String abreviation;
    private int moneySpent;
    private Player[] players;
    public PriorityQueue<Player> roster;
    private PriorityQueue<Player> reserves;
    private int win;
    private int loss;
    private int conWin;
    private int conLoss;
    private double winPerc;
    private String conference;
    private Map<Team, Integer> HTH;

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
        HTH = new HashMap<>();
        win = 0;
        conWin = 0;
        conLoss = 0;
        loss = 0;
        winPerc = 0.0;
        Iterator<Player> pit = p.iterator();
        int index = 0;
        //Add top 5 players to the roster
        while (pit.hasNext() && index < 5) {
            Player curPlayer = pit.next();
            pit.remove();
            roster.add(curPlayer);
            index++;
        }
        //Add everyone else to the reserves
        while (pit.hasNext()) {
            Player curPlayer = pit.next();
            pit.remove();
            reserves.add(curPlayer);
        }
        //assign one, two, three, four, and five
        putPlayersInPositions();
        //get money spent
        for (Player pl : roster) {
            moneySpent += pl.getCost();
        }
        for (Player pl : reserves) {
            moneySpent += pl.getCost();
        }
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
                "Money Spent: $" + moneySpent + "\n" + "   -Starters-" + "\n");
        //add the starters
        if (players[0] == null) {
            sb.append("none").append("\n");
        }
        else {
            for (Player p : players) {
                sb.append(p).append("\n");
            }
        }
        //add the reserves
        sb.append("   -Reserves-").append("\n");
        if (reserves.isEmpty()) {
            sb.append("none");
        }
        else {
            for (Player p : reserves) {
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
        int rank = 0;
        if (Main.playoffs) {
            if (conference.equals("E")) {
                rank = Main.eastern.indexOf(this) + 1;
            }
            else {
                rank = Main.western.indexOf(this) + 1;
            }
        }
        else {
            rank = Main.inRanks.indexOf(this) + 1;
        }
        if (Main.inRanks.contains(this) || Main.playoffs) {
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
            for (Player p : players) {
                sb.append(p).append("\n");
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

    public int getConLoss() {
        return conLoss;
    }

    public void setConWin(int cw) {
        conWin = cw;
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

    public boolean isBetterThan(Team t) {
        double gb = ((getWin() - t.getWin()) + (t.getLoss() - getLoss())) / 2.0;
        if (gb > 0) {
            return true;
        }
        else if (gb < 0) {
            return false;
        }
        if (getWin() + getLoss() < t.getWin() + t.getLoss()) {
            return true;
        }
        else if (getWin() + getLoss() > t.getWin() + t.getLoss()) {
            return false;
        }
        if (conference.equals(t.getConference())) {
            if (getConWin() > t.getConWin()) {
                return true;
            }
            else if (getConWin() < t.getConWin()) {
                return false;
            }
        }
        if (HTH.containsKey(t)) {
            if (HTH.get(t) > t.getHTH().get(this)) {
                return true;
            }
            else if (HTH.get(t) < t.getHTH().get(this)) {
                return false;
            }
        }
        if (Main.rankings.contains(this) && Main.rankings.contains(t)) {
            return Main.rankings.indexOf(this) < Main.rankings.indexOf(t);
        }
        return Main.rankings.contains(this);
    }

    @Override
    public int compareTo(Team o) {
        if (winPerc > o.winPerc) {
            return -3;
        }
        else if (winPerc < o.winPerc) {
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

    public Map<Team, Integer> getHTH() {
        return HTH;
    }

    public void setHTH(HashMap<Team, Integer> hth) {
        HTH = hth;
    }
}
