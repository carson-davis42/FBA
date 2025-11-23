package fbawc;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.*;

public class Main {
    //instance variables
    private static TreeMap<String, Team> teams;
    private static TreeMap<String, Team> teamNames;
    public static ArrayList<Team> countries;
    private static MarchMadness theBracket;
    public static boolean playoffs;
    public static int season;
    public static String host;

    public static void main(String[] args) throws IOException {
        season = 76;
        host = "Greece";
        readRosters();
        readOrMakeSchedule(true); //true if reading a schedule, true to print
        playMarchMadness();
        System.out.print("Congrats " + theBracket.getChampion().getName() + ", ");
        System.out.println("you are S" + season + " World Cup Champions!");
    }

    /**
     * send out each roster to the FBA Rosters that must be read in
     *
     * @throws IOException
     */
    public static void toFile() throws IOException {
        StringBuilder sb = new StringBuilder(teams.size() + "\n");
        //Go through each abr to find each team
        for (Team t : countries) {
            sb.append(t.getName()).append("/").append(t.getAbreviation().toUpperCase()).append("\n");
            int teamSize = t.getPlayers().length;
            sb.append(teamSize).append("\n");
            //Add each player to the long string
            for (Player p : t.getPlayers()) {
                String n = p.getName();
                String po = p.getPosition();
                int a = p.getAge();
                int r = p.getRating();
                sb.append(n).append("/").append(po).append("/").append(a).append("/").append(r).append("\n");
            }
        }
        //write the long string to the file
        File file = new File("FBAWC/FBAWCRosters");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    /**
     * read in the rosters and basic team info from the FBAD2Rosters file
     *
     * @param input pre: none
     * @throws IOException 
     */
    public static void readRosters() throws IOException {
        List<String> lines = Files.readAllLines(Paths.get("FBAWC/FBAWCRosters"), StandardCharsets.UTF_8);

        int line_num = 0;
        final int NUM_OF_TEAMS = Integer.parseInt(lines.get(line_num));
        line_num++;
        teams = new TreeMap<>();
        teamNames = new TreeMap<>();
        //Go through each team
        for (int a = 0; a < NUM_OF_TEAMS; a++) {
            String teamInfo = lines.get(line_num);
            line_num++;
            Object[] teamArray = teamInfo.split("/");
            String teamName = (String) teamArray[0];
            String teamAbr = (String) teamArray[1];
            int numOfPlayers = Integer.parseInt(lines.get(line_num));
            line_num++;
            ArrayList<Player> players = new ArrayList<>();
            //Go through each player for each team
            for (int b = 0; b < numOfPlayers; b++) {
                String playerInfo = lines.get(line_num);
                line_num++;
                Object[] playerArray = playerInfo.split("/");
                String name = (String) playerArray[0];
                String pos = (String) playerArray[1];
                int age = Integer.parseInt((String) playerArray[2]);
                int rat = Integer.parseInt((String) playerArray[3]);
                players.add(new Player(name, pos, age, rat));
            }
            Team t = new Team(teamName, players, teamAbr);
            teams.put(teamAbr.toUpperCase(), t);
            teamNames.put(teamName, t);
        }
        //add teams to their conference
        countries = new ArrayList<>();
        for (String abr : teams.keySet()) {
            Team t = teams.get(abr);
            countries.add(t);
        }
        setSeeds();
    }

    public static void makeSchedule() throws IOException {
        for (Team t: countries)
        {
            t.reset_X_names();
        }
        theBracket = new MarchMadness();
        toFileMM();
    }



    public static void readOrMakeSchedule(boolean read) throws IOException {
        if (!read) {
            Scanner keyboard = new Scanner(System.in);
            System.out.print("are you sure you want to reset the schedule(Y/N)? ");
            String answer = keyboard.nextLine().toUpperCase();
            if (answer.equals("Y")) {
                System.out.print("Password: "); //password = ressched
                answer = keyboard.nextLine();
                if (answer.equals("ressched")) {
                    makeSchedule();
                }
                else {
                    throw new IllegalArgumentException("Wrong password");
                }
            }
            else {
                throw new IllegalArgumentException("try again(maybe set read to true)");
            }
        }
    }

    private static void playMarchMadness() throws IOException {
        if (theBracket == null) {
            readMM();
            toFile();
            toFileMM();
        }
        while (theBracket.getChampion() == null) {
            makeGoodLookinMM();
            theBracket.playGame();
            toFile();
            toFileMM();
        }
        makeGoodLookinMM();
    }

    private static void readMM() throws FileNotFoundException {
        Scanner input = new Scanner(new File("FBAWC/MMStorage.txt"));
        theBracket = new MarchMadness();
        String line = input.nextLine();
        Object[] b = line.split("/");
        int gp = Integer.parseInt((String) b[1]);
        int r1 = Integer.parseInt((String) b[2]);
        int r2 = Integer.parseInt((String) b[3]);
        int r3 = Integer.parseInt((String) b[4]);
        int r4 = Integer.parseInt((String) b[5]);
        Team[][] bracket = new Team[2][63];
        for (int a = 0; a < 63; a++) {
            String line1 = input.nextLine();
            String line2 = input.nextLine();
            if (!line1.equals("--")) {
                bracket[0][a] = teamNames.get(line1);
                if (a < 60) {
                    bracket[0][a].setSeed((a % 8) + 1);
                }
            }
            if (!line2.equals("--")) {
                bracket[1][a] = teamNames.get(line2);
                if (a < 60) {
                    bracket[1][a].setSeed(((a % 8) + 8) + 1);
                }
            }
        }
        String line3 = input.nextLine();
        if (!line.equals("--")) {
            theBracket.setChampion(teamNames.get(line3));
        }
        theBracket.setBracket(bracket);
        theBracket.setAllGamesPlayed(gp, r1, r2, r3, r4);
        setSeeds();
    }

    private static void setSeeds()
    {
        ArrayList<Team> teams_to_rank = new ArrayList<>(countries);
        for (int i = teams_to_rank.size() - 1; i > -1; i--)
        {
            double best_rating = 0.0;
            Team best_team = teams_to_rank.get(0);
            for (Team t: teams_to_rank)
            {
                if (t.getRating() > best_rating)
                {
                    best_team = t;
                    best_rating = t.getRating();
                }
            }
            best_team.setSeed(64 - i);
            teams_to_rank.remove(best_team);
        }
    }

    private static void makeGoodLookinMM() throws IOException {
        StringBuilder sb = new StringBuilder();
        Team[][] bracket = theBracket.getBracket();
        sb.append("                                              --").append("S").append(season).append(" World Cup ").append(host).append("--")
                .append("\n");
        for (int a = 0; a < 60; a++) {
            if (a == 0) {
                sb.append("--Region 1--").append("\n").append("   -Round of 64-").append("\n");
            }
            else if (a == 15) {
                sb.append("\n").append("\n").append("--Region 2--").append("\n").append("   -Round of 64-").append("\n");
            }
            else if (a == 30) {
                sb.append("\n").append("\n").append("--Region 3--").append("\n").append("   -Round of 64-").append("\n");
            }
            else if (a == 45) {
                sb.append("\n").append("\n").append("--Region 4--").append("\n").append("   -Round of 64-").append("\n");
            }
            if (a == 8 || a == 23 || a == 38 || a == 53) {
                sb.append("   -Round of 32-").append("\n");
            }
            else if (a == 12 || a == 27 || a == 42 || a == 57) {
                sb.append("   -Sweet 16-").append("\n");
            }
            else if(a == 14 || a == 29 || a == 44 || a == 59) {
                sb.append("   -Elite 8-").append("\n");
            }
            Team b = bracket[0][a];
            Team c = bracket[1][a];
            if (b != null) {
                sb.append("(").append(b.getSeed()).append(")")
                        .append(b.getName());
            }
            else {
                sb.append("TBD");
            }
            sb.append(" vs ");
            if (c != null) {
                sb.append("(").append(c.getSeed()).append(")")
                        .append(c.getName());
            }
            else {
                sb.append("TBD");
            }
            sb.append("\n");
        }
        sb.append("\n");
        for (int a = 60; a < 62; a++) {
            if (a == 60) {
                sb.append("\n").append("   --Final Four--").append("\n");
            }
            Team b = bracket[0][a];
            Team c = bracket[1][a];
            if (b != null) {
                sb.append("(").append(b.getSeed()).append(")")
                        .append(b.getName());
            }
            else {
                sb.append("TBD");
            }
            sb.append(" vs ");
            if (c != null) {
                sb.append("(").append(c.getSeed()).append(")")
                        .append(c.getName());
            }
            else {
                sb.append("TBD");
            }
            sb.append("\n");
        }
        sb.append("   --National Championship--").append("\n");
        Team b = bracket[0][62];
        Team c = bracket[1][62];
        if (b != null) {
            sb.append("(").append(b.getSeed()).append(")")
                    .append(b.getName());
        }
        else {
            sb.append("TBD");
        }
        sb.append(" vs ");
        if (c != null) {
            sb.append("(").append(c.getSeed()).append(")")
                    .append(c.getName());
        }
        else {
            sb.append("TBD");
        }
        sb.append("\n");
        sb.append("   --Champions--").append("\n");
        if (theBracket.getChampion() != null) {
            sb.append(theBracket.getChampion().getName());
        }
        else {
            sb.append("TBD");
        }
        sb.append("\n").append("\n").append("\n");
        File file = new File("FBAWC/MMBrackets.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    private static void toFileMM() throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("S").append(season).append(" World Cup ").append(host).append("/")
                .append(theBracket.getGamesPlayed()).append("/").append(theBracket.getR1game())
                .append("/").append(theBracket.getR2game()).append("/")
                .append(theBracket.getR3game()).append("/").append(theBracket.getR4game())
                .append("\n");
        Team[][] bracket = theBracket.getBracket();
        for (int a = 0; a < 63; a++) {
            if (bracket[0][a] == null) {
                sb.append("--").append("\n");
            }
            else {
                sb.append(bracket[0][a].getName()).append("\n");
            }
            if (bracket[1][a] == null) {
                sb.append("--").append("\n");
            }
            else {
                sb.append(bracket[1][a].getName()).append("\n");
            }
        }
        if (theBracket.getChampion() == null) {
            sb.append("--").append("\n");
        }
        else {
            sb.append(theBracket.getChampion().getName()).append("\n");
        }
        File file = new File("FBAWC/MMStorage.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
        makeGoodLookinMM();
    }
}