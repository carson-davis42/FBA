package fbad2;
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

    /**
     * create a team and all values
     *
     * @param n pre: none
     * @param p pre: none
     */
    public Team(String n, ArrayList<Player> p, String a, String c) {
        name = n;
        roster = new ArrayList<>();
        abreviation = a;
        conference = c;
        win = 0;
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
        if (Main.playoffs) {
            if (conference.equals("PL")) {
                rank = Main.PL.indexOf(this) + 1;
            }
            else if (conference.equals("WL")){
                rank = Main.WL.indexOf(this) + 1;
            }
            else if (conference.equals("UL")){
                rank = Main.UL.indexOf(this) + 1;
            }
            else {
                rank = Main.IL.indexOf(this) + 1;
            }
        }
        if (Main.playoffs) {
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

    public boolean isBetterThan(Team two, boolean finalDec) {
        double gb = ((getWin() - two.getWin()) + (two.getLoss() - getLoss())) / 2.0;
        if (gb > 0) {
            return true;
        }
        else if (gb < 0) {
            return false;
        }
        if (getWin() + getLoss() < two.getWin() + two.getLoss()) {
            return true;
        }
        else if (getWin() + getLoss() > two.getWin() + two.getLoss()) {
            return false;
        }
        if (finalDec && !two.equals(this)) {
            Scanner keyboard = new Scanner(System.in);
            System.out.println("Tiebreaker:");
            System.out.println(displayToString());
            System.out.println(two.displayToString());
            System.out.println("--" + getConference() + "--");
            System.out.println("(" + getWin() + "-" + getLoss() + ")" + getName()
                    + " vs " + two.getName() + "(" + two.getWin() + "-" + two.getLoss() + ")");
            boolean sameConf = getConference().equals(two.getConference());
            System.out.print("Start Game? (Simulate through with 'G') ");
            String answer = keyboard.nextLine();
            boolean skip = false;
            if (answer.equals("G")) {
                skip = true;
            }
            ArrayList<Player> oneRoster = new ArrayList<>(roster);
            int[] onePlayerPoints = new int[5];
            ArrayList<Player> twoRoster = new ArrayList<>(two.roster);
            int[] twoPlayerPoints = new int[5];
            ArrayList<Player> possession = oneRoster;
            ArrayList<Player> defense = twoRoster;
            int OTCount = 0;
            int onePoints = 0;
            int twoPoints = 0;
            int endGamePoss = 120;
            boolean score = false;
            //Runs through a game
            for (int i = 0; i < endGamePoss; i++) {
                if (i == 30 && !skip) {
                    System.out.print("End of the 1st: " + getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
                    keyboard.nextLine();
                }
                else if (i == 60 && !skip) {
                    System.out.print("Halftime: " + getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
                    keyboard.nextLine();
                }
                else if (i == 90 && !skip) {
                    System.out.print("End of the 3rd: " + getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
                    keyboard.nextLine();
                }
                else if (i > 109 && Math.abs(onePoints - twoPoints) <= (((endGamePoss-i+1)/2) * 3) && !skip) {
                    System.out.print(endGamePoss-i + " Possessions left: " + getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints + ", ");
                    if (i%2 == 0) {
                        System.out.print(getAbreviation() + " Possession");
                    }
                    else {
                        System.out.print(two.getAbreviation() + " Possession");
                    }
                    keyboard.nextLine();
                }
                else if (i == 120 && !skip) {
                    System.out.print("End of the Regulation: " + getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
                    keyboard.nextLine();
                }
                else if (i%10 == 0 && i > 120 && !skip) {
                    System.out.print("End of " + OTCount + "OT: " + getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
                    keyboard.nextLine();
                }
                if (i % 2 == 0) {
                    possession = oneRoster;
                    defense = twoRoster;
                }
                else {
                    possession = twoRoster;
                    defense = oneRoster;
                }
                int getBallTo = 0;
                for (Player p : possession) {
                    getBallTo += p.getRating();
                }
                getBallTo -= 300;
                int whoGetsBall = (int) (Math.random() * getBallTo) + 1;
                boolean found = false;
                int totalRating = 0;
                Player playerWithBall = possession.get(0);
                for (Player p : possession) {
                    totalRating += (p.getRating() - 60);
                    if (!found && totalRating >= whoGetsBall) {
                        found = true;
                        playerWithBall = p;
                    }
                }
                Player defender = defense.get(0);
                for (Player p : defense) {
                    if (Objects.equals(p.getPosition(), playerWithBall.getPosition())) {
                        defender = p;
                    }
                }
                int def_effect = playerWithBall.getRating() - (int) (0.45 * defender.getRating()) + 10;
                int oddsToMake = Math.max(35, Math.min(65, def_effect));
                int madeScore = (int) (Math.random() * 100) + 1;
                int pointsScored = 0;
                if (oddsToMake >= madeScore) {
                    madeScore = Math.abs(madeScore - oddsToMake);
                    if (madeScore >= 30) {
                        pointsScored = 3;
                    }
                    else {
                        pointsScored = 2;
                    }
                    if (i > 109 && Math.abs(onePoints - twoPoints) <= (((endGamePoss-i+1)/2) * 3) && !skip) {
                        Team t = this;
                        if (i % 2 == 1) {
                            t = two;
                        }
                        System.out.print(playerWithBall.getName() + " scores " + pointsScored + " for " + t.getAbreviation() + "!");
                        keyboard.nextLine();
                    }
                }
                if (i % 2 == 0) {
                    onePoints += pointsScored;
                    onePlayerPoints[oneRoster.indexOf(playerWithBall)] += pointsScored;
                }
                else {
                    twoPoints += pointsScored;
                    twoPlayerPoints[twoRoster.indexOf(playerWithBall)] += pointsScored;
                }
                if (i %10 == 9 && onePoints == twoPoints && i >= 119) {
                    endGamePoss += 10;
                    OTCount++;
                }
            }
            System.out.println();
            System.out.println(getName() + ": ");
            for (int i = 0; i < 5; i++) {
                Player p = oneRoster.get(i);
                System.out.println("(" + p.getPosition() + ")" + p.getName() + ": " + onePlayerPoints[i]);
                oneRoster.get(i).addPoints(onePlayerPoints[i]);
            }
            System.out.println();
            System.out.println(two.getName() + ": ");
            for (int i = 0; i < 5; i++) {
                Player p = twoRoster.get(i);
                System.out.println("(" + p.getPosition() + ")" + p.getName() + ": " + twoPlayerPoints[i]);
                twoRoster.get(i).addPoints(twoPlayerPoints[i]);
            }

            boolean thisWin = false;
            if (onePoints > twoPoints) {
                thisWin = true;
            }

            System.out.println();
            System.out.print("Final Score: " + getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
            if (OTCount > 0) {
                if (OTCount > 1) {
                    System.out.println("(" + OTCount + "OT)");
                }
                else {
                    System.out.println("(OT)");
                }
            }
            else {
                System.out.println();
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
}
