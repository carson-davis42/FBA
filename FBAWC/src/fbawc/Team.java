package fbawc;
import java.util.*;

public class Team implements Comparable<Team> {
    //instance variables
    private final String name;
    private final String abreviation;
    private Player[] players;
    public ArrayList<Player> roster;
    private int win;
    private int loss;
    private double winPerc;
    private String conference;
    private int seed;

    /**
     * create a team and all values
     *
     * @param n pre: none
     * @param p pre: none
     */
    public Team(String n, ArrayList<Player> p, String a) {
        name = n;
        roster = new ArrayList<>();
        abreviation = a;
        win = 0;
        loss = 0;
        winPerc = 0.0;
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
                int c_rat = (int) (Math.random() * 10) + 65;
                if (i == 0) {
                    roster.add (new Player("X", "PG", 32, c_rat));
                }
                else if (i == 1) {
                    roster.add (new Player("X", "SG", 32, c_rat));
                }
                else if (i == 2) {
                    roster.add (new Player("X", "SF", 32, c_rat));
                }
                else if (i == 3) {
                    roster.add (new Player("X", "PF", 32, c_rat));
                }
                else {
                    roster.add (new Player("X", "C", 32, c_rat));
                }
            }
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
    /*
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
     */

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
        sb.append("       -").append(name).append("-").append("\n");
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
    public void setWin(int w) {
        win = w;
    }

    /**
     * set loss
     *
     * @param l pre: none
     */
    public void setLoss(int l) {
        loss = l;
    }

    public double getWinPerc() {
        if (win + loss > 0) {
            return ((double) win) / ((double) (win + loss));
        }
        return 0.0;
    }

    public boolean isBetterThan(Team t, boolean finalDec) {
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
        if (finalDec && !t.equals(this)) {
            Scanner keyboard = new Scanner(System.in);
            System.out.println("Tiebreaker:");
            System.out.println(displayToString());
            System.out.println(t.displayToString());
            System.out.println();
            System.out.println("(" + getWin() + "-" + getLoss() + ")" + getName()
                    + " vs " + t.getName() + "(" + t.getWin() + "-" + t.getLoss() + ")");
            System.out.print("Who wins(type team abreviation): ");
            boolean valid = false;
            boolean thisWin = false;
            while (!valid) {
                String answer = keyboard.nextLine().toUpperCase();
                if (answer.equals(getAbreviation())) {
                    valid = true;
                    thisWin = true;
                }
                else if (answer.equals(t.getAbreviation())) {
                    valid = true;
                }
                else {
                    System.out.print("not valid, try again: ");
                }
            }
            return thisWin;
        }
        return true;
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

    public void setSeed(int s) {
        seed = s;
    }

    public int getSeed() {
        return seed;
    }

    public double getRating()
    {
        double average = 0.0;
        for (Player p: roster)
        {
            average += p.getRating();
        }
        return average / 5.0;
    }

    public void reset_X_names()
    {
        for (Player p: roster)
        {
            if (p.getName().equals("X"))
            {
                p.setRating((int) (Math.random() * 10) + 65);
            }
        }
    }
}
