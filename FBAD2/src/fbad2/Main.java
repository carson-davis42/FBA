package fbad2;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.text.DecimalFormat;
import java.util.*;
import java.util.concurrent.ArrayBlockingQueue;

public class Main {
    //instance variables
    private static TreeMap<String, Team> teams;
    private static TreeMap<String, Team> teamNames;
    public static ArrayList<Team> PL;
    public static ArrayList<Team> WL;
    public static ArrayList<Team> UL;
    public static ArrayList<Team> IL;
    private static Team[][] schedule;
    private static int gamesPlayed;
    private static final int TOTAL_NUM_OF_GAMES = 960;
    private static final int TOTAL_NUM_PER_PL_WL = 30;
//    private static final int TOTAL_NUM_PER_UL = 22;
    private static boolean startInPlayoffs;
    public static String tiebreakersComplete;
    private static ArrayList<PlayoffSeries> seriesPL;
    private static ArrayList<PlayoffSeries> seriesWL;
    private static ArrayList<PlayoffSeries> seriesUL;
    private static ArrayList<PlayoffSeries> seriesIL;
    public static boolean playoffs;
    private static ArrayBlockingQueue<PlayoffSeries> seriesQueue;
    private static boolean gamePlayed;

    public static void main(String[] args) throws IOException {
        int season = 75;
        Scanner keyboard = new Scanner(System.in);
        readRosters();
        readOrMakeSchedule(true, false); //true if reading a schedule, true to print
        readOrResetRecords(true); //true is reading in records
        playoffs = false;
        gamePlayed = false;
        seriesPL = new ArrayList<>();
        seriesWL = new ArrayList<>();
        seriesUL = new ArrayList<>();
        seriesIL = new ArrayList<>();
        for (int a = 0; a < 7; a++) {
            seriesPL.add(new PlayoffSeries(a, null, null, 0, 0));
            seriesWL.add(new PlayoffSeries(a, null, null, 0, 0));
            seriesUL.add(new PlayoffSeries(a, null, null, 0, 0));
            seriesIL.add(new PlayoffSeries(a, null, null, 0, 0));
        }
//        randomizeWL(0); //debugger that simulates to specified game
        playGames(keyboard);
        startInPlayoffs = false;
        if (tiebreakersComplete.equals("Y") && !gamePlayed) {
            startInPlayoffs = true;
        }
        playoffs(keyboard);
        System.out.print("Congrats " + seriesPL.get(seriesPL.size() - 1)
                .getWinningTeam().getName() + ", ");
        System.out.println("you are S" + season + " Premier League Champions!");
        System.out.print("Congrats " + seriesWL.get(seriesWL.size() - 1)
                .getWinningTeam().getName() + ", ");
        System.out.println("you are S" + season + " World League Champions!");
        System.out.print("Congrats " + seriesUL.get(seriesUL.size() - 1)
                .getWinningTeam().getName() + ", ");
        System.out.println("you are S" + season + " United League Champions!");
        System.out.print("Congrats " + seriesIL.get(seriesIL.size() - 1)
                .getWinningTeam().getName() + ", ");
        System.out.println("you are S" + season + " International League Champions!");
        System.out.println("Reset to start S" + (season + 1));
    }

    /**
     * a test to debug the search of teams
     *
     * @param keyboard pre: none
     */
    private static void testScanner(Scanner keyboard) {
        System.out.print("Which team? ");
        String w = keyboard.nextLine();
        while (!teams.containsKey(w)) {
            System.out.print("error, try again: ");
            w = keyboard.nextLine().toUpperCase();
        }
        System.out.println(teams.get(w));
    }

