public class Player {
    //instance variables
    private final String name;
    private String position;
    private int age;
    private int spacesForPrint;

    /**
     * constructor for a Player
     *
     * @param p pre: none
     * @param a pre: none
     */
    public Player(String n, String p, int a) {
        name = n;
        position = p;
        age = a;
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
        return sb.toString();
    }
}
