package fbad2;
public class Player {
    //instance variables
    private final String name;
    private String position;
    private int age;
    private int spacesForPrint;
    private int rating;
    private int points;
    private double PPG;
    private Team team;

    /**
     * constructor for a Player
     *
     * @param p pre: none
     * @param a pre: none
     */
    public Player(String n, String p, int a, int r, int po) {
        name = n;
        position = p;
        age = a;
        rating = r;
        points = po;
    }

    /**
     * @return the player's name
     */
    public String getName() {
        return name;
    }

    /**
     * @return the player's position
     */
    public String getPosition() {
        return position;
    }

    /**
     * @return the player's age
     */
    public int getAge() {
        return age;
    }

    public int getRating() {
        return rating;
    }

    public int getPoints() {
        return points;
    }

    public void setPoints (int p) {points = p;}

    public void addPoints(int p) {
        points += p;
    }

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

    public void setSpaces(int s) {
        spacesForPrint = s;
    }

//    /**
//     * @param o the object to be compared.
//     * @return the compare value between the two players
//     */
//    @Override
//    public int compareTo(Player o) {
//        if (getRating() > o.getRating()) {
//            return -1;
//        }
//        else if (getRating() < o.getRating()) {
//            return 1;
//        }
//        return 0;
//    }

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
        sb.append("  age:").append(age);
        sb.append("  rating:").append(rating);
        return sb.toString();
    }
}