    /**
     * send out each roster to the FBA Rosters that must be read in
     *
     * @throws IOException
     */
    private static void toFile() throws IOException {
        StringBuilder sb = new StringBuilder(teams.size() + "\n");
        //Go through each abr to find each team
        for (String abr : teams.keySet()) {
            Team t = teams.get(abr);
            sb.append(t.getName()).append("/").append(abr.toUpperCase()).append("/")
                    .append(t.getConference()).append("\n");
            int teamSize = t.getPlayers().length;
            sb.append(teamSize).append("\n");
            //Add each player to the long string
            for (Player p : t.getPlayers()) {
                String n = p.getName();
                String po = p.getPosition();
                int a = p.getAge();
                sb.append(n).append("/").append(po).append("/").append(a).append("\n");
            }
        }
        //write the long string to the file
        File file = new File("FBAD2/FBAD2Rosters");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    /**
     * send out each record to the file that must be read in
     *
     * @throws IOException
     */
    public static void toFileWL() throws IOException {
        StringBuilder sb = new StringBuilder("-Premier League-" + "\n" + "\n");
        for (Team t : PL) {
            sb.append(t.getName()).append(": ").append(t.getWin()).
                    append("-").append(t.getLoss()).append("\n");
        }
        sb.append("\n" + "-World League-" + "\n" + "\n");
        for (Team t : WL) {
            sb.append(t.getName()).append(": ").append(t.getWin()).
                    append("-").append(t.getLoss()).append("\n");
        }
        sb.append("\n" + "-United League-" + "\n" + "\n");
        for (Team t : UL) {
            sb.append(t.getName()).append(": ").append(t.getWin()).
                    append("-").append(t.getLoss()).append("\n");
        }
        sb.append("\n" + "-International League-" + "\n" + "\n");
        for (Team t : IL) {
            sb.append(t.getName()).append(": ").append(t.getWin()).
                    append("-").append(t.getLoss()).append("\n");
        }
        File file = new File("FBAD2/records");
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
        List<String> lines = Files.readAllLines(Paths.get("FBAD2/FBAD2Rosters"), StandardCharsets.UTF_8);

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
            String conf = (String) teamArray[2];
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
                players.add(new Player(name, pos, age));
            }
            Team t = new Team(teamName, players, teamAbr, conf);
            teams.put(teamAbr.toUpperCase(), t);
            teamNames.put(teamName, t);
        }
        //add teams to their conference
        PL = new ArrayList<>();
        WL = new ArrayList<>();
        UL = new ArrayList<>();
        IL = new ArrayList<>();
        for (String abr : teams.keySet()) {
            Team t = teams.get(abr);
            if (t.getConference().equals("PL")) {
                PL.add(t);
            }
            else if (t.getConference().equals("WL")){
                WL.add(t);
            }
            else if (t.getConference().equals("UL")){
                UL.add(t);
            }
            else {
                IL.add(t);
            }
        }
    }

    public static void makeSchedule() throws IOException {
        schedule = new Team[2][TOTAL_NUM_OF_GAMES];
        PriorityQueue<ScheduleTeam> gamesLeftOrder = new PriorityQueue<>();
        //Add teams to scheduling priority queue
        for (Team t : PL) {
            gamesLeftOrder.add(new ScheduleTeam(t, "PL", PL));
        }
        for (Team t : WL) {
            gamesLeftOrder.add(new ScheduleTeam(t, "WL", WL));
        }
        for (Team t : UL) {
            gamesLeftOrder.add(new ScheduleTeam(t, "UL", UL));
        }
        for (Team t : IL) {
            gamesLeftOrder.add(new ScheduleTeam(t, "IL", IL));
        }
        //Create a scheduleTeam map to find a team's ScheduleTeam later
        Map<Team, ScheduleTeam> scheduleTeams = new HashMap<>();
        for (ScheduleTeam st : gamesLeftOrder) {
            scheduleTeams.put(st.getTeam(), st);
        }
        int game = 0;
        boolean homeT;
        //The money maker loop, finds which games to put
        while (!gamesLeftOrder.isEmpty()) {
            ScheduleTeam temp = gamesLeftOrder.poll(); //Finds next team needing a game
            int homeAway = (int) (Math.random() * 2); //Home chosen if 0, away if 1
            //Finds home or away and opponent for circumstance
            Team opp;
            if (temp.noHomeGames()) {
                //Can't play any more home games
                opp = temp.findAwayOpp();
                homeT = false;
            }
            else if (temp.noAwayGames()) {
                //Can't play any more away games
                opp = temp.findHomeOpp();
                homeT = true;
            }
            else {
                //Can play either home or away, choose one at random
                if (homeAway == 0) {
                    opp = temp.findHomeOpp();
                    homeT = true;
                }
                else {
                    opp = temp.findAwayOpp();
                    homeT = false;
                }
            }
            ScheduleTeam oppon = scheduleTeams.get(opp); //find the opponents scheduleTeam
            //Adjust each teams remaining schedule and add teams to master schedule
            if (!homeT) {
                oppon.adjustSchedule(temp.getTeam(), true);
                temp.adjustSchedule(oppon.getTeam(), false);
                schedule[0][game] = oppon.getTeam();
                schedule[1][game] = temp.getTeam();
            }
            else {
                oppon.adjustSchedule(temp.getTeam(), false);
                temp.adjustSchedule(oppon.getTeam(), true);
                schedule[0][game] = temp.getTeam();
                schedule[1][game] = oppon.getTeam();
            }
            gamesLeftOrder.remove(oppon);
            //Add teams back to priority queue only if they have more games
            if (temp.moreGames()) {
                gamesLeftOrder.add(temp);
            }
            if (oppon.moreGames()) {
                gamesLeftOrder.add(oppon);
            }
            game++;
        }
        //Send schedule to a file
        gamesPlayed = 0;
        toFileSchedule();
        toFileRemainingSchedule();
        readOrResetRecords(false);
    }



    public static void readOrMakeSchedule(boolean read, boolean debug) throws IOException {
        if (read) {
            schedule = new Team[2][TOTAL_NUM_OF_GAMES];
            Scanner input = new Scanner(new File("FBAD2/schedule.txt"));
            gamesPlayed = input.nextInt();
            input.nextLine();
            tiebreakersComplete = input.nextLine();
            int game = 0;
            while (input.hasNextLine() && game < TOTAL_NUM_OF_GAMES) {
                String line = input.nextLine();
                Object[] lineData = line.split("/");
                schedule[0][game] = teams.get(((String) (lineData[0])).toUpperCase());
                schedule[1][game] = teams.get(((String) (lineData[1])).toUpperCase());
                game++;
            }
        }
        else {
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
        if (debug) {
            debugSchedule();
        }
    }

    /**
     * prints out the schedule
     */
    public static void debugSchedule() {
        for (int a = 0; a < schedule[0].length; a++) {
            System.out.println(schedule[0][a].getName() + " vs " + schedule[1][a].getName());
        }
    }

    /**
     * send the schedule to schedule.txt with the number of games played
     *
     * @throws IOException
     */
    public static void toFileSchedule() throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append(gamesPlayed).append("\n").append(tiebreakersComplete).append("\n");
        for (int a = 0; a < schedule[0].length; a++) {
            sb.append(schedule[0][a].getAbreviation()).append("/")
                    .append(schedule[1][a].getAbreviation()).append("\n");
        }
        File file = new File("FBAD2/schedule.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    public static void readRecords() throws IOException {
        Scanner input = new Scanner(new File("FBAD2/records"));
        input.nextLine();
        input.nextLine();
        if (tiebreakersComplete.equals("Y")) {
            PL = new ArrayList<>();
            WL = new ArrayList<>();
            UL = new ArrayList<>();
            IL = new ArrayList<>();
        }
        //eastern conference
        for (int a = 0; a < 16; a++) {
            String teamInfo = input.nextLine();
            int colSpot = teamInfo.indexOf(':');
            String teamName = teamInfo.substring(0, colSpot);
            String teamRecord = teamInfo.substring(colSpot + 2);
            Team team = teamNames.get(teamName);
            Object[] wl = teamRecord.split("-");
            team.setWin(Integer.parseInt((String) wl[0]));
            team.setLoss(Integer.parseInt((String) wl[1]));
            if (tiebreakersComplete.equals("Y")) {
                PL.add(team);
            }
        }
        input.nextLine();
        input.nextLine();
        input.nextLine();
        for (int a = 0; a < 16; a++) {
            String teamInfo = input.nextLine();
            int colSpot = teamInfo.indexOf(':');
            String teamName = teamInfo.substring(0, colSpot);
            String teamRecord = teamInfo.substring(colSpot + 2);
            Team team = teamNames.get(teamName);
            Object[] wl = teamRecord.split("-");
            team.setWin(Integer.parseInt((String) wl[0]));
            team.setLoss(Integer.parseInt((String) wl[1]));
            if (tiebreakersComplete.equals("Y")) {
                WL.add(team);
            }
        }
        input.nextLine();
        input.nextLine();
        input.nextLine();
        for (int a = 0; a < 16; a++) {
            String teamInfo = input.nextLine();
            int colSpot = teamInfo.indexOf(':');
            String teamName = teamInfo.substring(0, colSpot);
            String teamRecord = teamInfo.substring(colSpot + 2);
            Team team = teamNames.get(teamName);
            Object[] wl = teamRecord.split("-");
            team.setWin(Integer.parseInt((String) wl[0]));
            team.setLoss(Integer.parseInt((String) wl[1]));
            if (tiebreakersComplete.equals("Y")) {
                UL.add(team);
            }
        }
        input.nextLine();
        input.nextLine();
        input.nextLine();
        for (int a = 0; a < 16; a++) {
            String teamInfo = input.nextLine();
            int colSpot = teamInfo.indexOf(':');
            String teamName = teamInfo.substring(0, colSpot);
            String teamRecord = teamInfo.substring(colSpot + 2);
            Team team = teamNames.get(teamName);
            Object[] wl = teamRecord.split("-");
            team.setWin(Integer.parseInt((String) wl[0]));
            team.setLoss(Integer.parseInt((String) wl[1]));
            if (tiebreakersComplete.equals("Y")) {
                IL.add(team);
            }
        }
        updateStandings();
    }

    public static void readOrResetRecords(boolean read) throws IOException {
        if (read) {
            readRecords();
        }
        else {
            Scanner keyboard = new Scanner(System.in);
            System.out.print("are you sure you want to reset the records(Y/N)? ");
            String answer = keyboard.nextLine().toUpperCase();
            if (answer.equals("Y")) {
                System.out.print("Password: "); //password = resrec
                answer = keyboard.nextLine();
                if (answer.equals("resrec")) {
                    for (Team t : teams.values()) {
                        t.setLoss(0);
                        t.setWin(0);
                    }
                    gamesPlayed = 0;
                    tiebreakersComplete = "N";
                    toFileWL();
                    toFileSchedule();
                    toFileRemainingSchedule();
                    makeGoodLookinStandings();
                }
                else {
                    throw new IllegalArgumentException("Wrong password");
                }
            }
            else {
                throw new IllegalArgumentException("try again(maybe set read to true)");
            }
            File file = new File("FBAD2/Results.txt");
            FileWriter fw = new FileWriter(file);
            StringBuilder sb = new StringBuilder();
            fw.write(sb.toString());
            fw.close();
        }
    }

    public static void playGames(Scanner keyboard) throws IOException {
        boolean anotherGame = true;
        while (anotherGame) {
            if (gamesPlayed == TOTAL_NUM_OF_GAMES) {
                anotherGame = false;
            }
            if (anotherGame) {
                toFilePlayoffs();
                Team one = schedule[0][gamesPlayed];
                Team two = schedule[1][gamesPlayed];
                String confe;
                if (PL.contains(one)) {
                    confe = "Premier League";
                }
                else if (WL.contains(one)) {
                    confe = "World League";
                }
                else if (UL.contains(one)) {
                    confe = "United League";
                }
                else {
                    confe = "International League";
                }
                System.out.println(one.displayToString());
                System.out.println(two.displayToString());
                System.out.println("--" + confe + "--");
                System.out.println("(" + one.getWin() + "-" + one.getLoss() + ")" + one.getName()
                        + " vs " + two.getName() + "(" + two.getWin() + "-" + two.getLoss() + ")");
                System.out.print("Who wins(type team abreviation): ");
                boolean valid = false;
                while (!valid) {
                    String answer = keyboard.nextLine().toUpperCase();
                    if (answer.equals(one.getAbreviation())) {
                        valid = true;
                        one.setWin(one.getWin() + 1);
                        two.setLoss(two.getLoss() + 1);
                    }
                    else if (answer.equals(two.getAbreviation())) {
                        valid = true;
                        two.setWin(two.getWin() + 1);
                        one.setLoss(one.getLoss() + 1);
                    }
                    else {
                        System.out.print("not valid, try again: ");
                    }
                }
                gamesPlayed++;
                System.out.println(one.getName() + ": " + one.getWin() + "-" + one.getLoss());
                System.out.println(two.getName() + ": " + two.getWin() + "-" + two.getLoss());
                System.out.println();
                tiebreakersComplete = "N";
                updateStandings();
                toFileSchedule();
                toFileWL();
                toFileRemainingSchedule();
                makeGoodLookinStandings();
                gamePlayed = true;
            }
            if (gamesPlayed == TOTAL_NUM_OF_GAMES) {
                anotherGame = false;
            }
        }
    }

    public static void updateStandings() {
        if (tiebreakersComplete.equals("N")) {
            PL = updateStandHelp(PL);
            WL = updateStandHelp(WL);
            UL = updateStandHelp(UL);
            IL = updateStandHelp(IL);
        }
    }

    private static ArrayList<Team> updateStandHelp(ArrayList<Team> conf) {
        ArrayList<Team> newConf = new ArrayList<>();
        Team best;
        for (int a = conf.size() - 1; a > -1; a--) {
            best = conf.get(0);
            for (Team t : conf) {
                boolean finalDec = gamesPlayed == TOTAL_NUM_OF_GAMES;
                if (!best.isBetterThan(t, finalDec)) {
                    best = t;
                }
            }
            newConf.add(best);
            conf.remove(best);
        }
        if (gamesPlayed == TOTAL_NUM_OF_GAMES) {
            tiebreakersComplete = "Y";
        }
        return newConf;
    }

    public static void makeGoodLookinStandings() throws IOException {
        //PL
        StringBuilder sb = new StringBuilder("-Premier League-" + "\n" + "\n");
        StringBuilder bigSB = new StringBuilder();
        goodLookingStandHelp(PL, sb, bigSB);
        File file = new File("FBAD2/Standings-PL.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
        //WL
        sb = new StringBuilder();
        bigSB.append("\n");
        sb.append("-World League-" + "\n" + "\n");
        goodLookingStandHelp(WL, sb, bigSB);
        file = new File("FBAD2/Standings-WL.txt");
        fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
        //UL
        sb = new StringBuilder();
        bigSB.append("\n");
        sb.append("-United League-" + "\n" + "\n");
        goodLookingStandHelp(UL, sb, bigSB);
        file = new File("FBAD2/Standings-UL.txt");
        fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
        //IL
        sb = new StringBuilder();
        bigSB.append("\n");
        sb.append("-International League-" + "\n" + "\n");
        goodLookingStandHelp(IL, sb, bigSB);
        file = new File("FBAD2/Standings-IL.txt");
        fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
        //Master Standings
        file = new File("FBAD2/Standings.txt");
        fw = new FileWriter(file);
        fw.write(bigSB.toString());
        fw.close();
    }

    private static void goodLookingStandHelp(ArrayList<Team> conf,
                                             StringBuilder sb, StringBuilder bigSB) {
        int seed = 1;
        int longest = 0;
        Team longTeam = conf.get(0);
        for (Team t : conf) {
            if (t.getName().length() > longest) {
                longest = t.getName().length();
                longTeam = t;
            }
        }
        longest++;
        if (longTeam.getWin() > TOTAL_NUM_PER_PL_WL - conf.get(8).getLoss()) {
            longest += 2;
        }
        else if (conf.get(7).getWin() > TOTAL_NUM_PER_PL_WL - longTeam.getLoss()) {
            longest += 2;
        }
        else if (gamesPlayed == TOTAL_NUM_OF_GAMES) {
            longest += 2;
        }
        int spaces = longest;
        for (Team t : conf) {
            if (seed > 9) {
                spaces -= 1;
            }
            if (gamesPlayed != TOTAL_NUM_OF_GAMES) {
                if (t.getWin() > TOTAL_NUM_PER_PL_WL - conf.get(8).getLoss()) {
                    if (t.getWin() > TOTAL_NUM_PER_PL_WL - conf.get(1).getLoss()) {
                        sb.append("*-");
                    }
                    else if (t.getWin() > TOTAL_NUM_PER_PL_WL - conf.get(2).getLoss()) {
                        if (conf.equals(PL)) {
                            sb.append("x-");
                        }
                        else {
                            sb.append("p-");
                        }
                    }
                    else {
                        sb.append("x-");
                    }
                    spaces -= 2;
                }
                else if (conf.get(7).getWin() > TOTAL_NUM_PER_PL_WL - t.getLoss()) {
                    if (conf.get(13).getWin() > TOTAL_NUM_PER_PL_WL - t.getLoss()) {
                        if (conf.equals(IL)) {
                            sb.append("n-");
                        }
                        else {
                            sb.append("d-");
                        }
                    }
                    else {
                        sb.append("n-");
                    }
                    spaces -= 2;
                }
            }
            else {
                if (seed == 1) {
                    sb.append("*-");
                }
                else if (seed == 2) {
                    if (conf.equals(PL)) {
                        sb.append("x-");
                    }
                    else {
                        sb.append("p-");
                    }
                }
                else if (seed > 1 && seed < 9) {
                    sb.append("x-");
                }
                else if (seed > 8 && seed < 15) {
                    sb.append("n-");
                }
                else {
                    if (conf.equals(IL)) {
                        sb.append("n-");
                    }
                    else {
                        sb.append("d-");
                    }
                }
            }
            sb.append(seed).append(".").append(t.getName()).append(": ");
            for (int a = (longest - spaces) + t.getName().length(); a < longest; a++) {
                sb.append(" ");
            }
            if (t.getWin() < 10) {
                sb.append(" ");
            }
            sb.append(t.getWin()).append("-").append(t.getLoss()).append(" ");
            if (t.getLoss() < 10) {
                sb.append(" ");
            }
            Team top = conf.get(0);
            double gb = ((top.getWin() - t.getWin()) + (t.getLoss() - top.getLoss())) / 2.0;
            if (gb == 0.0) {
                sb.append("  --");
            }
            else if (Math.floor(gb) == gb) {
                int GB = (int) (gb);
                sb.append("  -").append(GB);
            }
            else {
                DecimalFormat df = new DecimalFormat("0.0");
                sb.append("  -").append(df.format(gb));
            }
            sb.append("\n");
            if (seed == 8) {
                sb.append("-----").append("\n");
            }
            spaces = longest;
            seed++;
        }
        bigSB.append(sb);
    }

    public static void randomizeWL(int simulateToGame) throws IOException {
        if (simulateToGame > TOTAL_NUM_OF_GAMES) {
            simulateToGame = TOTAL_NUM_OF_GAMES;
        }
        for (int a = gamesPlayed; a < simulateToGame; a++) {
            int random = (int) (Math.random() * 2);
            Team one = schedule[0][a];
            Team two = schedule[1][a];
            if (random == 0) {
                one.setWin(one.getWin() + 1);
                two.setLoss(two.getLoss() + 1);
            }
            else {
                two.setWin(two.getWin() + 1);
                one.setLoss(one.getLoss() + 1);
            }
            gamesPlayed++;
        }
        updateStandings();
        toFileSchedule();
        makeGoodLookinStandings();
        toFileWL();
        toFileRemainingSchedule();
        Scanner keyboard = new Scanner(System.in);
        System.out.print("Call to reset records(y/n)? ");
        String answer = keyboard.nextLine().toUpperCase();
        while (!answer.equals("Y") && !answer.equals("N")) {
            System.out.println("Sorry, try again: ");
            answer = keyboard.nextLine().toUpperCase();
        }
        if (answer.equals("Y")) {
            readOrResetRecords(false);
        }
        System.out.println();
    }

    public static void playoffs(Scanner keyboard) throws IOException {
        seriesQueue = new ArrayBlockingQueue<>(50);
        if (startInPlayoffs) {
            readPlayoffs();
        }
        else {
            seriesPL.set(0, new PlayoffSeries(0, PL.get(0), PL.get(7), 0, 0));
            seriesPL.set(1, new PlayoffSeries(1, PL.get(1), PL.get(6), 0, 0));
            seriesPL.set(2, new PlayoffSeries(2, PL.get(2), PL.get(5), 0, 0));
            seriesPL.set(3, new PlayoffSeries(3, PL.get(3), PL.get(4), 0, 0));
            seriesWL.set(0, new PlayoffSeries(0, WL.get(0), WL.get(7), 0, 0));
            seriesWL.set(1, new PlayoffSeries(1, WL.get(1), WL.get(6), 0, 0));
            seriesWL.set(2, new PlayoffSeries(2, WL.get(2), WL.get(5), 0, 0));
            seriesWL.set(3, new PlayoffSeries(3, WL.get(3), WL.get(4), 0, 0));
            seriesUL.set(0, new PlayoffSeries(0, UL.get(0), UL.get(7), 0, 0));
            seriesUL.set(1, new PlayoffSeries(1, UL.get(1), UL.get(6), 0, 0));
            seriesUL.set(2, new PlayoffSeries(2, UL.get(2), UL.get(5), 0, 0));
            seriesUL.set(3, new PlayoffSeries(3, UL.get(3), UL.get(4), 0, 0));
            seriesIL.set(0, new PlayoffSeries(0, IL.get(0), IL.get(7), 0, 0));
            seriesIL.set(1, new PlayoffSeries(1, IL.get(1), IL.get(6), 0, 0));
            seriesIL.set(2, new PlayoffSeries(2, IL.get(2), IL.get(5), 0, 0));
            seriesIL.set(3, new PlayoffSeries(3, IL.get(3), IL.get(4), 0, 0));
            seriesQueue.offer(seriesPL.get(0));
            seriesQueue.offer(seriesWL.get(0));
            seriesQueue.offer(seriesUL.get(0));
            seriesQueue.offer(seriesIL.get(0));
            seriesQueue.offer(seriesPL.get(1));
            seriesQueue.offer(seriesWL.get(1));
            seriesQueue.offer(seriesUL.get(1));
            seriesQueue.offer(seriesIL.get(1));
            seriesQueue.offer(seriesPL.get(2));
            seriesQueue.offer(seriesWL.get(2));
            seriesQueue.offer(seriesUL.get(2));
            seriesQueue.offer(seriesIL.get(2));
            seriesQueue.offer(seriesPL.get(3));
            seriesQueue.offer(seriesWL.get(3));
            seriesQueue.offer(seriesUL.get(3));
            seriesQueue.offer(seriesIL.get(3));
        }
        toFilePlayoffs();
        while (seriesQueue.peek() != null) {
            PlayoffSeries curSer = seriesQueue.poll();
            Team one = curSer.getHome();
            Team two = curSer.getAway();
            int oRank;
            int tRank;
            if (PL.contains(one)) {
                oRank = PL.indexOf(one) + 1;
                tRank = PL.indexOf(two) + 1;
            }
            else if (WL.contains(one)) {
                oRank = WL.indexOf(one) + 1;
                tRank = WL.indexOf(two) + 1;
            }
            else if (UL.contains(one)) {
                oRank = UL.indexOf(one) + 1;
                tRank = UL.indexOf(two) + 1;
            }
            else {
                oRank = IL.indexOf(one) + 1;
                tRank = IL.indexOf(two) + 1;
            }
            int gp = curSer.getAwayWins() + curSer.getHomeWins();
            playoffs = true;
            if (gp == 2 || gp == 3 || gp == 5) {
                System.out.println(one.displayToString());
                System.out.println(two.displayToString());
                System.out.println();
                System.out.println("(" + curSer.getAwayWins() + "-" + curSer.getHomeWins() + ")" + tRank + "." + two.getName()
                        + " vs " + oRank + "." + one.getName() + "(" + curSer.getHomeWins() + "-" + curSer.getAwayWins() + ")");
            }
            else {
                System.out.println(two.displayToString());
                System.out.println(one.displayToString());
                System.out.println();
                System.out.println("(" + curSer.getHomeWins() + "-" + curSer.getAwayWins() + ")" + oRank + "." + one.getName()
                        + " vs " + tRank + "." + two.getName() + "(" + curSer.getAwayWins() + "-" + curSer.getHomeWins() + ")");
            }
            System.out.print("Who wins(type team abreviation): ");
            boolean valid = false;
            while (!valid) {
                String answer = keyboard.nextLine().toUpperCase();
                if (answer.equals(one.getAbreviation())) {
                    valid = true;
                    curSer.homeWin();
                }
                else if (answer.equals(two.getAbreviation())) {
                    valid = true;
                    curSer.awayWin();
                }
                else {
                    System.out.print("not valid, try again: ");
                }
            }
            System.out.println(one.getName() + ": " + curSer.getHomeWins() + "-" + curSer.getAwayWins());
            System.out.println(two.getName() + ": " + curSer.getAwayWins() + "-" + curSer.getHomeWins());
            System.out.println();
            if (!curSer.isOver()) {
                seriesQueue.offer(curSer);
            }
            else {
                ArrayList<PlayoffSeries> rem;
                if (seriesPL.contains(curSer)) {
                    rem = seriesPL;
                }
                else if (seriesWL.contains(curSer)) {
                    rem = seriesWL;
                }
                else if (seriesUL.contains(curSer)) {
                    rem = seriesUL;
                }
                else {
                    rem = seriesIL;
                }
                PlayoffSeries next = whereToNext(curSer, rem);
                if (next != null && next.ready()) {
                    seriesQueue.offer(next);
                }
            }
            toFilePlayoffs();
        }
    }

    private static PlayoffSeries whereToNext(PlayoffSeries ps, ArrayList<PlayoffSeries> seriesL) {
        Scanner keyboard = new Scanner(System.in);
        Team winner;
        if (ps.getHomeWins() == 4) {
            winner = ps.getHome();
        }
        else {
            winner = ps.getAway();
        }
        int whichSer = 0;
        while (!ps.equals(seriesL.get(whichSer))) {
            whichSer++;
        }
        PlayoffSeries next;
        if (whichSer == 0 || whichSer == 3) {
            next = seriesL.get(4);
        }
        else if (whichSer == 1 || whichSer == 2) {
            next = seriesL.get(5);
        }
        else if (whichSer == 4 || whichSer == 5) {
            next = seriesL.get(6);
        }
        else {
            return null;
        }
        if (next.getHome() == null) {
            next.newHome(winner);
        }
        else {
            Team temp = next.getHome();
            if (winner.getWin() > temp.getWin()) {
                next.newHome(winner);
                next.newAway(temp);
            }
            else if (winner.getWin() < temp.getWin()) {
                next.newAway(winner);
            }
            ArrayList<Team> tempConf;
            if (winner.getConference().equals("PL")) {
                tempConf = PL;
            }
            else if (winner.getConference().equals("WL")) {
                tempConf = WL;
            }
            else if (winner.getConference().equals("UL")) {
                tempConf = UL;
            }
            else if (winner.getConference().equals("IL")) {
                tempConf = IL;
            }
            else {
                throw new IllegalStateException("Conf should be PL, WL, or UL");
            }
            int wpos = tempConf.indexOf(winner);
            int tpos = tempConf.indexOf(temp);
            if (wpos < tpos) {
                next.newHome(winner);
                next.newAway(temp);
            }
            else {
                next.newAway(winner);
            }
        }
        return next;
    }

    public static void toFilePlayoffs() throws IOException {
        StringBuilder sb = new StringBuilder("--League Quarter-Finals--" + "\n" + "-Premier League-" + "\n");
        for (int a = 0; a < 4; a++) {
            sb.append(seriesPL.get(a).getHomeWins()).append("-");
            if (seriesPL.get(a).getHome() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesPL.get(a).getHome().getName());
            }
            sb.append(" vs ");
            if (seriesPL.get(a).getAway() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesPL.get(a).getAway().getName());
            }
            sb.append("-").append(seriesPL.get(a).getAwayWins());
            sb.append("\n");
        }
        sb.append("-World League-").append("\n");
        for (int a = 0; a < 4; a++) {
            sb.append(seriesWL.get(a).getHomeWins()).append("-");
            if (seriesWL.get(a).getHome() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesWL.get(a).getHome().getName());
            }
            sb.append(" vs ");
            if (seriesWL.get(a).getAway() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesWL.get(a).getAway().getName());
            }
            sb.append("-").append(seriesWL.get(a).getAwayWins());
            sb.append("\n");
        }
        sb.append("-United League-").append("\n");
        for (int a = 0; a < 4; a++) {
            sb.append(seriesUL.get(a).getHomeWins()).append("-");
            if (seriesUL.get(a).getHome() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesUL.get(a).getHome().getName());
            }
            sb.append(" vs ");
            if (seriesUL.get(a).getAway() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesUL.get(a).getAway().getName());
            }
            sb.append("-").append(seriesUL.get(a).getAwayWins());
            sb.append("\n");
        }
        sb.append("-International League-").append("\n");
        for (int a = 0; a < 4; a++) {
            sb.append(seriesIL.get(a).getHomeWins()).append("-");
            if (seriesIL.get(a).getHome() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesIL.get(a).getHome().getName());
            }
            sb.append(" vs ");
            if (seriesIL.get(a).getAway() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesIL.get(a).getAway().getName());
            }
            sb.append("-").append(seriesIL.get(a).getAwayWins());
            sb.append("\n");
        }
        sb.append("\n").append("--League Semi-Finals--").append("\n").append("-Premier League-").append("\n");
        for (int a = 4; a < 6; a++) {
            sb.append(seriesPL.get(a).getHomeWins()).append("-");
            if (seriesPL.get(a).getHome() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesPL.get(a).getHome().getName());
            }
            sb.append(" vs ");
            if (seriesPL.get(a).getAway() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesPL.get(a).getAway().getName());
            }
            sb.append("-").append(seriesPL.get(a).getAwayWins());
            sb.append("\n");
        }
        sb.append("-World League-").append("\n");
        for (int a = 4; a < 6; a++) {
            sb.append(seriesWL.get(a).getHomeWins()).append("-");
            if (seriesWL.get(a).getHome() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesWL.get(a).getHome().getName());
            }
            sb.append(" vs ");
            if (seriesWL.get(a).getAway() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesWL.get(a).getAway().getName());
            }
            sb.append("-").append(seriesWL.get(a).getAwayWins());
            sb.append("\n");
        }
        sb.append("-United League-").append("\n");
        for (int a = 4; a < 6; a++) {
            sb.append(seriesUL.get(a).getHomeWins()).append("-");
            if (seriesUL.get(a).getHome() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesUL.get(a).getHome().getName());
            }
            sb.append(" vs ");
            if (seriesUL.get(a).getAway() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesUL.get(a).getAway().getName());
            }
            sb.append("-").append(seriesUL.get(a).getAwayWins());
            sb.append("\n");
        }
        sb.append("-International League-").append("\n");
        for (int a = 4; a < 6; a++) {
            sb.append(seriesIL.get(a).getHomeWins()).append("-");
            if (seriesIL.get(a).getHome() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesIL.get(a).getHome().getName());
            }
            sb.append(" vs ");
            if (seriesIL.get(a).getAway() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesIL.get(a).getAway().getName());
            }
            sb.append("-").append(seriesIL.get(a).getAwayWins());
            sb.append("\n");
        }
        sb.append("\n").append("--League Finals--").append("\n").append("-Premier League-").append("\n");
        for (int a = 6; a < 7; a++) {
            sb.append(seriesPL.get(a).getHomeWins()).append("-");
            if (seriesPL.get(a).getHome() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesPL.get(a).getHome().getName());
            }
            sb.append(" vs ");
            if (seriesPL.get(a).getAway() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesPL.get(a).getAway().getName());
            }
            sb.append("-").append(seriesPL.get(a).getAwayWins());
            sb.append("\n");
        }
        sb.append("-World League-").append("\n");
        for (int a = 6; a < 7; a++) {
            sb.append(seriesWL.get(a).getHomeWins()).append("-");
            if (seriesWL.get(a).getHome() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesWL.get(a).getHome().getName());
            }
            sb.append(" vs ");
            if (seriesWL.get(a).getAway() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesWL.get(a).getAway().getName());
            }
            sb.append("-").append(seriesWL.get(a).getAwayWins());
            sb.append("\n");
        }
        sb.append("-United League-").append("\n");
        for (int a = 6; a < 7; a++) {
            sb.append(seriesUL.get(a).getHomeWins()).append("-");
            if (seriesUL.get(a).getHome() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesUL.get(a).getHome().getName());
            }
            sb.append(" vs ");
            if (seriesUL.get(a).getAway() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesUL.get(a).getAway().getName());
            }
            sb.append("-").append(seriesUL.get(a).getAwayWins());
            sb.append("\n");
        }
        sb.append("-International League-").append("\n");
        for (int a = 6; a < 7; a++) {
            sb.append(seriesIL.get(a).getHomeWins()).append("-");
            if (seriesIL.get(a).getHome() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesIL.get(a).getHome().getName());
            }
            sb.append(" vs ");
            if (seriesIL.get(a).getAway() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(seriesIL.get(a).getAway().getName());
            }
            sb.append("-").append(seriesIL.get(a).getAwayWins());
            sb.append("\n");
        }
        sb.append("\n").append("\n").append("Next Games:").append("\n");
        if (seriesQueue != null) {
            for (PlayoffSeries ps : seriesQueue) {
                sb.append(ps.getSeriesNum()).append("/")
                        .append(ps.getHome().getAbreviation())
                        .append("/").append(ps.getAway().getAbreviation()).append("/")
                        .append(ps.getHomeWins()).append("/")
                        .append(ps.getAwayWins()).append("\n");
            }
        }
        File file = new File("FBAD2/Playoffs.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    public static void readPlayoffs() throws IOException {
        updateStandings();
        Scanner input = new Scanner(new File("FBAD2/Playoffs.txt"));
        int seriesNumPL = -1;
        int seriesNumWL = -1;
        int seriesNumUL = -1;
        int seriesNumIL = -1;
        boolean doneRead = false;
        boolean prem = false;
        boolean worl = false;
        boolean unit = false;
        boolean inte = false;
        while (input.hasNextLine() && !doneRead) {
            String line = input.nextLine();
            if (line.equals("Next Games:")) {
                doneRead = true;
            }
            else if (line.length() > 1 && line.charAt(0) != '-') {
                Object[] teams = line.split(" vs ");
                Object[] teamOne = ((String) teams[0]).split("-");
                Object[] teamTwo = ((String) teams[1]).split("-");
                PlayoffSeries thisSer;
                if (!teamOne[1].equals("TBD")) {
                    if (PL.contains(teamNames.get((String) teamOne[1]))) {
                        seriesNumPL++;
                        thisSer = seriesPL.get(seriesNumPL);
                        thisSer.setSeriesNum(seriesNumPL);
                    }
                    else if (WL.contains(teamNames.get((String) teamOne[1]))) {
                        seriesNumWL++;
                        thisSer = seriesWL.get(seriesNumWL);
                        thisSer.setSeriesNum(seriesNumWL);
                    }
                    else if (UL.contains(teamNames.get((String) teamOne[1]))) {
                        seriesNumUL++;
                        thisSer = seriesUL.get(seriesNumUL);
                        thisSer.setSeriesNum(seriesNumUL);
                    }
                    else {
                        seriesNumIL++;
                        thisSer = seriesIL.get(seriesNumIL);
                        thisSer.setSeriesNum(seriesNumIL);
                    }
                    thisSer.newHome(teamNames.get((String) teamOne[1]));
                    thisSer.newAway(teamNames.get((String) teamTwo[0]));
                    thisSer.setHomeWins(Integer.parseInt((String) teamOne[0]));
                    thisSer.setAwayWins(Integer.parseInt((String) teamTwo[1]));
                }
                else {
                    if (prem) {
                        seriesNumPL++;
                    }
                    else if (worl) {
                        seriesNumWL++;
                    }
                    else if (unit) {
                        seriesNumUL++;
                    }
                    else if (inte) {
                        seriesNumIL++;
                    }
                }
            }
            else if(line.equals("-Premier League-")) {
                prem = true;
                worl = false;
                unit = false;
                inte = false;
            }
            else if(line.equals("-World League-")) {
                prem = false;
                worl = true;
                unit = false;
                inte = false;
            }
            else if(line.equals("-United League-")) {
                prem = false;
                worl = false;
                unit = true;
                inte = false;
            }
            else if(line.equals("-International League-")) {
                prem = false;
                worl = false;
                unit = false;
                inte = true;
            }
        }
        while (input.hasNextLine()) {
            String line = input.nextLine();
            Object[] a = line.split("/");
            if (PL.contains(teams.get((String) a[1]))) {
                seriesNumPL = Integer.parseInt((String) a[0]);
                seriesQueue.offer(seriesPL.get(seriesNumPL));
            }
            else if (WL.contains(teams.get((String) a[1]))) {
                seriesNumWL = Integer.parseInt((String) a[0]);
                seriesQueue.offer(seriesWL.get(seriesNumWL));
            }
            else if (UL.contains(teams.get((String) a[1]))) {
                seriesNumUL = Integer.parseInt((String) a[0]);
                seriesQueue.offer(seriesUL.get(seriesNumUL));
            }
            else {
                seriesNumIL = Integer.parseInt((String) a[0]);
                seriesQueue.offer(seriesIL.get(seriesNumIL));
            }
        }
    }

    public static void toFileRemainingSchedule() throws IOException {
        StringBuilder sb = new StringBuilder();
        for (int a = gamesPlayed; a < TOTAL_NUM_OF_GAMES; a++) {
            Team b = schedule[0][a];
            Team c = schedule[1][a];
            sb.append("(").append(b.getWin()).append("-").append(b.getLoss()).append(")")
                    .append(b.getName()).append(" vs ").append(c.getName()).append("(")
                    .append(c.getWin()).append("-").append(c.getLoss()).append(")");
            sb.append("\n");
        }
        File file = new File("FBAD2/Schedule-Remaining.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }
}