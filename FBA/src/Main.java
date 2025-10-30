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
    public static ArrayList<Team> eastern;
    public static ArrayList<Team> western;
    private static ArrayList<Team> lotto;
    public static ArrayList<Team> rankings;
    public static ArrayList<Team> inRanks;
    private static Team[][] schedule;
    private static int gamesPlayed;
    private static final int TOTAL_NUM_OF_GAMES = 1290;
    private static final int NUM_OF_GAMES_PER_TEAM = 86;
    private static final int NUM_OF_CONF_PER_TEAM = 56;
    private static boolean startInPlayoffs;
    private static String tiebreakersComplete;
    private static ArrayList<PlayoffSeries> series;
    public static boolean playoffs;
    private static boolean playedGame;
    private static ArrayBlockingQueue<PlayoffSeries> seriesQueue;

    public static void main(String[] args) throws IOException {
        int season = 76;
        playedGame = false;
        Scanner keyboard = new Scanner(System.in);
        readRosters();
        readOrMakeSchedule(false, false); //true if reading a schedule, true to print
        readOrResetRecords(true); //true is reading in records
        if (gamesPlayed > 19) {
            readRankings();
        }
        readResultsForHTH();
        playoffs = false;
        series = new ArrayList<>();
        for (int a = 0; a < 15; a++) {
            series.add(new PlayoffSeries(a, null, null, 0, 0));
        }
//        printTopPlayers(85); //prints players with rating >= input
//        randomizeWL(TOTAL_NUM_OF_GAMES); //debugger that simulates to specified game
        if (gamesPlayed == TOTAL_NUM_OF_GAMES) {
            updateRankings(false);
        }
        playGamesTest(keyboard);
        startInPlayoffs = tiebreakersComplete.equals("Y");
        playoffs(keyboard);
        System.out.print("Congratulations " + series.get(series.size() - 1)
                .getWinningTeam().getName() + ", ");
        System.out.println("you are S" + season + " FBA Champions!");
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
            int teamSize = t.getPlayers().length + t.getReserves().size();
            sb.append(teamSize).append("\n");
            //Add each player to the long string
            for (Player p : t.getPlayers()) {
                String n = p.getName();
                String po = p.getPosition();
                int a = p.getAge();
                int l = p.getContractLen();
                int c = p.getCost();
                int r = p.getRating();
                int poi = p.getPoints();
                sb.append(n).append("/").append(po).append("/").append(a).append("/")
                        .append(l).append("/").append(c).append("/").append(r).append("/")
                        .append(poi).append("\n");
            }
        }
        //write the long string to the file
        File file = new File("FBA/FBARosters.txt");
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
        StringBuilder sb = new StringBuilder("-Eastern-" + "\n" + "\n");
        for (Team t : eastern) {
            sb.append(t.getName()).append(": ").append(t.getWin()).
                    append("-").append(t.getLoss()).append("-").append(t.getConWin()).append("-")
                    .append(t.getConLoss()).append("\n");
        }
        sb.append("\n" + "-Western-" + "\n" + "\n");
        for (Team t : western) {
            sb.append(t.getName()).append(": ").append(t.getWin()).
                    append("-").append(t.getLoss()).append("-").append(t.getConWin())
                    .append("-").append(t.getConLoss()).append("\n");
        }
        File file = new File("FBA/records");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    /**
     * read in the rosters and basic team info from the FBARosters file
     *
     * @param input pre: none
     * @throws IOException 
     */
    public static void readRosters() throws IOException {
        List<String> lines = Files.readAllLines(Paths.get("FBA","FBARosters.txt"), StandardCharsets.UTF_8);

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
            PriorityQueue<Player> players = new PriorityQueue<>();
            //Go through each player for each team
            for (int b = 0; b < numOfPlayers; b++) {
                String playerInfo = lines.get(line_num);
                line_num++;
                Object[] playerArray = playerInfo.split("/");
                String name = (String) playerArray[0];
                String pos = (String) playerArray[1];
                int age = Integer.parseInt((String) playerArray[2]);
                int conLen = Integer.parseInt((String) playerArray[3]);
                int cost = Integer.parseInt((String) playerArray[4]);
                int rat = Integer.parseInt((String) playerArray[5]);
                int poi = Integer.parseInt((String) playerArray[6]);
                players.add(new Player(name, rat, pos, age, conLen, cost, poi));
            }
            Team t = new Team(teamName, players, teamAbr, conf);
            teams.put(teamAbr.toUpperCase(), t);
            teamNames.put(teamName, t);
        }
        //add teams to their conference
        eastern = new ArrayList<>();
        western = new ArrayList<>();
        lotto = new ArrayList<>();
        rankings = new ArrayList<>();
        inRanks = new ArrayList<>();
        for (String abr : teams.keySet()) {
            Team t = teams.get(abr);
            if (t.getConference().equals("E")) {
                eastern.add(t);
            }
            else {
                western.add(t);
            }
        }
    }

    public static void makeSchedule() throws IOException {
        schedule = new Team[2][TOTAL_NUM_OF_GAMES];
        PriorityQueue<ScheduleTeam> gamesLeftOrder = new PriorityQueue<>();
        //Add teams to scheduling priority queue
        for (Team t : western) {
            gamesLeftOrder.add(new ScheduleTeam(t, "western", western, eastern));
        }
        for (Team t : eastern) {
            gamesLeftOrder.add(new ScheduleTeam(t, "eastern", eastern, western));
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
            Scanner input = new Scanner(new File("FBA/schedule.txt"));
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
            File file = new File("FBA/Results.txt");
            FileWriter fw = new FileWriter(file);
            StringBuilder sb = new StringBuilder();
            fw.write(sb.toString());
            fw.close();
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
        File file = new File("FBA/schedule.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    public static void readRecords() throws IOException {
        Scanner input = new Scanner(new File("FBA/records"));
        final int TEAMS_IN_CONF = 15;
        input.nextLine();
        input.nextLine();
        //eastern conference
        for (int a = 0; a < TEAMS_IN_CONF; a++) {
            String teamInfo = input.nextLine();
            int colSpot = teamInfo.indexOf(':');
            String teamName = teamInfo.substring(0, colSpot);
            String teamRecord = teamInfo.substring(colSpot + 2);
            Team team = teamNames.get(teamName);
            Object[] wl = teamRecord.split("-");
            team.setWin(Integer.parseInt((String) wl[0]), false);
            team.setLoss(Integer.parseInt((String) wl[1]), false);
            team.setConWin(Integer.parseInt((String) wl[2]));
            team.setConLoss(Integer.parseInt((String) wl[3]));
        }
        input.nextLine();
        input.nextLine();
        input.nextLine();
        for (int a = 0; a < TEAMS_IN_CONF; a++) {
            String teamInfo = input.nextLine();
            int colSpot = teamInfo.indexOf(':');
            String teamName = teamInfo.substring(0, colSpot);
            String teamRecord = teamInfo.substring(colSpot + 2);
            Team team = teamNames.get(teamName);
            Object[] wl = teamRecord.split("-");
            team.setWin(Integer.parseInt((String) wl[0]), false);
            team.setLoss(Integer.parseInt((String) wl[1]), false);
            team.setConWin(Integer.parseInt((String) wl[2]));
            team.setConLoss(Integer.parseInt((String) wl[3]));
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
                        t.setLoss(0, false);
                        t.setWin(0, false);
                        t.setConWin(0);
                        t.setConLoss(0);
                    }
                    for (Team t: western) {
                        for (Player p: t.roster) {
                            p.setPoints(0);
                        }
                    }
                    for (Team t: eastern) {
                        for (Player p: t.roster) {
                            p.setPoints(0);
                        }
                    }
                    gamesPlayed = 0;
                    tiebreakersComplete = "N";
                    toFileWL();
                    toFile();
                    toFileBestScorers();
                    toFileSchedule();
                    toFileRemainingSchedule();
                }
                else {
                    throw new IllegalArgumentException("Wrong password");
                }
            }
            else {
                throw new IllegalArgumentException("try again(maybe set read to true)");
            }
            File file = new File("FBA/Results.txt");
            FileWriter fw = new FileWriter(file);
            StringBuilder sb = new StringBuilder();
            fw.write(sb.toString());
            fw.close();
        }
    }

