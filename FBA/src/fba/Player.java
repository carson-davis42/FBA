package fba;

public class Player implements Comparable<Player> {
    //instance variables
    private final String name;
    private int rating;
    private String position;
    private Team team;
    private int age;
    private int contractLen;
    private int cost; //the cost of the player's contract
    private int points;
    private double PPG;
    private int spacesForPrint;

    /**
     * constructor for a Player
     *
     * @param r pre: none
     * @param p pre: none
     * @param a pre: none
     * @param l pre: none
     * @param c pre: none
     */
    public Player(String n, int r, String p, int a, int l, int c, int po) {
        name = n;
        rating = r;
        position = p;
        age = a;
        contractLen = l;
        cost = c;
        points = po;
    }

    /**
     * @return the player's name
     */
    public String getName() {
        return name;
    }

    /**
     * add a player's points from a game
     * @param p
     */
    public void addPoints(int p) {
        points += p;
    }

    public void setPoints (int p) {points = p;}


    public void newPPG(double gamesPlayed) {
        if (gamesPlayed == 0) {
            PPG = 0;
        }
        else {
            PPG = (double) points / gamesPlayed;
        }
    }

    public double getPPG() {
        return PPG;
    }

    /**
     *
     * @param t
     */
    public void setTeam (Team t) {
        team = t;
    }

    /**
     *
     * @return team
     */
    public Team getTeam () {
        return team;
    }

    /**
     * @return the player's rating
     */
    public int getRating() {
        return rating;
    }

    /**
     * @return the player's position
     */
    public String getPosition() {
        return position;
    }

    /**
     *
     * @return player's season points
     */
    public int getPoints() {return points;}

    /**
     * @return the player's age
     */
    public int getAge() {
        return age;
    }

    /**
     * @return the player's contract length
     */
    public int getContractLen() {
        return contractLen;
    }

    /**
     * @return the cost of the player's contract
     */
    public int getCost() {
        return cost;
    }

    public void setSpaces(int s) {
        spacesForPrint = s;
    }

    /**
     * @param o the object to be compared.
     * @return the compare value between the two players
     */
    @Override
    public int compareTo(Player o) {
        if (getRating() > o.getRating()) {
            return -1;
        }
        else if (getRating() < o.getRating()) {
            return 1;
        }
        return 0;
    }

    /**
     * @return a string representation of this player
     */
    public String toString() {
        StringBuilder sb = new StringBuilder(name + ":");
        for (int a = name.length(); a < spacesForPrint; a++) {
            sb.append(" ");
        }
        sb.append("  pos:").append(position);
        if (position.equals("C")) {
            sb.append(" ");
        }
        sb.append("  age:").append(age).append("  rating:")
                .append(rating).append("  contract:").append(contractLen)
                .append("yr/$").append(cost);
        return sb.toString();
    }
}
