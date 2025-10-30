package fbajc;
public class Player implements Comparable<Player> {
    //instance variables
    private final String name;
    private String rating;
    private String position;
    private String grade;
    public int cur_rating;
    public int points;
    public int most_recent_points;
    private int grComp;

    private Team team;
    private double PPG;
    private int spacesForPrint;

    /**
     * constructor for a Player
     *
     * @param r pre: none
     * @param p pre: none
     * @param n pre: none
     * @param g pre: none
     */
    public Player(String n, String p, String r, String g, int cr, int po) {
        name = n;
        position = p;
        rating = r;
        grade = g;
        cur_rating = cr;
        points = po;
        most_recent_points = 0;
        if (grade.equals("Sr")) {
            grComp = 4;
        }
        if (grade.equals("Jr")) {
            grComp = 3;
        }
        if (grade.equals("So")) {
            grComp = 2;
        }
        if (grade.equals("Fr")) {
            grComp = 1;
        }
    }

    /**
     * @return the player's name
     */
    public String getName() {
        return name;
    }

    /**
     * @return the player's rating
     */
    public String getRating() {
        return rating;
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
    public String getGrade() {
        return grade;
    }

    public void addPoints(int p) {
        points += p;
        most_recent_points = p;
    }
    public void setPoints (int p) {
        points = p;
        most_recent_points = 0;
    }

    public void newPPG (int games) {
        PPG = ((double) points) / ((double) games);
    }

    public double getPPG () {
        return PPG;
    }

    public void setTeam (Team t) {
        team = t;
    }

    public Team getTeam () {
        return team;
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
        if (cur_rating > o.cur_rating) {
            return -1;
        }
        else if (cur_rating < o.cur_rating) {
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
        sb.append("  class:").append(grade).append("(")
                .append(rating).append(")");
        if (rating.equals("X")) {
            sb.append("   ");
        }
        else {
            sb.append("  ");
        }
        sb.append("rating: ").append(cur_rating);
        return sb.toString();
    }
}