//    public static void playGames(Scanner keyboard) throws IOException {
//        boolean anotherGame = true;
//        while (anotherGame) {
//            if (gamesPlayed == (TOTAL_NUM_OF_GAMES / 4) || gamesPlayed ==
//                    (TOTAL_NUM_OF_GAMES / 2) || gamesPlayed == (TOTAL_NUM_OF_GAMES * .75)) {
//                messageToAdjustRatings(keyboard);
//                if (gamesPlayed == (TOTAL_NUM_OF_GAMES * .75)) {
//                    printTopPlayers(80);
//                    System.out.print("Pick All-Stars(Type 'done' when finished): ");
//                    String answer = keyboard.nextLine().toUpperCase();
//                    while (!answer.equals("DONE")) {
//                        System.out.print("Pick All-Stars(Type 'done' when finished): ");
//                        answer = keyboard.nextLine().toUpperCase();
//                    }
//                }
//                else if (gamesPlayed == (TOTAL_NUM_OF_GAMES * .5)) {
//                    System.out.println("TRADE DEADLINE: Look at trade options(Type 'done' when finished): ");
//                    String answer = keyboard.nextLine().toUpperCase();
//                    while (!answer.equals("DONE")) {
//                        System.out.print("Pick All-Stars(Type 'done' when finished): ");
//                        answer = keyboard.nextLine().toUpperCase();
//                    }
//                }
//            }
//            if (gamesPlayed == TOTAL_NUM_OF_GAMES) {
//                anotherGame = false;
//            }
//            if (anotherGame) {
//                toFilePlayoffs();
//                Team one = schedule[0][gamesPlayed];
//                Team two = schedule[1][gamesPlayed];
//                boolean homeWin = false;
//                System.out.println(one.displayToString());
//                System.out.println(two.displayToString());
//                System.out.println();
//                System.out.println("(" + one.getWin() + "-" + one.getLoss() + ")" + one.getName()
//                        + " vs " + two.getName() + "(" + two.getWin() + "-" + two.getLoss() + ")");
//                System.out.print("Who wins(type team abreviation): ");
//                boolean sameConf = one.getConference().equals(two.getConference());
//                boolean valid = false;
//                while (!valid) {
//                    String answer = keyboard.nextLine().toUpperCase();
//                    Map<Team, Integer> oHTH = one.getHTH();
//                    Map<Team, Integer> tHTH = two.getHTH();
//                    if (answer.equals(one.getAbreviation())) {
//                        valid = true;
//                        one.setWin(one.getWin() + 1, sameConf);
//                        two.setLoss(two.getLoss() + 1, sameConf);
//                        homeWin = true;
//                        if (oHTH.containsKey(two)) {
//                            oHTH.put(two, oHTH.get(two) + 1);
//                        }
//                        else {
//                            oHTH.put(two, 1);
//                        }
//                        if (!tHTH.containsKey(one)) {
//                            tHTH.put(one, 0);
//                        }
//
//                    }
//                    else if (answer.equals(two.getAbreviation())) {
//                        valid = true;
//                        two.setWin(two.getWin() + 1, sameConf);
//                        one.setLoss(one.getLoss() + 1, sameConf);
//                        homeWin = false;
//                        if (tHTH.containsKey(one)) {
//                            tHTH.put(one, tHTH.get(one) + 1);
//                        }
//                        else {
//                            tHTH.put(one, 1);
//                        }
//                        if (!oHTH.containsKey(two)) {
//                            oHTH.put(two, 0);
//                        }
//                    }
//                    else {
//                        System.out.print("not valid, try again: ");
//                    }
//                }
//                playedGame = true;
//                gamesPlayed++;
//                System.out.println(one.getName() + ": " + one.getWin() + "-" + one.getLoss());
//                System.out.println(two.getName() + ": " + two.getWin() + "-" + two.getLoss());
//                System.out.println();
//                tiebreakersComplete = "N";
//                toFileResults(one, two, homeWin);
//                toFileSchedule();
//                updateStandings();
//                toFileWL();
//                toFileRemainingSchedule();
//                makeGoodLookinStandings();
//            }
//            if (gamesPlayed == TOTAL_NUM_OF_GAMES) {
//                anotherGame = false;
//            }
//        }
//    }

    public static void playGamesTest(Scanner keyboard) throws IOException {
        boolean anotherGame = true;
        while (anotherGame) {
            if (gamesPlayed == (TOTAL_NUM_OF_GAMES / 4) || gamesPlayed ==
                    (TOTAL_NUM_OF_GAMES / 2) || gamesPlayed == (TOTAL_NUM_OF_GAMES * 3 / 4)) {
                messageToAdjustRatings(keyboard);
                if (gamesPlayed == (TOTAL_NUM_OF_GAMES * 3 / 4)) {
                    printTopPlayers(80);
                    System.out.print("Pick All-Stars(Type 'done' when finished): ");
                    String answer = keyboard.nextLine().toUpperCase();
                    while (!answer.equals("DONE")) {
                        System.out.print("Pick All-Stars(Type 'done' when finished): ");
                        answer = keyboard.nextLine().toUpperCase();
                    }
                }
                else if (gamesPlayed == (TOTAL_NUM_OF_GAMES / 2)) {
                    System.out.print("TRADE DEADLINE: Look at trade options(Type 'done' when finished): ");
                    String answer = keyboard.nextLine().toUpperCase();
                    while (!answer.equals("DONE")) {
                        System.out.print("TRADE DEADLINE: Look at trade options(Type 'done' when finished): ");
                        answer = keyboard.nextLine().toUpperCase();
                    }
                }
            }
            if (gamesPlayed == TOTAL_NUM_OF_GAMES) {
                anotherGame = false;
            }
            if (anotherGame) {
                toFilePlayoffs();
                Team one = schedule[0][gamesPlayed];
                Team two = schedule[1][gamesPlayed];
                boolean homeWin = false;
                System.out.println(one.displayToString());
                System.out.println(two.displayToString());
                System.out.println();
                System.out.println("(" + one.getWin() + "-" + one.getLoss() + ")" + one.getName()
                        + " vs " + two.getName() + "(" + two.getWin() + "-" + two.getLoss() + ")");
                boolean sameConf = one.getConference().equals(two.getConference());
                System.out.print("Start Game? ");
                keyboard.nextLine();
                ArrayList<Player> oneRoster = new ArrayList<>(one.roster);
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
                    if (i == 30) {
                        System.out.print("End of the 1st: " + one.getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
                        keyboard.nextLine();
                    }
                    else if (i == 60) {
                        System.out.print("Halftime: " + one.getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
                        keyboard.nextLine();
                    }
                    else if (i == 90) {
                        System.out.print("End of the 3rd: " + one.getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
                        keyboard.nextLine();
                    }
                    else if (i > 109 && Math.abs(onePoints - twoPoints) <= (((endGamePoss-i+1)/2) * 3)) {
                        System.out.print(endGamePoss-i + " Possessions left: " + one.getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints + ", ");
                        if (i%2 == 0) {
                            System.out.print(one.getAbreviation() + " Possession");
                        }
                        else {
                            System.out.print(two.getAbreviation() + " Possession");
                        }
                        keyboard.nextLine();
                    }
                    else if (i == 120) {
                        System.out.print("End of the Regulation: " + one.getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
                        keyboard.nextLine();
                    }
                    else if (i%10 == 0 && i > 120) {
                        System.out.print("End of " + OTCount + "OT: " + one.getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
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
                    int oddsToMake = playerWithBall.getRating() - defender.getRating() + 50;
                    int madeScore = (int) (Math.random() * 100) + 1;
                    int pointsScored = 0;
                    if (oddsToMake >= madeScore) {
                        madeScore = Math.abs(madeScore - oddsToMake);
                        if (playerWithBall.getPosition().equals("PG") && madeScore >= 30) {
                            pointsScored = 3;
                        }
                        else if (playerWithBall.getPosition().equals("SG") && madeScore >= 30) {
                            pointsScored = 3;
                        }
                        else if (playerWithBall.getPosition().equals("SF") && madeScore >= 35) {
                            pointsScored = 3;
                        }
                        else if (playerWithBall.getPosition().equals("PF") && madeScore >= 40) {
                            pointsScored = 3;
                        }
                        else if (playerWithBall.getPosition().equals("C") && madeScore >= 50) {
                            pointsScored = 3;
                        }
                        else {
                            pointsScored = 2;
                        }
                        if (i > 109 && Math.abs(onePoints - twoPoints) <= (((endGamePoss-i+1)/2) * 3)) {
                            Team t = one;
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
                System.out.println(one.getName() + ": ");
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

                Map<Team, Integer> oHTH = one.getHTH();
                Map<Team, Integer> tHTH = two.getHTH();
                if (onePoints > twoPoints) {
                    one.setWin(one.getWin() + 1, sameConf);
                    two.setLoss(two.getLoss() + 1, sameConf);
                    homeWin = true;
                    if (oHTH.containsKey(two)) {
                        oHTH.put(two, oHTH.get(two) + 1);
                    }
                    else {
                        oHTH.put(two, 1);
                    }
                    if (!tHTH.containsKey(one)) {
                        tHTH.put(one, 0);
                    }

                }
                else {
                    two.setWin(two.getWin() + 1, sameConf);
                    one.setLoss(one.getLoss() + 1, sameConf);
                    homeWin = false;
                    if (tHTH.containsKey(one)) {
                        tHTH.put(one, tHTH.get(one) + 1);
                    }
                    else {
                        tHTH.put(one, 1);
                    }
                    if (!oHTH.containsKey(two)) {
                        oHTH.put(two, 0);
                    }
                }

                playedGame = true;
                gamesPlayed++;
                System.out.println();
                System.out.print("Final Score: " + one.getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
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
                System.out.println();
                System.out.println(one.getName() + ": " + one.getWin() + "-" + one.getLoss());
                System.out.println(two.getName() + ": " + two.getWin() + "-" + two.getLoss());
                System.out.println();
                tiebreakersComplete = "N";
                toFileResults(one, two, homeWin, onePoints, twoPoints);
                toFileSchedule();
                updateStandings();
                toFile();
                toFileWL();
                toFileRemainingSchedule();
                makeGoodLookinStandings();
                toFileBestScorers();
                System.out.print("Ready for next game? ");
                keyboard.nextLine();
                System.out.println();
                System.out.println();
                System.out.println();
                System.out.println();
                System.out.println();

            }
            if (gamesPlayed == TOTAL_NUM_OF_GAMES) {
                anotherGame = false;
            }
        }
    }

    private static void toFileBestScorers () throws IOException{
        StringBuilder sb = new StringBuilder();
        ArrayList<Player> players = new ArrayList<>();
        sb.append("Points Per Game: ").append("\n").append("\n");
        for (Team t: western) {
            for (Player p: t.roster) {
                players.add(p);
                p.newPPG(t.getWin() + t.getLoss());
            }
        }
        for (Team t: eastern) {
            for (Player p: t.roster) {
                players.add(p);
                p.newPPG(t.getWin() + t.getLoss());
            }
        }
        for (int i = 0; i < teams.size() * 5; i++) {
            Player p = players.get(0);
            for (Player player : players) {
                if (player.getPPG() > p.getPPG()) {
                    p = player;
                }
            }
            players.remove(p);
            DecimalFormat df = new DecimalFormat("#.#");
            sb.append(i + 1).append(". ").append(p.getName()).append("(").append(p.getRating())
                    .append(")").append("(").append(p.getTeam()
                    .getAbreviation()).append(")").append(": ").append(df.format(p.getPPG()))
                    .append("\n");
        }
        File file = new File("FBA/League-Points-Stats.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    private static void toFileResults(Team one, Team two, boolean homeWin, int onePoints, int twoPoints) throws
            IOException {
        StringBuilder sb = new StringBuilder();
        Scanner input = new Scanner(new File("FBA/Results.txt"));
        while (input.hasNextLine()) {
            String temp = input.nextLine();
            sb.append(temp).append("\n");
        }
        if (homeWin) {
            sb.append(gamesPlayed).append(",").append(one.getName()).append(",").append(onePoints)
                    .append(",").append(two.getName()).append(",").append(twoPoints);
        }
        else {
            sb.append(gamesPlayed).append(",").append(one.getName()).append(",").append(onePoints)
                    .append(",").append(two.getName()).append(",").append(twoPoints);
        }
        File file = new File("FBA/Results.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    private static void messageToAdjustRatings(Scanner keyboard) {
        System.out.print("Adjust Ratings(Type 'done' when finished): ");
        String answer = keyboard.nextLine().toUpperCase();
        while (!answer.equals("DONE")) {
            System.out.print("Adjust Ratings(Type 'done' when finished): ");
            answer = keyboard.nextLine().toUpperCase();
        }
    }

    public static void updateStandings() throws IOException {
        lotto = new ArrayList<>();
        western = updateStandHelp(western, false);
        eastern = updateStandHelp(eastern, false);
        lotto = updateStandHelp(lotto, true);
        readRankings();
        if (gamesPlayed % 20 == 0 && playedGame) {
            updateRankings(true);
        }
    }

    private static void readRankings() throws FileNotFoundException {
        rankings = new ArrayList<>();
        File file = new File("FBA/Rankings.txt");
        Scanner input = new Scanner(file);
        input.nextLine();
        input.nextLine();
        boolean keepGoin = true;
        while (input.hasNextLine() && keepGoin) {
            String next = input.nextLine();
            if (next.contains(":")) {
                Object[] a = next.split("\\.");
                if (a[1].equals("St")) {
                    a[1] = "St.Louis Kings: ";
                }
                Object[] b = ((String) a[1]).split(":");
                next = (String) b[0];
                rankings.add(teamNames.get(next));
                inRanks.add(teamNames.get(next));
            }
            else {
                keepGoin = false;
            }
        }
    }

    private static ArrayList<Team> updateStandHelp(ArrayList<Team> conf, boolean reverse) {
        ArrayList<Team> newConf = new ArrayList<>();
        Team best;
        int rank = 1;
        for (int a = conf.size() - 1; a > -1; a--) {
            best = conf.get(0);
            for (Team t : conf) {
                if (reverse) {
                    if (best.isBetterThan(t)) {
                        best = t;
                    }
                }
                else {
                    if (!best.isBetterThan(t)) {
                        best = t;
                    }
                }
            }
            if (rank > 8 && !conf.equals(lotto)) {
                lotto.add(best);
            }
            newConf.add(best);
            conf.remove(best);
            rank++;
        }
        return newConf;
    }

    private static void updateRankings(boolean toFile) throws IOException {
        String gameResults = "FBA/Results.txt";
        FootballRanker fr = new FootballRanker(gameResults);
        TreeSet<AllPathsInfo> allpaths = fr.doWeightedAndWinPercentAdjusted(false);
        ArrayList<Team> oldRanks = new ArrayList<>(rankings);
        rankings = new ArrayList<>();
        inRanks = new ArrayList<>();
        int longest = 0;
        int oLongest = 0;
        for (AllPathsInfo path : allpaths) {
            rankings.add(teamNames.get(path.getName()));
            if (path.getName().length() > longest) {
                longest = path.getName().length();
            }
        }
        longest++;
        oLongest = longest;
        StringBuilder sb = new StringBuilder("-Rankings-" + "\n");
        sb.append("Games Played: ").append(gamesPlayed).append("\n");
        int rank = 1;
        for (Team t : rankings) {
            inRanks.add(t);
            if (rank == 10) {
                longest--;
            }
            sb.append(rank).append(".").append(t.getName()).append(":");
            for (int a = t.getName().length(); a < longest; a++) {
                sb.append(" ");
            }
            if (!oldRanks.contains(t)) {
                sb.append("(NR)");
            }
            else {
                int dif = oldRanks.indexOf(t) - rankings.indexOf(t);
                sb.append("(").append(dif).append(")");
            }
            rank++;
            sb.append("\n");
        }
        if (toFile) {
            File file = new File("FBA/Rankings.txt");
            FileWriter fw = new FileWriter(file);
            fw.write(sb.toString());
            fw.close();
        }
    }

    public static void makeGoodLookinStandings() throws IOException {
        //Eastern Conference
        StringBuilder sb = new StringBuilder("-Eastern-" + "\n" + "\n");
        StringBuilder bigSB = new StringBuilder();
        goodLookingStandHelp(eastern, sb, bigSB);
        File file = new File("FBA/Standings-Eastern.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
        //Western Conference
        sb = new StringBuilder();
        bigSB.append("\n");
        sb.append("-Western-" + "\n" + "\n");
        goodLookingStandHelp(western, sb, bigSB);
        file = new File("FBA/Standings-Western.txt");
        fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
        //Lottery
        sb = new StringBuilder();
        bigSB.append("\n");
        sb.append("-Lottery-" + "\n" + "\n");
        goodLookingStandHelp(lotto, sb, bigSB);
        file = new File("FBA/Standings-Lottery.txt");
        fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
        //Master Standings
        file = new File("FBA/Standings.txt");
        fw = new FileWriter(file);
        fw.write(bigSB.toString());
        fw.close();
    }

    private static void goodLookingStandHelp(ArrayList<Team> conf,
                                             StringBuilder sb, StringBuilder bigSB) {
        //Western Conference
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
        if (conf.equals(western) || conf.equals(eastern)) {
            if (clinchSomething(conf, longTeam)) {
                longest += 2;
            }
        }
        int spaces = longest;
        for (Team t : conf) {
            if (seed > 9) {
                spaces -= 1;
            }
            if ((conf.equals(western) || conf.equals(eastern)) && clinchSomething(conf, t)) {
                spaces -= 2;
                if (clinchStar(conf, t)) {
                    sb.append("*-");
                }
                else if (clinchX(conf, t)) {
                    sb.append("x-");
                }
                else {
                    sb.append("n-");
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
            if (!conf.equals(lotto)) {
                sb.append("(").append(t.getConWin()).append("-").append(t.getConLoss()).append(")");
                if (t.getConWin() < 10) {
                    sb.append(" ");
                }
                if (t.getConLoss() < 10) {
                    sb.append(" ");
                }
            }
            Team top = conf.get(0);
            double gb = ((top.getWin() - t.getWin()) + (t.getLoss() - top.getLoss())) / 2.0;
            if (conf.equals(lotto)) {
                gb *= -1.0;
            }
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
            if (seed == 8 && !conf.equals(lotto)) {
                sb.append("-----").append("\n");
            }
            spaces = longest;
            seed++;
        }
        bigSB.append(sb);
    }

    private static boolean clinchSomething(ArrayList<Team> conf, Team t) {
        return clinchStar(conf, t) || clinchX(conf, t) || clinchN(conf, t);
    }

    private static boolean clinchStar(ArrayList<Team> conf, Team t) {
        if (conf.indexOf(t) >= 1) {
            return false;
        }
        for (Team temp : conf) {
            if (!t.equals(temp)) {
                if (t.getWin() <= temp.getWin() + (NUM_OF_GAMES_PER_TEAM - (temp.getWin() + temp.getLoss()))) {
                    if (t.getWin() < temp.getWin() + (NUM_OF_GAMES_PER_TEAM - (temp.getWin() + temp.getLoss()))) {
                        return false;
                    }
                    if (t.getConWin() <= temp.getConWin() + (NUM_OF_CONF_PER_TEAM - (temp.getConWin() + temp.getConLoss()))) {
                        if (t.getConWin() < temp.getConWin() + (NUM_OF_CONF_PER_TEAM - (temp.getConWin() + temp.getConLoss()))) {
                            return false;
                        }
                        if (t.getWin() + t.getLoss() == NUM_OF_GAMES_PER_TEAM && temp.getWin() + temp.getLoss() == NUM_OF_GAMES_PER_TEAM) {
                            if (conf.indexOf(temp) < conf.indexOf(t)) {
                                return false;
                            }
                        }
                    }
                }
            }
        }
        return true;
    }

    private static boolean clinchX(ArrayList<Team> conf, Team t) {
        int seed = 1;
        if (conf.indexOf(t) >= 8) {
            return false;
        }
        for (Team temp : conf) {
            if (!t.equals(temp) && seed > 8) {
                if (t.getWin() <= temp.getWin() + (NUM_OF_GAMES_PER_TEAM - (temp.getWin() + temp.getLoss()))) {
                    if (t.getWin() < temp.getWin() + (NUM_OF_GAMES_PER_TEAM - (temp.getWin() + temp.getLoss()))) {
                        return false;
                    }
                    if (t.getConWin() <= temp.getConWin() + (NUM_OF_CONF_PER_TEAM - (temp.getConWin() + temp.getConLoss()))) {
                        if (t.getConWin() < temp.getConWin() + (NUM_OF_CONF_PER_TEAM - (temp.getConWin() + temp.getConLoss()))) {
                            return false;
                        }
                        if (t.getWin() + t.getLoss() == NUM_OF_GAMES_PER_TEAM && temp.getWin() + temp.getLoss() == NUM_OF_GAMES_PER_TEAM) {
                            if (conf.indexOf(temp) < conf.indexOf(t)) {
                                return false;
                            }
                        }
                    }
                }
            }
            seed++;
        }
        return true;
    }

    private static boolean clinchN(ArrayList<Team> conf, Team t) {
        if (conf.indexOf(t) <= 7) {
            return false;
        }
        int seed = 1;
        for (Team temp : conf) {
            if (!t.equals(temp) && seed < 9) {
                if (temp.getWin() <= t.getWin() + (NUM_OF_GAMES_PER_TEAM - (t.getWin() + t.getLoss()))) {
                    if (temp.getWin() < t.getWin() + (NUM_OF_GAMES_PER_TEAM - (t.getWin() + t.getLoss()))) {
                        return false;
                    }
                    if (temp.getConWin() <= t.getConWin() + (NUM_OF_CONF_PER_TEAM - (t.getConWin() + t.getConLoss()))) {
                        if (temp.getConWin() < t.getConWin() + (NUM_OF_CONF_PER_TEAM - (t.getConWin() + t.getConLoss()))) {
                            return false;
                        }
                        if (t.getWin() + t.getLoss() == NUM_OF_GAMES_PER_TEAM && temp.getWin() + temp.getLoss() == NUM_OF_GAMES_PER_TEAM) {
                            if (conf.indexOf(temp) > conf.indexOf(t)) {
                                return false;
                            }
                        }
                    }
                }
            }
            seed++;
        }
        return true;
    }

    public static void randomizeWL(int simulateToGame) throws IOException {
        if (simulateToGame > TOTAL_NUM_OF_GAMES) {
            simulateToGame = TOTAL_NUM_OF_GAMES;
        }
        for (int a = gamesPlayed; a < simulateToGame; a++) {
            int random = (int) (Math.random() * 2);
            Team one = schedule[0][a];
            Team two = schedule[1][a];
            boolean sameConf = one.getConference().equals(two.getConference());
            Map<Team, Integer> oHTH = one.getHTH();
            Map<Team, Integer> tHTH = two.getHTH();
            boolean homeWin;
            int onePoints = 0;
            int twoPoints = 0;
            if (random == 0) {
                one.setWin(one.getWin() + 1, sameConf);
                two.setLoss(two.getLoss() + 1, sameConf);
                if (oHTH.containsKey(two)) {
                    oHTH.put(two, oHTH.get(two) + 1);
                }
                else {
                    oHTH.put(two, 1);
                }
                if (!tHTH.containsKey(one)) {
                    tHTH.put(one, 0);
                }
                homeWin = true;
                onePoints++;
            }
            else {
                two.setWin(two.getWin() + 1, sameConf);
                one.setLoss(one.getLoss() + 1, sameConf);
                if (tHTH.containsKey(one)) {
                    tHTH.put(one, tHTH.get(one) + 1);
                }
                else {
                    tHTH.put(one, 1);
                }
                if (!oHTH.containsKey(two)) {
                    oHTH.put(two, 0);
                }
                homeWin = false;
                twoPoints++;
            }
            playedGame = true;
            gamesPlayed++;
            toFileResults(one, two, homeWin, onePoints, twoPoints);
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
        seriesQueue = new ArrayBlockingQueue<>(15);
        if (startInPlayoffs) {
            readPlayoffs();
        }
        else {
            messageToAdjustRatings(keyboard);
            series.set(0, new PlayoffSeries(0, eastern.get(0), eastern.get(7), 0, 0));
            series.set(1, new PlayoffSeries(1, eastern.get(1), eastern.get(6), 0, 0));
            series.set(2, new PlayoffSeries(2, eastern.get(2), eastern.get(5), 0, 0));
            series.set(3, new PlayoffSeries(3, eastern.get(3), eastern.get(4), 0, 0));
            series.set(4, new PlayoffSeries(4, western.get(0), western.get(7), 0, 0));
            series.set(5, new PlayoffSeries(5, western.get(1), western.get(6), 0, 0));
            series.set(6, new PlayoffSeries(6, western.get(2), western.get(5), 0, 0));
            series.set(7, new PlayoffSeries(7, western.get(3), western.get(4), 0, 0));
            seriesQueue.offer(series.get(0));
            seriesQueue.offer(series.get(4));
            seriesQueue.offer(series.get(1));
            seriesQueue.offer(series.get(5));
            seriesQueue.offer(series.get(2));
            seriesQueue.offer(series.get(6));
            seriesQueue.offer(series.get(3));
            seriesQueue.offer(series.get(7));
            tiebreakersComplete = "Y";
            toFileSchedule();
        }
        toFilePlayoffs();
        while (seriesQueue.peek() != null) {
            PlayoffSeries curSer = seriesQueue.poll();
            Team one = curSer.getHome();
            Team two = curSer.getAway();




            int oRank;
            int tRank;
            if (western.contains(one)) {
                oRank = western.indexOf(one) + 1;
            }
            else {
                oRank = eastern.indexOf(one) + 1;
            }
            if (western.contains(two)) {
                tRank = western.indexOf(two) + 1;
            }
            else {
                tRank = eastern.indexOf(two) + 1;
            }
            int gp = curSer.getAwayWins() + curSer.getHomeWins();
            playoffs = true;
            if (gp == 2 || gp == 3 || gp == 5) {
                System.out.println(two.displayToString());
                System.out.println(one.displayToString());
                System.out.println();
                System.out.println("(" + curSer.getAwayWins() + "-" + curSer.getHomeWins() + ")" + tRank + "." + two.getName()
                        + " vs " + oRank + "." + one.getName() + "(" + curSer.getHomeWins() + "-" + curSer.getAwayWins() + ")");
            }
            else {
                System.out.println(one.displayToString());
                System.out.println(two.displayToString());
                System.out.println();
                System.out.println("(" + curSer.getHomeWins() + "-" + curSer.getAwayWins() + ")" + oRank + "." + one.getName()
                        + " vs " + tRank + "." + two.getName() + "(" + curSer.getAwayWins() + "-" + curSer.getHomeWins() + ")");
            }
            System.out.print("Start Game? ");
            keyboard.nextLine();
            ArrayList<Player> oneRoster = new ArrayList<>(one.roster);
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
                if (i == 30) {
                    if (gp == 2 || gp == 3 || gp == 5)
                        System.out.print("End of the 1st: " + two.getName() + ": " + twoPoints + ", " + one.getName() + ": " + onePoints);
                    else
                        System.out.print("End of the 1st: " + one.getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
                    keyboard.nextLine();
                }
                else if (i == 60) {
                    if (gp == 2 || gp == 3 || gp == 5)
                        System.out.print("Halftime: " + two.getName() + ": " + twoPoints + ", " + one.getName() + ": " + onePoints);
                    else
                        System.out.print("Halftime: " + one.getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
                    keyboard.nextLine();
                }
                else if (i == 90) {
                    if (gp == 2 || gp == 3 || gp == 5)
                        System.out.print("End of the 3rd: " + two.getName() + ": " + twoPoints + ", " + one.getName() + ": " + onePoints);
                    else
                        System.out.print("End of the 3rd: " + one.getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
                    keyboard.nextLine();
                }
                else if (i > 109 && Math.abs(onePoints - twoPoints) <= 15) {
                    if (gp == 2 || gp == 3 || gp == 5)
                        System.out.print(endGamePoss-i + " Possessions left: " + two.getName() + ": " + twoPoints + ", " + one.getName() + ": " + onePoints + ", ");
                    else
                        System.out.print(endGamePoss-i + " Possessions left: " + one.getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints + ", ");
                    if (i%2 == 0) {
                        System.out.print(one.getAbreviation() + " Possession");
                    }
                    else {
                        System.out.print(two.getAbreviation() + " Possession");
                    }
                    keyboard.nextLine();
                }
                else if (i == 120) {
                    if (gp == 2 || gp == 3 || gp == 5)
                        System.out.print("End of the Regulation: " + two.getName() + ": " + twoPoints + ", " + one.getName() + ": " + onePoints);
                    else
                        System.out.print("End of the Regulation: " + one.getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
                    keyboard.nextLine();
                }
                else if (i%10 == 0 && i > 120) {
                    if (gp == 2 || gp == 3 || gp == 5)
                        System.out.print("End of " + OTCount + "OT: " + two.getName() + ": " + twoPoints + ", " + one.getName() + ": " + onePoints);
                    else
                        System.out.print("End of " + OTCount + "OT: " + one.getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
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
                int oddsToMake = playerWithBall.getRating() - defender.getRating() + 50;
                int madeScore = (int) (Math.random() * 100) + 1;
                int pointsScored = 0;
                if (oddsToMake >= madeScore) {
                    madeScore = Math.abs(madeScore - oddsToMake);
                    if (playerWithBall.getPosition().equals("PG") && madeScore >= 30) {
                        pointsScored = 3;
                    }
                    else if (playerWithBall.getPosition().equals("SG") && madeScore >= 30) {
                        pointsScored = 3;
                    }
                    else if (playerWithBall.getPosition().equals("SF") && madeScore >= 35) {
                        pointsScored = 3;
                    }
                    else if (playerWithBall.getPosition().equals("PF") && madeScore >= 40) {
                        pointsScored = 3;
                    }
                    else if (playerWithBall.getPosition().equals("C") && madeScore >= 50) {
                        pointsScored = 3;
                    }
                    else {
                        pointsScored = 2;
                    }
                    if (i > 109 && Math.abs(onePoints - twoPoints) <= 15) {
                        Team t = one;
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
            System.out.println(one.getName() + ": ");
            for (int i = 0; i < 5; i++) {
                Player p = oneRoster.get(i);
                System.out.println("(" + p.getPosition() + ")" + p.getName() + ": " + onePlayerPoints[i]);
            }
            System.out.println();
            System.out.println(two.getName() + ": ");
            for (int i = 0; i < 5; i++) {
                Player p = twoRoster.get(i);
                System.out.println("(" + p.getPosition() + ")" + p.getName() + ": " + twoPlayerPoints[i]);
            }

            if (onePoints > twoPoints) {
                curSer.homeWin();
            }
            else {
                curSer.awayWin();
            }

            System.out.println();
            if (gp == 2 || gp == 3 || gp == 5)
                System.out.print("Final Score: " + two.getName() + ": " + twoPoints + ", " + one.getName() + ": " + onePoints);
            else
                System.out.print("Final Score: " + one.getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
            if (OTCount > 0) {
                System.out.println("(" + OTCount + "OT)");
            }
            else {
                System.out.println();
            }
            playedGame = true;
            System.out.println();
            System.out.println(one.getName() + ": " + curSer.getHomeWins() + "-" + curSer.getAwayWins());
            System.out.println(two.getName() + ": " + curSer.getAwayWins() + "-" + curSer.getHomeWins());
            System.out.println();
            if (!curSer.isOver()) {
                seriesQueue.offer(curSer);
            }
            else {
                PlayoffSeries next = whereToNext(curSer);
                if (next != null && next.ready()) {
                    seriesQueue.offer(next);
                }
            }
            toFilePlayoffs();






//            int oRank;
//            int tRank;
//            if (western.contains(one)) {
//                oRank = western.indexOf(one) + 1;
//            }
//            else {
//                oRank = eastern.indexOf(one) + 1;
//            }
//            if (western.contains(two)) {
//                tRank = western.indexOf(two) + 1;
//            }
//            else {
//                tRank = eastern.indexOf(two) + 1;
//            }
//            int gp = curSer.getAwayWins() + curSer.getHomeWins();
//            playoffs = true;
//            if (gp == 2 || gp == 3 || gp == 5) {
//                System.out.println(two.displayToString());
//                System.out.println(one.displayToString());
//                System.out.println();
//                System.out.println("(" + curSer.getAwayWins() + "-" + curSer.getHomeWins() + ")" + tRank + "." + two.getName()
//                        + " vs " + oRank + "." + one.getName() + "(" + curSer.getHomeWins() + "-" + curSer.getAwayWins() + ")");
//            }
//            else {
//                System.out.println(one.displayToString());
//                System.out.println(two.displayToString());
//                System.out.println();
//                System.out.println("(" + curSer.getHomeWins() + "-" + curSer.getAwayWins() + ")" + oRank + "." + one.getName()
//                        + " vs " + tRank + "." + two.getName() + "(" + curSer.getAwayWins() + "-" + curSer.getHomeWins() + ")");
//            }
//            System.out.print("Who wins(type team abreviation): ");
//            boolean valid = false;
//            while (!valid) {
//                String answer = keyboard.nextLine().toUpperCase();
//                if (answer.equals(one.getAbreviation())) {
//                    valid = true;
//                    curSer.homeWin();
//                }
//                else if (answer.equals(two.getAbreviation())) {
//                    valid = true;
//                    curSer.awayWin();
//                }
//                else {
//                    System.out.print("not valid, try again: ");
//                }
//            }
//            playedGame = true;
//            System.out.println(one.getName() + ": " + curSer.getHomeWins() + "-" + curSer.getAwayWins());
//            System.out.println(two.getName() + ": " + curSer.getAwayWins() + "-" + curSer.getHomeWins());
//            System.out.println();
//            if (!curSer.isOver()) {
//                seriesQueue.offer(curSer);
//            }
//            else {
//                PlayoffSeries next = whereToNext(curSer);
//                if (next != null && next.ready()) {
//                    seriesQueue.offer(next);
//                }
//            }
//            toFilePlayoffs();
        }
    }

    private static PlayoffSeries whereToNext(PlayoffSeries ps) {
        Scanner keyboard = new Scanner(System.in);
        Team winner;
        if (ps.getHomeWins() == 4) {
            winner = ps.getHome();
        }
        else {
            winner = ps.getAway();
        }
        int whichSer = 0;
        while (!ps.equals(series.get(whichSer))) {
            whichSer++;
        }
        PlayoffSeries next = null;
        if (whichSer == 0 || whichSer == 3) {
            next = series.get(8);
        }
        else if (whichSer == 1 || whichSer == 2) {
            next = series.get(9);
        }
        else if (whichSer == 4 || whichSer == 7) {
            next = series.get(10);
        }
        else if (whichSer == 5 || whichSer == 6) {
            next = series.get(11);
        }
        else if (whichSer == 8 || whichSer == 9) {
            next = series.get(12);
        }
        else if (whichSer == 10 || whichSer == 11) {
            next = series.get(13);
        }
        else if (whichSer == 12 || whichSer == 13) {
            next = series.get(14);
        }
        else {
            return null;
        }
        if (next.getHome() == null) {
            next.newHome(winner);
        }
        else {
            Team temp = next.getHome();
            if (winner.getConference().equals(temp.getConference())) {
                ArrayList<Team> tempConf;
                if (winner.getConference().equals("E")) {
                    tempConf = eastern;
                }
                else if (winner.getConference().equals("W")) {
                    tempConf = western;
                }
                else {
                    throw new IllegalStateException("Conf should be E or W");
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
            else {
                if (winner.isBetterThan(temp)) {
                    next.newHome(winner);
                    next.newAway(temp);
                }
                else {
                    next.newAway(winner);
                }
            }
        }
        return next;
    }

    public static void toFilePlayoffs() throws IOException {
        StringBuilder sb = new StringBuilder("--Conference Quarter-Finals--" + "\n" + "-Eastern-" + "\n");
        for (int a = 0; a < 4; a++) {
            sb.append(series.get(a).getHomeWins()).append("-");
            if (series.get(a).getHome() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(series.get(a).getHome().getName());
            }
            sb.append(" vs ");
            if (series.get(a).getAway() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(series.get(a).getAway().getName());
            }
            sb.append("-").append(series.get(a).getAwayWins());
            sb.append("\n");
        }
        sb.append("-Western-").append("\n");
        for (int a = 4; a < 8; a++) {
            sb.append(series.get(a).getHomeWins()).append("-");
            if (series.get(a).getHome() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(series.get(a).getHome().getName());
            }
            sb.append(" vs ");
            if (series.get(a).getAway() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(series.get(a).getAway().getName());
            }
            sb.append("-").append(series.get(a).getAwayWins());
            sb.append("\n");
        }
        sb.append("\n").append("--Conference Semi-Finals--").append("\n").append("-Eastern-").append("\n");
        for (int a = 8; a < 10; a++) {
            sb.append(series.get(a).getHomeWins()).append("-");
            if (series.get(a).getHome() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(series.get(a).getHome().getName());
            }
            sb.append(" vs ");
            if (series.get(a).getAway() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(series.get(a).getAway().getName());
            }
            sb.append("-").append(series.get(a).getAwayWins());
            sb.append("\n");
        }
        sb.append("-Western-").append("\n");
        for (int a = 10; a < 12; a++) {
            sb.append(series.get(a).getHomeWins()).append("-");
            if (series.get(a).getHome() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(series.get(a).getHome().getName());
            }
            sb.append(" vs ");
            if (series.get(a).getAway() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(series.get(a).getAway().getName());
            }
            sb.append("-").append(series.get(a).getAwayWins());
            sb.append("\n");
        }
        sb.append("\n").append("--Conference Finals--").append("\n").append("-Eastern-").append("\n");
        for (int a = 12; a < 13; a++) {
            sb.append(series.get(a).getHomeWins()).append("-");
            if (series.get(a).getHome() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(series.get(a).getHome().getName());
            }
            sb.append(" vs ");
            if (series.get(a).getAway() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(series.get(a).getAway().getName());
            }
            sb.append("-").append(series.get(a).getAwayWins());
            sb.append("\n");
        }
        sb.append("-Western-").append("\n");
        for (int a = 13; a < 14; a++) {
            sb.append(series.get(a).getHomeWins()).append("-");
            if (series.get(a).getHome() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(series.get(a).getHome().getName());
            }
            sb.append(" vs ");
            if (series.get(a).getAway() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(series.get(a).getAway().getName());
            }
            sb.append("-").append(series.get(a).getAwayWins());
            sb.append("\n");
        }
        sb.append("\n").append("--FBA Finals--").append("\n");
        for (int a = 14; a < 15; a++) {
            sb.append(series.get(a).getHomeWins()).append("-");
            if (series.get(a).getHome() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(series.get(a).getHome().getName());
            }
            sb.append(" vs ");
            if (series.get(a).getAway() == null) {
                sb.append("TBD");
            }
            else {
                sb.append(series.get(a).getAway().getName());
            }
            sb.append("-").append(series.get(a).getAwayWins());
            sb.append("\n");
        }
        sb.append("\n").append("\n").append("Next Games:").append("\n");
        if (seriesQueue != null) {
            for (PlayoffSeries ps : seriesQueue) {
                sb.append(ps.getSeriesNum()).append("/").append(ps.getHome().getAbreviation())
                        .append("/").append(ps.getAway().getAbreviation()).append("/")
                        .append(ps.getHomeWins()).append("/").append(ps.getAwayWins()).append("\n");
            }
        }
        File file = new File("FBA/Playoffs.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    public static void readPlayoffs() throws IOException {
        updateStandings();
        Scanner input = new Scanner(new File("FBA/Playoffs.txt"));
        int seriesNum = 0;
        boolean doneRead = false;
        while (input.hasNextLine() && !doneRead) {
            String line = input.nextLine();
            if (line.equals("Next Games:")) {
                doneRead = true;
            }
            else if (line.length() > 1 && line.charAt(0) != '-') {
                Object[] teams = line.split(" vs ");
                Object[] teamOne = ((String) teams[0]).split("-");
                Object[] teamTwo = ((String) teams[1]).split("-");
                if (teamOne.length > 2) {
                    teamOne[1] = "Oakland All-Stars";
                }
                if (teamTwo.length > 2) {
                    teamTwo[0] = "Oakland All-Stars";
                    teamTwo[1] = teamTwo[2];
                }
                PlayoffSeries thisSer = series.get(seriesNum);
                thisSer.setSeriesNum(seriesNum);
                thisSer.newHome(teamNames.get((String) teamOne[1]));
                thisSer.newAway(teamNames.get((String) teamTwo[0]));
                thisSer.setHomeWins(Integer.parseInt((String) teamOne[0]));
                thisSer.setAwayWins(Integer.parseInt((String) teamTwo[1]));
                seriesNum++;
            }
        }
        while (input.hasNextLine()) {
            String line = input.nextLine();
            Object[] a = line.split("/");
            seriesNum = Integer.parseInt((String) a[0]);
            seriesQueue.offer(series.get(seriesNum));
        }
    }

    public static void checkTies(Scanner keyboard) throws IOException {
        for (int a = 0; a < 13; a++) {
            Team one = eastern.get(a);
            Team two = eastern.get(a + 1);
            if (one.getWin() == two.getWin() && one.getConWin() == two.getConWin()) {
                System.out.println("Tiebreaker:");
                System.out.println(one.displayToString());
                System.out.println(two.displayToString());
                System.out.println(one.getName() + " or " + two.getName());
                System.out.print("Answer: ");
                String answer = keyboard.nextLine().toUpperCase();
                while (!answer.equals(one.getAbreviation()) && !answer.equals(two.getAbreviation())) {
                    System.out.print("Try again: ");
                    answer = keyboard.nextLine().toUpperCase();
                }
                if (!answer.equals(one.getAbreviation())) {
                    eastern.set(a, two);
                    eastern.set(a + 1, one);
                    toFileWL();
                    makeGoodLookinStandings();
                }
            }
        }
        for (int a = 0; a < 13; a++) {
            Team one = western.get(a);
            Team two = western.get(a + 1);
            if (one.getWin() == two.getWin() && one.getConWin() == two.getConWin()) {
                System.out.println("Tiebreaker:");
                System.out.println(one.displayToString());
                System.out.println(two.displayToString());
                System.out.println(one.getName() + " or " + two.getName());
                System.out.print("Answer: ");
                String answer = keyboard.nextLine().toUpperCase();
                while (!answer.equals(one.getAbreviation()) && !answer.equals(two.getAbreviation())) {
                    System.out.print("Try again: ");
                    answer = keyboard.nextLine().toUpperCase();
                }
                if (!answer.equals(one.getAbreviation())) {
                    western.set(a, two);
                    western.set(a + 1, one);
                    toFileWL();
                    makeGoodLookinStandings();
                }
            }
        }
        tiebreakersComplete = "Y";
        toFileSchedule();
    }

    public static void toFileRemainingSchedule() throws IOException {
        StringBuilder sb = new StringBuilder();
        for (int a = gamesPlayed; a < TOTAL_NUM_OF_GAMES; a++) {
            Team b = schedule[0][a];
            Team c = schedule[1][a];
            sb.append("(").append(b.getWin()).append("-").append(b.getLoss()).append(")")
                    .append(b.getName()).append(" vs ").append(c.getName()).append("(")
                    .append(c.getWin()).append("-").append(c.getLoss()).append(")");
            int bRank;
            int cRank;
            if (b.getConference().equals("E")) {
                bRank = eastern.indexOf(b);
            }
            else {
                bRank = western.indexOf(b);
            }
            if (c.getConference().equals("E")) {
                cRank = eastern.indexOf(c);
            }
            else {
                cRank = western.indexOf(c);
            }
            if (cRank < 3 && bRank < 3) {
                sb.append("*");
                if (cRank < 2 && bRank < 2) {
                    sb.append("*");
                    if (cRank < 1 && bRank < 1) {
                        sb.append("*");
                    }
                }
            }
            sb.append("\n");
        }
        File file = new File("FBA/Schedule-Remaining.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    private static void printTopPlayers(int rating) {
        String[] pos = new String[] {"PG", "SG", "SF", "PF", "C"};
        for (String po : pos) {
            for (Team t : teams.values()) {
                for (Player p : t.getPlayers()) {
                    if (p.getRating() >= rating && p.getPosition().equals(po)) {
                        System.out.println(po + " - " + p.getName() + " - " + t.getAbreviation()
                                + " - " + p.getRating());
                    }
                }
            }
        }
    }

    private static void readResultsForHTH() throws FileNotFoundException {
        Scanner input = new Scanner(new File("FBA/Results.txt"));
        while (input.hasNextLine()) {
            String line = input.nextLine();
            if (line.length() > 1) {
                Object[] a = line.split(",");
                Team winner;
                Team loser;
                if (Integer.parseInt((String) a[2]) > Integer.parseInt((String) a[4])) {
                    winner = teamNames.get((String) a[1]);
                    loser = teamNames.get((String) a[3]);
                }
                else {
                    loser = teamNames.get((String) a[1]);
                    winner = teamNames.get((String) a[3]);
                }
                Map<Team, Integer> wHTH = winner.getHTH();
                Map<Team, Integer> lHTH = loser.getHTH();
                if (wHTH.containsKey(loser)) {
                    wHTH.put(loser, wHTH.get(loser) + 1);
                }
                else {
                    wHTH.put(loser, 1);
                }
                if (!lHTH.containsKey(winner)) {
                    lHTH.put(winner, 0);
                }
            }
        }
    }
}