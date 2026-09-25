package fbajc;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.text.DecimalFormat;
import java.util.*;

public class Main {
    //instance variables
    private static TreeMap<String, Team> teams;
    public static TreeMap<String, Team> teamNames;
    public static ArrayList<Team> Big12;
    public static ArrayList<Team> ACC;
    public static ArrayList<Team> BigEast;
    public static ArrayList<Team> SEC;
    public static ArrayList<Team> BigTen;
    public static ArrayList<Team> American;
    public static ArrayList<Team> PAC12;
    public static ArrayList<Team> Atlantic10;
    public static ArrayList<Team> Patriot;
    public static ArrayList<Team> Colonial;
    public static ArrayList<Team> Horizon;
    public static ArrayList<Team> Ivy;
    public static ArrayList<Team> Southern;
    public static ArrayList<Team> SunBelt;
    public static ArrayList<Team> BigSky;
    public static ArrayList<Team> MountainWest;
    public static ArrayList<Team> OhioValley;
    public static ArrayList<Team> Northeast;
    public static ArrayList<ArrayList<Team>> allConferences;
    public static ArrayList<Team> rankings;
    public static ArrayList<Team> inRanks;
    public static ArrayList<Team> preSeasonRanks;
    private static Team[][] schedule;
    public static int gamesPlayed;
    private static final int TOTAL_NUM_CONF_GAMES = 2376; //NUM_OF_TEAMS * 11 //change to NUM_TEAMS * 9 if 18 conf games
    static final int CONF_CHALLENGE_TOTAL = 432; //NUM_OF_TEAMS * 2
    static final int PRE_S_TOURN_TOTAL = 324; //NUM_OF_TEAMS * 1.5
    private static final int TOTAL_NUM_OF_GAMES = TOTAL_NUM_CONF_GAMES + CONF_CHALLENGE_TOTAL + PRE_S_TOURN_TOTAL;
    public static boolean confTournies;
    public static boolean marchMadness;
    public static boolean reading;
    public static boolean updateNames;
    private static PriorityQueue<PreSeasonTourny> preSeasonTournies;
    private static PriorityQueue<PostSeasonTourny> postSeasonTournies;
    private static ArrayList<PreSeasonTourny> preTourniesInOrder;
    private static ArrayList<PostSeasonTourny> postTourniesInOrder;
    public static Set<Team> confChamps;
    private static MarchMadness theBracket;
    private static NIT theNIT;
    public static int season;
    public static boolean simulatePreST;
    public static boolean simulateSeason;
    public static boolean simulateConfT;
    public static ArrayList<Team> lastChampionship;
    public static double averageTeamRatings;

    public static void main(String[] args) throws IOException {
        season = 78;
        reading = true;
        Scanner keyboard = new Scanner(System.in);
        readRosters();
        readOrMakeSchedule(true, false); //true if reading a schedule, true to print
        if (gamesPlayed == 0) {
            clearBrackets();
        }
        readEarlyRanks();
        if (gamesPlayed > (PRE_S_TOURN_TOTAL - 1)) {
            readRankings();
        }
        readOrResetRecords(true); //true is reading in records
        reading = false;
        confTournies = false;
        marchMadness = false;
//        randomizeWL(2422); //debugger that simulates to specified game(PRE=0,REG=252,CONF=2268,MM=2422)
        simulatePreST = false; //switch for simulating the pre season tournies
        simulateSeason = false; //switch for simulating the season
        simulateConfT = false; //switch for simulating the conf tournies
        if (gamesPlayed == TOTAL_NUM_OF_GAMES) {
            updateRankings(false);
        }
        toFileBestScorers();
        playPreSeasonTournies();
        playGames(keyboard);
        confTournies = true;
        playConfTournies();
        confTournies = false;
        marchMadness = true;
        playNIT();
        playMarchMadness();
        System.out.print("Congrats " + theBracket.getChampion().getName() + ", ");
        System.out.println("you are S" + season + " FBAJC National Champions!");
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
    public static void toFile() throws IOException {
        StringBuilder sb = new StringBuilder(teams.size() + "\n");
        //Go through each abr to find each team
        for (ArrayList<Team> conf: allConferences) {
            ArrayList<Team> sorted_conf = new ArrayList<>(conf);
            sorted_conf.sort(Comparator.comparing(t -> t.getName().toLowerCase()));
            for (Team t : sorted_conf) {
                sb.append(t.getName()).append("/").append(t.getAbreviation().toUpperCase()).append("/")
                        .append(t.getConference()).append("\n");
                int teamSize = t.getPlayers().length + t.getReserves().size();
                sb.append(teamSize).append("\n");
                //Add each player to the long string
                for (Player p : t.getPlayers()) {
                    String n = p.getName();
                    String po = p.getPosition();
                    String g = p.getGrade();
                    String r = p.getRating();
                    int cr = p.cur_rating;
                    int poi = p.points;
                    sb.append(n).append("/").append(po).append("/").append(r).append("/")
                            .append(g).append("/").append(cr).append("/").append(poi).append("\n");
                }
            }
        }
        sb.append(lastChampionship.get(0).getName()).append("\n");
        sb.append(lastChampionship.get(1).getName()).append("\n");
        //write the long string to the file
        File file = new File("FBAJC/FBAJCRosters");
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
        StringBuilder sb = new StringBuilder("-Big 12-" + "\n" + "\n");
        sb.append(WLHelp(Big12));
        sb.append("\n" + "-ACC-" + "\n" + "\n");
        sb.append(WLHelp(ACC));
        sb.append("\n" + "-Big East-" + "\n" + "\n");
        sb.append(WLHelp(BigEast));
        sb.append("\n" + "-SEC-" + "\n" + "\n");
        sb.append(WLHelp(SEC));
        sb.append("\n" + "-Big Ten-" + "\n" + "\n");
        sb.append(WLHelp(BigTen));
        sb.append("\n" + "-American-" + "\n" + "\n");
        sb.append(WLHelp(American));
        sb.append("\n" + "-PAC 12-" + "\n" + "\n");
        sb.append(WLHelp(PAC12));
        sb.append("\n" + "-Atlantic 10-" + "\n" + "\n");
        sb.append(WLHelp(Atlantic10));
        sb.append("\n" + "-Patriot-" + "\n" + "\n");
        sb.append(WLHelp(Patriot));
        sb.append("\n" + "-Colonial-" + "\n" + "\n");
        sb.append(WLHelp(Colonial));
        sb.append("\n" + "-Horizon-" + "\n" + "\n");
        sb.append(WLHelp(Horizon));
        sb.append("\n" + "-Ivy League-" + "\n" + "\n");
        sb.append(WLHelp(Ivy));
        sb.append("\n" + "-Southern-" + "\n" + "\n");
        sb.append(WLHelp(Southern));
        sb.append("\n" + "-Sun Belt-" + "\n" + "\n");
        sb.append(WLHelp(SunBelt));
        sb.append("\n" + "-Big Sky-" + "\n" + "\n");
        sb.append(WLHelp(BigSky));
        sb.append("\n" + "-Mountain West-" + "\n" + "\n");
        sb.append(WLHelp(MountainWest));
        sb.append("\n" + "-Ohio Valley-" + "\n" + "\n");
        sb.append(WLHelp(OhioValley));
        sb.append("\n" + "-NEC-" + "\n" + "\n");
        sb.append(WLHelp(Northeast));
        File file = new File("FBAJC/records");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    private static String WLHelp(ArrayList<Team> conf) {
        StringBuilder sb = new StringBuilder();
        for (Team t : conf) {
            sb.append(t.getName()).append(": ").append(t.getWin()).
                    append("-").append(t.getLoss()).append("-").append(t.getConWin()).append("-")
                    .append(t.getConLoss()).append("\n");
        }
        return sb.toString();
    }

    /**
     * read in the rosters and basic team info from the FBAJCRosters file
     *
     * @param input pre: none
     * @throws IOException 
     */
    public static void readRosters() throws IOException {
        List<String> lines = Files.readAllLines(Paths.get("FBAJC/FBAJCRosters"), StandardCharsets.UTF_8);

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
                String rat = (String) playerArray[2];
                String cla = (String) playerArray[3];
                int rati = Integer.parseInt((String) playerArray[4]);
                int poi = Integer.parseInt((String) playerArray[5]);
                if (!cla.equals("X")) {
                    players.add(new Player(name, pos, rat, cla, rati, poi));
                }
            }
            Team t = new Team(teamName, players, teamAbr, conf);
            teams.put(teamAbr.toUpperCase(), t);
            teamNames.put(teamName, t);
        }
        lastChampionship = new ArrayList<>();
        lastChampionship.add(teamNames.get(lines.get(line_num)));
        line_num++;
        lastChampionship.add(teamNames.get(lines.get(line_num)));
        line_num++;
        //add teams to their conference
        allConferences = new ArrayList<>();
        Big12 = new ArrayList<>();
        allConferences.add(Big12);
        ACC = new ArrayList<>();
        allConferences.add(ACC);
        BigEast = new ArrayList<>();
        allConferences.add(BigEast);
        SEC = new ArrayList<>();
        allConferences.add(SEC);
        BigTen = new ArrayList<>();
        allConferences.add(BigTen);
        American = new ArrayList<>();
        allConferences.add(American);
        PAC12 = new ArrayList<>();
        allConferences.add(PAC12);
        Atlantic10 = new ArrayList<>();
        allConferences.add(Atlantic10);
        Patriot = new ArrayList<>();
        allConferences.add(Patriot);
        Colonial = new ArrayList<>();
        allConferences.add(Colonial);
        Horizon = new ArrayList<>();
        allConferences.add(Horizon);
        Ivy = new ArrayList<>();
        allConferences.add(Ivy);
        Southern = new ArrayList<>();
        allConferences.add(Southern);
        SunBelt = new ArrayList<>();
        allConferences.add(SunBelt);
        BigSky = new ArrayList<>();
        allConferences.add(BigSky);
        MountainWest = new ArrayList<>();
        allConferences.add(MountainWest);
        OhioValley = new ArrayList<>();
        allConferences.add(OhioValley);
        Northeast = new ArrayList<>();
        allConferences.add(Northeast);
        rankings = new ArrayList<>();
        inRanks = new ArrayList<>();
        for (String abr : teams.keySet()) {
            Team t = teams.get(abr);
            if (t.getConference().equals("B12")) {
                Big12.add(t);
                t.setConf(Big12);
            }
            else if (t.getConference().equals("ACC")) {
                ACC.add(t);
                t.setConf(ACC);
            }
            else if (t.getConference().equals("BE")) {
                BigEast.add(t);
                t.setConf(BigEast);
            }
            else if (t.getConference().equals("SEC")) {
                SEC.add(t);
                t.setConf(SEC);
            }
            else if (t.getConference().equals("B10")) {
                BigTen.add(t);
                t.setConf(BigTen);
            }
            else if (t.getConference().equals("AAC")) {
                American.add(t);
                t.setConf(American);
            }
            else if (t.getConference().equals("P12")) {
                PAC12.add(t);
                t.setConf(PAC12);
            }
            else if (t.getConference().equals("A10")) {
                Atlantic10.add(t);
                t.setConf(Atlantic10);
            }
            else if (t.getConference().equals("PAT")) {
                Patriot.add(t);
                t.setConf(Patriot);
            }
            else if (t.getConference().equals("COL")) {
                Colonial.add(t);
                t.setConf(Colonial);
            }
            else if (t.getConference().equals("HOR")) {
                Horizon.add(t);
                t.setConf(Horizon);
            }
            else if (t.getConference().equals("IVY")){
                Ivy.add(t);
                t.setConf(Ivy);
            }
            else if (t.getConference().equals("SOCON")) {
                Southern.add(t);
                t.setConf(Southern);
            }
            else if (t.getConference().equals("SUN")) {
                SunBelt.add(t);
                t.setConf(SunBelt);
            }
            else if (t.getConference().equals("SKY")) {
                BigSky.add(t);
                t.setConf(BigSky);
            }
            else if (t.getConference().equals("MWC")) {
                MountainWest.add(t);
                t.setConf(MountainWest);
            }
            else if (t.getConference().equals("OVC")) {
                OhioValley.add(t);
                t.setConf(OhioValley);
            }
            else {
                Northeast.add(t);
                t.setConf(Northeast);
            }
        }
    }

    public static void makeSchedule() throws IOException {
        schedule = new Team[2][TOTAL_NUM_CONF_GAMES + CONF_CHALLENGE_TOTAL];
        int game = 0;
        readEarlyRanks();
        toFilePreSeasonRankingsHistory();
        toFileConferencePreSeasonRankings();
        toFilePreSeasonRanks();
        PriorityQueue<ScheduleTeam> gamesLeftOrder = new PriorityQueue<>();
        //3 Parts: tournaments, conf challenges, conf games
        ArrayList<ArrayList<Team>> conferences = new ArrayList<>();
        ArrayList<ArrayList<Team>> order = new ArrayList<>();
        ArrayList<ArrayList<Team>> PreST = new ArrayList<>();
        conferences.add(Big12);
        conferences.add(ACC);
        conferences.add(BigEast);
        conferences.add(SEC);
        conferences.add(BigTen);
        conferences.add(American);
        conferences.add(PAC12);
        conferences.add(Atlantic10);
        conferences.add(Patriot);
        conferences.add(Colonial);
        conferences.add(Horizon);
        conferences.add(Ivy);
        conferences.add(Southern);
        conferences.add(SunBelt);
        conferences.add(BigSky);
        conferences.add(MountainWest);
        conferences.add(OhioValley);
        conferences.add(Northeast);
        while (!conferences.isEmpty()) {
            int rand = (int) (Math.random() * conferences.size());
            ArrayList<Team> temp = conferences.remove(rand);
            order.add(temp);
            PreST.add(temp);
        }
        //part 1
        makePreTournys(PreST);
        readFirstPreTournys();
        //part 2
        //Conference challenge sets
        int[] confChalOrder;
        for (int amt = 0; amt < 4; amt++) {
            //first set
            if (amt == 0) {
                confChalOrder = new int[] {0,1,8,10,9,17,7,11,2,16,6,12,3,15,5,13,4,14};
            }
            //second set
            else if (amt == 1) {
                confChalOrder = new int[] {9,10,0,2,8,11,1,17,7,12,3,16,6,13,4,15,5,14};
            }
            //third set
            else if (amt == 2) {
                confChalOrder = new int[] {1,2,9,11,0,3,8,12,10,17,7,13,4,16,6,14,5,15};
            }
            //forth set
            else {
                confChalOrder = new int[] {10,11,1,3,9,12,0,4,8,13,2,17,7,14,5,16,6,15};
            }
            for (int b = 0; b < 18; b++) {
                ArrayList<Team> c1 = new ArrayList<>(order.get(confChalOrder[b]));
                b++;
                ArrayList<Team> c2 = new ArrayList<>(order.get(confChalOrder[b]));
                ArrayList<Team> c1r = new ArrayList<>();
                ArrayList<Team> c2r = new ArrayList<>();
                while (!c1.isEmpty()) {
                    int rand = (int) (Math.random() * c1.size());
                    c1r.add(c1.remove(rand));
                }
                while (!c2.isEmpty()) {
                    int rand = (int) (Math.random() * c2.size());
                    c2r.add(c2.remove(rand));
                }
                for (int a = 0; a < c1r.size(); a++) {
                    int home = (int) (Math.random() * 2);
                    if (home == 0) {
                        schedule[0][game] = c1r.get(a);
                        schedule[1][game] = c2r.get(a);
                    }
                    else if (home == 1) {
                        schedule[1][game] = c1r.get(a);
                        schedule[0][game] = c2r.get(a);
                    }
                    game++;
                }
            }
        }
        //Add teams to scheduling priority queue, part 3
        for (Team t : Big12) {
            gamesLeftOrder.add(new ScheduleTeam(t, "Big 12", Big12));
        }
        for (Team t : ACC) {
            gamesLeftOrder.add(new ScheduleTeam(t, "ACC", ACC));
        }
        for (Team t : BigEast) {
            gamesLeftOrder.add(new ScheduleTeam(t, "Big East", BigEast));
        }
        for (Team t : SEC) {
            gamesLeftOrder.add(new ScheduleTeam(t, "SEC", SEC));
        }
        for (Team t : BigTen) {
            gamesLeftOrder.add(new ScheduleTeam(t, "Big Ten", BigTen));
        }
        for (Team t : American) {
            gamesLeftOrder.add(new ScheduleTeam(t, "American", American));
        }
        for (Team t : PAC12) {
            gamesLeftOrder.add(new ScheduleTeam(t, "PAC 12", PAC12));
        }
        for (Team t : Atlantic10) {
            gamesLeftOrder.add(new ScheduleTeam(t, "Atlantic 10", Atlantic10));
        }
        for (Team t : Patriot) {
            gamesLeftOrder.add(new ScheduleTeam(t, "Patriot", Patriot));
        }
        for (Team t : Colonial) {
            gamesLeftOrder.add(new ScheduleTeam(t, "Colonial", Colonial));
        }
        for (Team t : Horizon) {
            gamesLeftOrder.add(new ScheduleTeam(t, "Horizon", Horizon));
        }
        for (Team t : Ivy) {
            gamesLeftOrder.add(new ScheduleTeam(t, "Ivy", Ivy));
        }
        for (Team t : Southern) {
            gamesLeftOrder.add(new ScheduleTeam(t, "Southern", Southern));
        }
        for (Team t : SunBelt) {
            gamesLeftOrder.add(new ScheduleTeam(t, "Sun Belt", SunBelt));
        }
        for (Team t : BigSky) {
            gamesLeftOrder.add(new ScheduleTeam(t, "Big Sky", BigSky));
        }
        for (Team t : MountainWest) {
            gamesLeftOrder.add(new ScheduleTeam(t, "Mountain West", MountainWest));
        }
        for (Team t : OhioValley) {
            gamesLeftOrder.add(new ScheduleTeam(t, "Ohio Valley", OhioValley));
        }
        for (Team t : Northeast) {
            gamesLeftOrder.add(new ScheduleTeam(t, "NEC", Northeast));
        }
        //Create a scheduleTeam map to find a team's ScheduleTeam later
        Map<Team, ScheduleTeam> scheduleTeams = new HashMap<>();
        for (ScheduleTeam st : gamesLeftOrder) {
            scheduleTeams.put(st.getTeam(), st);
        }
        boolean homeT = false; //true if temp is playing at home
        //choose which 4 teams within each conference each team doesn't play twice (from 22 to 18 conf games)
        //loop through until each schedule team has 18 games remaining
//        while (gamesLeftOrder.peek().getGamesLeft() > 18) {
//            ScheduleTeam temp = gamesLeftOrder.poll(); //Finds next team needing a game
//            int homeAway = (int) (Math.random() * 2); //Home chosen if 0, away if 1
//            Team opp;
//            ScheduleTeam oppon = temp;
//            boolean oppFound = false;
//            //loop through until a valid opponent is found
//            while (!oppFound) {
//                if (temp.getHomeGamesLeft() == 9) {
//                    //Can't play any more home games
//                    opp = temp.findAwayOpp();
//                    homeT = false;
//                    oppon = scheduleTeams.get(opp); //find the opponents scheduleTeam
//                    if (oppon.getHomeGamesLeft() > 9) {
//                        oppFound = true;
//                    }
//                }
//                else if (temp.getAwayGamesLeft() == 9) {
//                    //Can't play any more away games
//                    opp = temp.findHomeOpp();
//                    homeT = true;
//                    oppon = scheduleTeams.get(opp); //find the opponents scheduleTeam
//                    if (oppon.getAwayGamesLeft() > 9) {
//                        oppFound = true;
//                    }
//                }
//                else {
//                    //Can play either home or away, choose one at random
//                    if (homeAway == 0) {
//                        opp = temp.findHomeOpp();
//                        homeT = true;
//                        oppon = scheduleTeams.get(opp); //find the opponents scheduleTeam
//                        if (oppon.getAwayGamesLeft() > 9) {
//                            oppFound = true;
//                        }
//                    }
//                    else {
//                        opp = temp.findAwayOpp();
//                        homeT = false;
//                        oppon = scheduleTeams.get(opp); //find the opponents scheduleTeam
//                        if (oppon.getHomeGamesLeft() > 9) {
//                            oppFound = true;
//                        }
//                    }
//                }
//            }
//            if (!homeT) {
//                oppon.adjustSchedule(temp.getTeam(), true);
//                temp.adjustSchedule(oppon.getTeam(), false);
//            }
//            else {
//                oppon.adjustSchedule(temp.getTeam(), false);
//                temp.adjustSchedule(oppon.getTeam(), true);
//            }
//            gamesLeftOrder.remove(oppon);
//            gamesLeftOrder.add(temp);
//            gamesLeftOrder.add(oppon);
//        }
//        //The money maker loop, finds which games to put
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

    public static void makePreTournys(ArrayList<ArrayList<Team>> confs) throws IOException {
        StringBuilder sb = new StringBuilder();
        ArrayList<ArrayList<Team>> next = new ArrayList<>();
        ArrayList<ArrayList<Team>> total = new ArrayList<>();
        ArrayList<Team> rankedTeams = new ArrayList<>(preSeasonRanks);
        ArrayList<Team> curTour = new ArrayList<>();
        ArrayList<String> preSTNames = new ArrayList<>();
        ArrayList<Team> conf1 = new ArrayList<>(confs.get(0));
        ArrayList<Team> conf2 = new ArrayList<>(confs.get(1));
        ArrayList<Team> conf3 = new ArrayList<>(confs.get(2));
        ArrayList<Team> conf4 = new ArrayList<>(confs.get(3));
        ArrayList<Team> conf5 = new ArrayList<>(confs.get(4));
        ArrayList<Team> conf6 = new ArrayList<>(confs.get(5));
        ArrayList<Team> conf7 = new ArrayList<>(confs.get(6));
        ArrayList<Team> conf8 = new ArrayList<>(confs.get(7));
        ArrayList<Team> conf9 = new ArrayList<>(confs.get(8));
        ArrayList<Team> conf10 = new ArrayList<>(confs.get(9));
        ArrayList<Team> conf11 = new ArrayList<>(confs.get(10));
        ArrayList<Team> conf12 = new ArrayList<>(confs.get(11));
        ArrayList<Team> conf13 = new ArrayList<>(confs.get(12));
        ArrayList<Team> conf14 = new ArrayList<>(confs.get(13));
        ArrayList<Team> conf15 = new ArrayList<>(confs.get(14));
        ArrayList<Team> conf16 = new ArrayList<>(confs.get(15));
        ArrayList<Team> conf17 = new ArrayList<>(confs.get(16));
        ArrayList<Team> conf18 = new ArrayList<>(confs.get(17));
        total.add(conf1);
        total.add(conf2);
        total.add(conf3);
        total.add(conf4);
        total.add(conf5);
        total.add(conf6);
        total.add(conf7);
        total.add(conf8);
        total.add(conf9);
        total.add(conf10);
        total.add(conf11);
        total.add(conf12);
        total.add(conf13);
        total.add(conf14);
        total.add(conf15);
        total.add(conf16);
        total.add(conf17);
        total.add(conf18);
        preSTNames.add("Champions Classic");
        preSTNames.add("Maui Jim Invitational");
        preSTNames.add("Goodyear Classic");
        preSTNames.add("Nike Invitational");
        preSTNames.add("Chick-Fil-A Opener");
        preSTNames.add("Fanatics Invitational");
        preSTNames.add("Cuts Classic");
        preSTNames.add("Alaska Invitational");
        preSTNames.add("Panda Express Battle");
        preSTNames.add("South Beach Tip Off");
        preSTNames.add("Battle 4 Atlantis");
        preSTNames.add("Jimmy V Classic");
        preSTNames.add("DCB Tip Off");
        preSTNames.add("Green Gun Tip Off");
        preSTNames.add("Independence Opener");
        preSTNames.add("Fresno Face off");
        preSTNames.add("Sunshine Slam");
        preSTNames.add("Cancun Challenge");
        preSTNames.add("Emerald Coast Classic");
        preSTNames.add("Empire Classic");
        preSTNames.add("Hall of Fame Classic");
        preSTNames.add("Dole Derby");
        preSTNames.add("Lone Star Classic");
        preSTNames.add("London Invitational");
        preSTNames.add("Austin Showdown");
        preSTNames.add("ESPN Battle");
        preSTNames.add("Boston Bucks InvitationalAu");
        //Champions Classic
        sb.append("Champions Classic").append("\n");
        int rankedInChampClass = 0;
        curTour.add(lastChampionship.get(0));
        if (rankedTeams.contains(lastChampionship.get(0))) {
            rankedInChampClass++;
            rankedTeams.remove(lastChampionship.get(0));
        }
        for (ArrayList<Team> conf: total) {
            conf.remove(lastChampionship.get(0));
        }
        if (!lastChampionship.get(0).getConference().equals(lastChampionship.get(1).getConference())) {
            curTour.add(lastChampionship.get(1));
            if (rankedTeams.contains(lastChampionship.get(1))) {
                rankedInChampClass++;
                rankedTeams.remove(lastChampionship.get(1));
            }
            for (ArrayList<Team> conf: total) {
                conf.remove(lastChampionship.get(1));
            }
        }
        for (int a = rankedInChampClass; a < 4; a++) {
            boolean valid = false;
            Team t = null;
            while (!valid) {
                int rand = (int) (Math.random() * rankedTeams.size());
                t = rankedTeams.get(rand);
                valid = true;
                for (Team te: curTour) {
                    if (te.getConference().equals(t.getConference())) {
                        valid = false;
                        break;
                    }
                }
            }
            curTour.add(t);
            rankedTeams.remove(t);
            for (ArrayList<Team> conf: total) {
                conf.remove(t);
            }
        }
        for (int a = curTour.size() - 4; a < 4; a++) {
            boolean valid = false;
            Team t = null;
            ArrayList<Team> confe = null;
            while (!valid) {
                confe = total.get((int) (Math.random() * total.size()));
                t = confe.get((int) (Math.random() * confe.size()));
                valid = true;
                for (Team te: curTour) {
                    if (te.getConference().equals(t.getConference())) {
                        valid = false;
                        break;
                    }
                }
                if (rankedTeams.contains(t)) {
                    valid = false;
                }
            }
            confe.remove(t);
            total.remove(confe);
            next.add(confe);
            curTour.add(t);
            for (ArrayList<Team> conf: total) {
                conf.remove(t);
            }
        }
        for (Team t: curTour) {
            sb.append(t.getName()).append("\n");
        }
        curTour = new ArrayList<>();
        //Reset Confs
        for (int a = next.size() - 1; a > -1; a--) {
            total.add(next.remove(a));
        }
        //Maui
        sb.append("Maui Jim Invitational").append("\n");
        for (int a = 0; a < 4; a++) {
            boolean valid = false;
            Team t = null;
            ArrayList<Team> confe = null;
            while (!valid) {
                t = rankedTeams.get((int) (Math.random() * rankedTeams.size()));
                for (ArrayList<Team> c: total) {
                    if (c.contains(t)) {
                        confe = c;
                    }
                }
                valid = true;
                if (confe == null) {
                    valid = false;
                }
            }
            confe.remove(t);
            total.remove(confe);
            next.add(confe);
            curTour.add(t);
            rankedTeams.remove(t);
            for (ArrayList<Team> conf: total) {
                conf.remove(t);
            }
        }
        for (int a = 0; a < 4; a++) {
            boolean valid = false;
            Team t = null;
            ArrayList<Team> confe = null;
            while (!valid) {
                confe = total.get((int) (Math.random() * total.size()));
                t = confe.get((int) (Math.random() * confe.size()));
                valid = true;
                if (rankedTeams.contains(t)) {
                    valid = false;
                }
            }
            confe.remove(t);
            total.remove(confe);
            next.add(confe);
            curTour.add(t);
            for (ArrayList<Team> conf: total) {
                conf.remove(t);
            }
        }
        for (Team t: curTour) {
            sb.append(t.getName()).append("\n");
        }
        //Reset Confs
        for (int a = next.size() - 1; a > -1; a--) {
            total.add(next.remove(a));
        }
        //Tournies 3-5
        for (int b = 2; b < 5; b++) {
            curTour = new ArrayList<>();
            sb.append(preSTNames.get(b)).append("\n");
            for (int a = 0; a < 3; a++) {
                boolean valid = false;
                Team t = null;
                ArrayList<Team> confe = null;
                while (!valid) {
                    t = rankedTeams.get((int) (Math.random() * rankedTeams.size()));
                    for (ArrayList<Team> c : total) {
                        if (c.contains(t)) {
                            confe = c;
                        }
                    }
                    valid = true;
                    if (confe == null) {
                        valid = false;
                    }
                }
                confe.remove(t);
                total.remove(confe);
                next.add(confe);
                curTour.add(t);
                rankedTeams.remove(t);
                for (ArrayList<Team> conf : total) {
                    conf.remove(t);
                }
            }
            for (int a = 0; a < 5; a++) {
                boolean valid = false;
                Team t = null;
                ArrayList<Team> confe = null;
                while (!valid) {
                    confe = total.get((int) (Math.random() * total.size()));
                    t = confe.get((int) (Math.random() * confe.size()));
                    valid = true;
                    if (rankedTeams.contains(t)) {
                        valid = false;
                    }
                }
                confe.remove(t);
                total.remove(confe);
                next.add(confe);
                curTour.add(t);
                for (ArrayList<Team> conf : total) {
                    conf.remove(t);
                }
            }
            for (Team t : curTour) {
                sb.append(t.getName()).append("\n");
            }
            //Reset Confs
            for (int a = next.size() - 1; a > -1; a--) {
                total.add(next.remove(a));
            }
        }
        //Tournies 6-9
        for (int b = 5; b < 9; b++) {
            curTour = new ArrayList<>();
            sb.append(preSTNames.get(b)).append("\n");
            for (int a = 0; a < 2; a++) {
                boolean valid = false;
                Team t = null;
                ArrayList<Team> confe = null;
                while (!valid) {
                    t = rankedTeams.get((int) (Math.random() * rankedTeams.size()));
                    for (ArrayList<Team> c : total) {
                        if (c.contains(t)) {
                            confe = c;
                        }
                    }
                    valid = true;
                    if (confe == null) {
                        valid = false;
                    }
                }
                confe.remove(t);
                total.remove(confe);
                next.add(confe);
                curTour.add(t);
                rankedTeams.remove(t);
                for (ArrayList<Team> conf : total) {
                    conf.remove(t);
                }
            }
            for (int a = 0; a < 6; a++) {
                boolean valid = false;
                Team t = null;
                ArrayList<Team> confe = null;
                while (!valid) {
                    confe = total.get((int) (Math.random() * total.size()));
                    t = confe.get((int) (Math.random() * confe.size()));
                    valid = true;
                    if (rankedTeams.contains(t)) {
                        valid = false;
                    }
                }
                confe.remove(t);
                total.remove(confe);
                next.add(confe);
                curTour.add(t);
                for (ArrayList<Team> conf : total) {
                    conf.remove(t);
                }
            }
            for (Team t : curTour) {
                sb.append(t.getName()).append("\n");
            }
            //Reset Confs
            for (int a = next.size() - 1; a > -1; a--) {
                total.add(next.remove(a));
            }
        }
        //Tournies 10-27
        ArrayList<ArrayList<Team>> using;
        ArrayList<ArrayList<Team>> maybe;
        for (int b = 9; b < 27; b++) {
            curTour = new ArrayList<>();
            using = new ArrayList<>();
            maybe = new ArrayList<>();
            sb.append(preSTNames.get(b)).append("\n");
            while (using.size() < 8) {
                int mostTeamsLeft = 0;
                for (ArrayList<Team> confers : total) {
                    if (confers.size() > mostTeamsLeft) {
                        mostTeamsLeft = confers.size();
                    }
                }
                for (int c = total.size(); c > 0; c--) {
                    ArrayList<Team> tempCo = total.get((int) (Math.random() * c));
                    if (tempCo.size() == mostTeamsLeft) {
                        next.add(tempCo);
                        maybe.add(tempCo);
                        total.remove(tempCo);
                    }
                }
                while (using.size() < 8 && !maybe.isEmpty()) {
                    using.add(maybe.remove((int) (Math.random() * maybe.size())));
                }
            }
            for (ArrayList<Team> c: using) {
                Team t = c.get((int) (Math.random() * c.size()));
                c.remove(t);
                curTour.add(t);
                for (ArrayList<Team> conf : total) {
                    conf.remove(t);
                }
            }
            for (Team t : curTour) {
                sb.append(t.getName()).append("\n");
            }
            //Reset Confs
            for (int a = next.size() - 1; a > -1; a--) {
                total.add(next.remove(a));
            }
        }
        File file = new File("FBAJC/PreTournys.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    public static void readOrMakeSchedule(boolean read, boolean debug) throws IOException {
        if (read) {
            readPreSeasonTournies();
            schedule = new Team[2][TOTAL_NUM_CONF_GAMES + CONF_CHALLENGE_TOTAL];
            Scanner input = new Scanner(new File("FBAJC/schedule.txt"));
            gamesPlayed = input.nextInt();
            input.nextLine();
            int game = 0;
            while (input.hasNextLine() && game < TOTAL_NUM_CONF_GAMES + CONF_CHALLENGE_TOTAL) {
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
            File file = new File("FBAJC/Results.txt");
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
        sb.append(gamesPlayed).append("\n");
        for (int a = 0; a < schedule[0].length; a++) {
            sb.append(schedule[0][a].getAbreviation()).append("/")
                    .append(schedule[1][a].getAbreviation()).append("\n");
        }
        File file = new File("FBAJC/schedule.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    public static void readRecords() throws IOException {
        Scanner input = new Scanner(new File("FBAJC/records"));
        input.nextLine();
        input.nextLine();
        readRecHelp(input); //B12
        input.nextLine();
        input.nextLine();
        input.nextLine();
        readRecHelp(input); //ACC
        input.nextLine();
        input.nextLine();
        input.nextLine();
        readRecHelp(input); //BE
        input.nextLine();
        input.nextLine();
        input.nextLine();
        readRecHelp(input); //SEC
        input.nextLine();
        input.nextLine();
        input.nextLine();
        readRecHelp(input); //B10
        input.nextLine();
        input.nextLine();
        input.nextLine();
        readRecHelp(input); //AAC
        input.nextLine();
        input.nextLine();
        input.nextLine();
        readRecHelp(input); //P12
        input.nextLine();
        input.nextLine();
        input.nextLine();
        readRecHelp(input); //A10
        input.nextLine();
        input.nextLine();
        input.nextLine();
        readRecHelp(input); //PAT
        input.nextLine();
        input.nextLine();
        input.nextLine();
        readRecHelp(input); //COL
        input.nextLine();
        input.nextLine();
        input.nextLine();
        readRecHelp(input); //HOR
        input.nextLine();
        input.nextLine();
        input.nextLine();
        readRecHelp(input); //IVY
        input.nextLine();
        input.nextLine();
        input.nextLine();
        readRecHelp(input); //SOCON
        input.nextLine();
        input.nextLine();
        input.nextLine();
        readRecHelp(input); //SUN
        input.nextLine();
        input.nextLine();
        input.nextLine();
        readRecHelp(input); //SKY
        input.nextLine();
        input.nextLine();
        input.nextLine();
        readRecHelp(input); //MWC
        input.nextLine();
        input.nextLine();
        input.nextLine();
        readRecHelp(input); //OVC
        input.nextLine();
        input.nextLine();
        input.nextLine();
        readRecHelp(input); //NEC
        updateStandings();
    }

    private static void readRecHelp(Scanner input) {
        final int TEAMS_IN_CONF = 12;
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
                    for (ArrayList<Team> conf: allConferences) {
                        for (Team t: conf) {
                            for (Player p: t.roster) {
                                p.setPoints(0);
                            }
                        }
                    }
                    gamesPlayed = 0;
                    toFileWL();
                    toFile();
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
            File file = new File("FBAJC/Results.txt");
            FileWriter fw = new FileWriter(file);
            StringBuilder sb = new StringBuilder();
            fw.write(sb.toString());
            fw.close();
        }
    }

    public static void playGames(Scanner keyboard) throws IOException {
        boolean anotherGame = true;
        while (anotherGame) {
            if (gamesPlayed >= TOTAL_NUM_CONF_GAMES + CONF_CHALLENGE_TOTAL + PRE_S_TOURN_TOTAL) {
                anotherGame = false;
            }
            if (anotherGame) {
                Team one = schedule[0][gamesPlayed - PRE_S_TOURN_TOTAL];
                Team two = schedule[1][gamesPlayed - PRE_S_TOURN_TOTAL];
                boolean homeWin;
                String answer = "";
                if (!simulateSeason) {
                    System.out.println(one.displayToString());
                    System.out.println(two.displayToString());
                    System.out.println();
                    printGameAnnouncement(one, two);
                    System.out.print("(" + one.getWin() + "-" + one.getLoss() + ")");
                    if (inRanks.contains(one)) {
                        System.out.print((inRanks.indexOf(one) + 1) + ".");
                    }
                    System.out.print(one.getName() + " vs ");
                    if (inRanks.contains(two)) {
                        System.out.print((inRanks.indexOf(two) + 1) + ".");
                    }
                    System.out.println(two.getName() + "(" + two.getWin() + "-" + two.getLoss() + ")");
                    System.out.print("Start Game?(Simulate through with 'G') ");
                    answer = keyboard.nextLine();
                }
                boolean sameConf = one.getConference().equals(two.getConference());
                boolean hw;
                ArrayList<Player> oneRoster = new ArrayList<>(one.roster);
                int[] onePlayerPoints = new int[5];
                ArrayList<Player> twoRoster = new ArrayList<>(two.roster);
                int[] twoPlayerPoints = new int[5];
                ArrayList<Player> possession;
                ArrayList<Player> defense;
                Team pos = one;
                Team def = two;
                int OTCount = 0;
                int onePoints = 0;
                int twoPoints = 0;
                int endGamePoss = 120;
                boolean skip = false;
                boolean ranked_matchup = false;
                if (inRanks.contains(one) && inRanks.contains(two))
                {
                    ranked_matchup = true;
                }
                if (answer.equals("G") || simulateSeason) {
                    skip = true;
                }
                //Runs through a game
                for (int i = 0; i < endGamePoss; i++) {
                    if (i == 30 && !skip) {
                        System.out.print("10 minutes left in 1st half: " + one.getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
                        keyboard.nextLine();
                    }
                    else if (i == 60 && !skip) {
                        System.out.print("Halftime: " + one.getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
                        keyboard.nextLine();
                    }
                    else if (i == 90 && !skip) {
                        System.out.print("10 minutes left in 2nd half: " + one.getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
                        keyboard.nextLine();
                    }
                    else if (i == 120 && !skip) {
                        System.out.print("End of the Regulation: " + one.getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
                        keyboard.nextLine();
                    }
                    else if (i%10 == 0 && i > 120 && !skip) {
                        System.out.print("End of " + (OTCount - 1) + "OT: " + one.getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints);
                        keyboard.nextLine();
                    }
                    int num_show = 109;
                    if (ranked_matchup)
                        num_show = 89;
                    if (i > num_show && Math.abs(onePoints - twoPoints) <= (((endGamePoss-i+1)/2) * 3) && !skip) {
                        System.out.print(endGamePoss-i + " Possessions left: " + one.getName() + ": " + onePoints + ", " + two.getName() + ": " + twoPoints + ", ");
                        if (i%2 == 0) {
                            System.out.print(one.getAbreviation() + " Possession");
                        }
                        else {
                            System.out.print(two.getAbreviation() + " Possession");
                        }
                        keyboard.nextLine();
                    }
                    if (i % 2 == 0) {
                        possession = oneRoster;
                        defense = twoRoster;
                        pos = one;
                        def = two;
                    }
                    else {
                        possession = twoRoster;
                        defense = oneRoster;
                        pos = two;
                        def = one;
                    }
                    int getBallTo = 0;
                    for (Player p : possession) {
                        getBallTo += p.cur_rating;
                    }
                    getBallTo -= 200;
                    int whoGetsBall = (int) (Math.random() * getBallTo) + 1;
                    boolean found = false;
                    int totalRating = 0;
                    Player playerWithBall = possession.get(0);
                    for (Player p : possession) {
                        totalRating += (p.cur_rating - 40);
                        if (!found && totalRating >= whoGetsBall) {
                            found = true;
                            playerWithBall = p;
                        }
                    }
                    Player defender = def.pickDefender(pos, possession.indexOf(playerWithBall));
                    int def_effect = playerWithBall.cur_rating - (int) (0.45 * defender.cur_rating) + 10;
                    int oddsToMake = Math.max(35, Math.min(65, def_effect));
                    int madeScore = (int) (Math.random() * 100);
                    int pointsScored = 0;
                    if (oddsToMake >= madeScore) {
                        madeScore = Math.abs(madeScore - oddsToMake);
                        if (madeScore >= 30) {
                            pointsScored = 3;
                        }
                        else {
                            pointsScored = 2;
                        }
                        if (i > num_show && Math.abs(onePoints - twoPoints) <= (((endGamePoss-i+1)/2) * 3) && !skip) {
                            Team t = one;
                            if (i % 2 == 1) {
                                t = two;
                            }
                            if (!playerWithBall.getName().equals("X")) {
                                System.out.print(playerWithBall.getName() + " scores " + pointsScored + " for " + t.getAbreviation() + "!");
                            }
                            else {
                                System.out.print(pointsScored + " for " + t.getAbreviation() + "!");
                            }
                            keyboard.nextLine();
                        }
                    }
                    else if (i > num_show && Math.abs(onePoints - twoPoints) <= (((endGamePoss-i+1)/2) * 3) && !skip) {
                        System.out.print(playerWithBall.getName() + " was stopped by " + defender.getName());
                        keyboard.nextLine();
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
                if (!simulateSeason) {
                    System.out.println();
                    System.out.println(one.getName() + ": ");
                }
                for (int i = 0; i < 5; i++) {
                    Player p = oneRoster.get(i);
                    if (!simulateSeason) {
                        System.out.println("(" + p.getPosition() + ")" + p.getName() + ": " + onePlayerPoints[i]);
                    }
                    oneRoster.get(i).addPoints(onePlayerPoints[i]);
                }
                if (!simulateSeason) {
                    System.out.println();
                    System.out.println(two.getName() + ": ");
                }
                for (int i = 0; i < 5; i++) {
                    Player p = twoRoster.get(i);
                    if (!simulateSeason) {
                        System.out.println("(" + p.getPosition() + ")" + p.getName() + ": " + twoPlayerPoints[i]);
                    }
                    twoRoster.get(i).addPoints(twoPlayerPoints[i]);
                }

                if (!simulateSeason) {
                    System.out.println();
                }
                if (onePoints > twoPoints) {
                    one.setWin(one.getWin() + 1, sameConf);
                    two.setLoss(two.getLoss() + 1, sameConf);
                    updateNames = false;
                    updatePlayerRatings(one, true, two);
                    updatePlayerRatings(two, false, one);
                    averageTeamRatingsUpdate();
                    homeWin = true;
                }
                else {
                    two.setWin(two.getWin() + 1, sameConf);
                    one.setLoss(one.getLoss() + 1, sameConf);
                    updateNames = false;
                    updatePlayerRatings(two, true, one);
                    updatePlayerRatings(one, false, two);
                    averageTeamRatingsUpdate();
                    homeWin = false;
                }
                if (!simulateSeason) {
                    System.out.println();
                    System.out.print("Final Score: ");
                    if (rankings.contains(one)) {
                        System.out.print((rankings.indexOf(one) + 1) + ".");
                    }
                    System.out.print(one.getName() + ": " + onePoints + ", ");
                    if (rankings.contains(two)) {
                        System.out.print((rankings.indexOf(two) + 1) + ".");
                    }
                    System.out.print(two.getName() + ": " + twoPoints);
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
                    System.out.print(one.getName() + ": " + one.getWin() + "-" + one.getLoss());
                    if (one.getConference().equals(two.getConference())) {
                        System.out.println(" (" + one.getConWin() + "-" + one.getConLoss() + ")");
                    }
                    else {
                        System.out.println();
                    }
                    System.out.print(two.getName() + ": " + two.getWin() + "-" + two.getLoss());
                    if (one.getConference().equals(two.getConference())) {
                        System.out.println(" (" + two.getConWin() + "-" + two.getConLoss() + ")");
                    }
                    else {
                        System.out.println();
                    }
                    System.out.println();
                }
                gamesPlayed++;
                toFileResults(one, two, onePoints, twoPoints, homeWin);
                toFileSchedule();
                updateStandings();
                toFile();
                toFileWL();
                toFileRemainingSchedule();
                makeGoodLookinStandings();
                toFileBestScorers();
                if (!simulateSeason && updateNames) {
                    System.out.print("Update Names!");
                }
            }
            if (anotherGame && gamesPlayed >= TOTAL_NUM_CONF_GAMES + CONF_CHALLENGE_TOTAL + PRE_S_TOURN_TOTAL) {
                anotherGame = false;
                postSeasonTournies = new PriorityQueue<>();
                postTourniesInOrder = new ArrayList<>();
                PostSeasonTourny temp = new PostSeasonTourny(Big12, "Big 12");
                postSeasonTournies.add(temp);
                postTourniesInOrder.add(temp);
                temp = new PostSeasonTourny(ACC, "ACC");
                postSeasonTournies.add(temp);
                postTourniesInOrder.add(temp);
                temp = new PostSeasonTourny(BigEast, "Big East");
                postSeasonTournies.add(temp);
                postTourniesInOrder.add(temp);
                temp = new PostSeasonTourny(SEC, "SEC");
                postSeasonTournies.add(temp);
                postTourniesInOrder.add(temp);
                temp = new PostSeasonTourny(BigTen, "Big Ten");
                postSeasonTournies.add(temp);
                postTourniesInOrder.add(temp);
                temp = new PostSeasonTourny(American, "American");
                postSeasonTournies.add(temp);
                postTourniesInOrder.add(temp);
                temp = new PostSeasonTourny(PAC12, "PAC 12");
                postSeasonTournies.add(temp);
                postTourniesInOrder.add(temp);
                temp = new PostSeasonTourny(Atlantic10, "Atlantic 10");
                postSeasonTournies.add(temp);
                postTourniesInOrder.add(temp);
                temp = new PostSeasonTourny(Patriot, "Patriot");
                postSeasonTournies.add(temp);
                postTourniesInOrder.add(temp);
                temp = new PostSeasonTourny(Colonial, "Colonial");
                postSeasonTournies.add(temp);
                postTourniesInOrder.add(temp);
                temp = new PostSeasonTourny(Horizon, "Horizon");
                postSeasonTournies.add(temp);
                postTourniesInOrder.add(temp);
                temp = new PostSeasonTourny(Ivy, "Ivy");
                postSeasonTournies.add(temp);
                postTourniesInOrder.add(temp);
                temp = new PostSeasonTourny(Southern, "Southern");
                postSeasonTournies.add(temp);
                postTourniesInOrder.add(temp);
                temp = new PostSeasonTourny(SunBelt, "Sun Belt");
                postSeasonTournies.add(temp);
                postTourniesInOrder.add(temp);
                temp = new PostSeasonTourny(BigSky, "Big Sky");
                postSeasonTournies.add(temp);
                postTourniesInOrder.add(temp);
                temp = new PostSeasonTourny(MountainWest, "Mountain West");
                postSeasonTournies.add(temp);
                postTourniesInOrder.add(temp);
                temp = new PostSeasonTourny(OhioValley, "Ohio Valley");
                postSeasonTournies.add(temp);
                postTourniesInOrder.add(temp);
                temp = new PostSeasonTourny(Northeast, "NEC");
                postSeasonTournies.add(temp);
                postTourniesInOrder.add(temp);
                toFileConfTournies();
            }
        }
    }

    public static void toFileResults(Team one, Team two, int onePoints, int twoPoints, boolean homeWin) throws
            IOException {
        StringBuilder sb = new StringBuilder();
        Scanner input = new Scanner(new File("FBAJC/Results.txt"));
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
        File file = new File("FBAJC/Results.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
        input.close();
    }

    private static void toFileBestScorers () throws IOException{
        StringBuilder sb = new StringBuilder();
        ArrayList<Player> players = new ArrayList<>();
        sb.append("Points Per Game: ").append("\n").append("\n");
        for (ArrayList<Team> conf: allConferences) {
            for (Team t: conf) {
                for (Player p: t.roster) {
                    players.add(p);
                    p.newPPG(t.getWin() + t.getLoss());
                }
            }
        }

        sb.append("-Overall-").append("\n");
        boolean still_going = true;
        for (int i = 0; i < teams.size() * 5 && still_going; i++) {
            Player p = players.get(0);
            for (Player player : players) {
                if (player.getPPG() > p.getPPG()) {
                    p = player;
                }
            }
            players.remove(p);
            DecimalFormat df = new DecimalFormat("#.#");
            if (p.getPPG() >= 20.0) {
                sb.append(i + 1).append(". ").append(p.getName()).append("(").append(p.cur_rating).append(")")
                        .append("(").append(p.getTeam().getAbreviation()).append(")").append(": ")
                        .append(df.format(p.getPPG())).append("\n");
            }
            else {
                still_going = false;
            }
        }

        sb.append("\n").append("\n");
        int index = 0;
        String[] conf_names = new String[] {"Big 12", "ACC", "Big East", "SEC", "Big Ten", "American",
                "PAC 12", "Atlantic 10", "Patriot", "Colonial", "Horizon", "Ivy League", "Southern",
                "Sun Belt", "Big Sky", "Mountain West", "Ohio Valley", "NEC"};

        for (ArrayList<Team> conf: allConferences) {
            players.clear();
            for (Team t: conf) {
                players.addAll(t.roster);
            }
            sb.append("-").append(conf_names[index]).append("-").append("\n");
            for (int i = 0; i < 15; i++) {
                Player p = players.get(0);
                for (Player player : players) {
                    if (player.getPPG() > p.getPPG()) {
                        p = player;
                    }
                }
                players.remove(p);
                DecimalFormat df = new DecimalFormat("#.#");
                sb.append(i + 1).append(". ").append(p.getName()).append("(").append(p.cur_rating).append(")")
                        .append("(").append(p.getTeam().getAbreviation()).append(")").append(": ")
                        .append(df.format(p.getPPG())).append("\n");

            }
            sb.append("\n").append("\n");
            index++;
        }

        File file = new File("FBAJC/League-Points-Stats.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    public static void updateStandings() throws IOException {
        for (ArrayList<Team> conf: allConferences) {
            ArrayList<Team> newC = updateStandHelp(conf);
            conf.clear();
            conf.addAll(newC);
        }
        if (gamesPlayed > (PRE_S_TOURN_TOTAL - 1)) {
            readRankings();
        }
        if ((gamesPlayed - PRE_S_TOURN_TOTAL) % 108 == 0 && gamesPlayed > (PRE_S_TOURN_TOTAL - 1) && !reading) {
            updateRankings(true);
            readRankings();
            toFileAwards();
        }
    }

    public static void updatePlayerRatings(Team t, boolean won, Team opp) throws IOException {
        for (Player p: t.roster) {
            int rat = p.cur_rating;
            int mrp = p.most_recent_points;
            int random = (int) (Math.random() * 100);
            int chance = (99 - rat + (mrp / 2)) * 2 / 3;
            if (rat >= 90) {
                chance = chance * 5 / 9;
            }
            else if (rat >= 82) {
                chance = chance * 5 / 8;
            }
            else if (rat >= 72) {
                chance = chance * 5 / 7;
            }
            else if (rat >= 65) {
                chance = chance * 5 / 6;
            }
            
            double k = 0.02;
            double mult = 1.0 + k * (opp.getTeamRating() - averageTeamRatings);
            mult = Math.max(0.80, Math.min(1.20, mult));
            chance = (int)Math.round(chance * mult);

            if (!won) {
                chance /= 2;
            }
            int upgrade = 0;
            while (chance > random) {
                upgrade++;
                chance /= 2;
                random = (int) (Math.random() * 100);
            }
            p.cur_rating += upgrade;
            if (p.cur_rating > 99) {
                p.cur_rating = 99;
            }
            if (upgrade > 0) {
                t.updateTeamRating();
                averageTeamRatingsUpdate();
                if (p.getName().equals("X") && needsName(p)) {
                    System.out.println("new named player needed: "
                            + t.getAbreviation()
                            + " "
                            + p.getPosition());

                    appendNameNeeded(t, p);
                }
            }
        }
    }

    private static boolean needsName(Player p) {
        return p.getName().equals("X")
                && ((p.cur_rating >= 80 && p.getGrade().equals("Jr"))
                || (p.cur_rating >= 78 && p.getGrade().equals("So"))
                || (p.cur_rating >= 76 && p.getGrade().equals("Fr")));
    }

    private static void appendNameNeeded(Team t, Player p) throws IOException {
        FileWriter fw = new FileWriter("FBAJC/NamesNeeded.txt", true);

        fw.write(t.getName()
                + "/"
                + t.getAbreviation()
                + "/"
                + p.getPosition()
                + "/"
                + p.getGrade()
                + "/"
                + p.cur_rating
                + "\n");

        fw.close();
    }

    private static void readRankings() throws FileNotFoundException {
        rankings = new ArrayList<>();
        inRanks = new ArrayList<>();

        File file = new File("FBAJC/Rankings.txt");
        Scanner input = new Scanner(file);

        while (input.hasNextLine()) {
            String line = input.nextLine();

            line = line.trim();
            if (!line.startsWith("R|")) {
                continue;
            }
            String content = line.substring(2);

            String[] tokens = content.trim().split("\\s+");
            if (tokens.length < 4) {
                continue;
            }

            String conf = null;
            int confIndex = -1;

            for (int i = 0; i < tokens.length; i++) {
                if (isConferenceAbbreviation(tokens[i])) {
                    conf = tokens[i];
                    confIndex = i;
                    break;
                }
            }

            if (confIndex == -1) {
                continue;
            }

            StringBuilder nameBuilder = new StringBuilder();

            // tokens[0] = rank number
            // tokens[1] = delta
            // team name starts at tokens[2] and ends before conference
            for (int i = 2; i < confIndex; i++) {
                if (i > 2) {
                    nameBuilder.append(" ");
                }
                nameBuilder.append(tokens[i]);
            }

            String teamName = nameBuilder.toString();
            Team t = teamNames.get(teamName);

            if (t != null && !inRanks.contains(t)) {
                rankings.add(t);
                inRanks.add(t);
            }
        }

        input.close();
    }

    private static boolean isConferenceAbbreviation(String s) {
        return s.equals("B12") ||
                s.equals("ACC") ||
                s.equals("BE") ||
                s.equals("SEC") ||
                s.equals("B10") ||
                s.equals("AAC") ||
                s.equals("P12") ||
                s.equals("A10") ||
                s.equals("PAT") ||
                s.equals("COL") ||
                s.equals("HOR") ||
                s.equals("IVY") ||
                s.equals("SOCON") ||
                s.equals("SUN") ||
                s.equals("SKY") ||
                s.equals("MWC") ||
                s.equals("OVC") ||
                s.equals("NEC");
    }

    private static ArrayList<Team> updateStandHelp(ArrayList<Team> conf) {
        ArrayList<Team> newConf = new ArrayList<>();
        Team best;
        for (int a = conf.size() - 1; a > -1; a--) {
            best = conf.get(0);
            for (Team t : conf) {
                if (!best.isBetterThan(t)) {
                    best = t;
                }
            }
            newConf.add(best);
            conf.remove(best);
        }
        for (Team t : newConf) {
            t.setConf(newConf);
        }
        return newConf;
    }

    private static void updateRankings(boolean toFile) throws IOException {
        String gameResults = "FBAJC/Results.txt";
        FootballRanker fr = new FootballRanker(gameResults);
        TreeSet<AllPathsInfo> allpaths = fr.doWeightedAndWinPercentAdjusted(false);

        ArrayList<Team> oldRanks = new ArrayList<>(rankings);
        ArrayList<Team> oldTop25 = new ArrayList<>(inRanks);

        // -----------------------------
        // 1. Build FootballRanker order
        // -----------------------------
        ArrayList<Team> frOrder = new ArrayList<>();
        for (AllPathsInfo path : allpaths) {
            Team t = teamNames.get(path.getName());
            if (t != null) {
                frOrder.add(t);
            }
        }
        for (Team t : teamNames.values()) {
            if (!frOrder.contains(t)) {
                frOrder.add(t);
            }
        }

        // -----------------------------
        // 2. Build team_rating order
        // -----------------------------
        ArrayList<Team> ratingOrder = new ArrayList<>(teamNames.values());
        ratingOrder.sort((t1, t2) -> Double.compare(t2.getTeamRating(), t1.getTeamRating()));

        // -----------------------------
        // 3. Decide blend weights
        //    MOVED TO METHOD SCOPE so formatting section can access them
        // -----------------------------
        double seasonProgress = (double) gamesPlayed / TOTAL_NUM_OF_GAMES;

        double blendStart = 0.05;
        double blendFull  = 0.65;

        double frWeight;
        if (seasonProgress <= blendStart) {
            frWeight = 0.0;
        } else if (seasonProgress >= blendFull) {
            frWeight = 1.0;
        } else {
            double x = (seasonProgress - blendStart) / (blendFull - blendStart);
            frWeight = x * x * (3 - 2 * x);
        }
        double ratingWeight = 1.0 - frWeight;

        // -----------------------------
        // 4. Create rank maps
        // -----------------------------
        HashMap<Team, Integer> ratingRankMap = new HashMap<>();
        for (int i = 0; i < ratingOrder.size(); i++) {
            ratingRankMap.put(ratingOrder.get(i), i + 1);
        }

        HashMap<Team, Integer> frRankMap = new HashMap<>();
        for (int i = 0; i < frOrder.size(); i++) {
            frRankMap.put(frOrder.get(i), i + 1);
        }

        // -----------------------------
        // 5. Blend and sort
        // -----------------------------
        ArrayList<Team> blendedOrder = new ArrayList<>(teamNames.values());
        blendedOrder.sort((t1, t2) -> {
            double score1 = ratingWeight * ratingRankMap.get(t1) + frWeight * frRankMap.get(t1);
            double score2 = ratingWeight * ratingRankMap.get(t2) + frWeight * frRankMap.get(t2);
            if (score1 < score2) return -1;
            if (score1 > score2) return  1;
            int frCompare = Integer.compare(frRankMap.get(t1), frRankMap.get(t2));
            if (frCompare != 0) return frCompare;
            return Double.compare(t2.getTeamRating(), t1.getTeamRating());
        });

        rankings = new ArrayList<>(blendedOrder);
        inRanks  = new ArrayList<>();

        // -----------------------------
        // 6. Option 4 formatting
        // -----------------------------
        int nameCol = 0;
        for (Team t : rankings) {
            if (t.getName().length() > nameCol) {
                nameCol = t.getName().length();
            }
        }
        nameCol += 2;

        String divider = " ──  ──   "
                + "─".repeat(nameCol)
                + "   ─────   ──────  ──────  ──────";

        StringBuilder sb = new StringBuilder();
        sb.append("┌─────────────────────────────────────────────────────────────────┐\n");
        sb.append(String.format(
                "│  FBAJC RANKINGS  ·  SEASON %-3d  ·  %-4d GAMES PLAYED             │\n",
                season, gamesPlayed));
        sb.append(String.format(
                "│  FR Weight: %-4s  ·  Rating Weight: %-4s                          │\n",
                String.format("%.2f", frWeight),
                String.format("%.2f", ratingWeight)));
        sb.append("└─────────────────────────────────────────────────────────────────┘\n");
        sb.append("\n");

        sb.append(String.format(
                " %-3s  %-3s   %-" + nameCol + "s   %-5s   %-6s  %-6s  %-6s\n",
                "#", "Δ", "TEAM", "CONF", "W-L", "CONF", "RATING"));
        sb.append(divider).append("\n");

        int rank = 1;
        for (Team t : rankings) {
            if (rank > 25) break;

            inRanks.add(t);

            String trend;
            if (!oldTop25.contains(t)) {
                trend = "NR";
            } else {
                int diff = (oldTop25.indexOf(t) + 1) - rank;
                if (diff > 0)      trend = "+" + diff;
                else if (diff < 0) trend = String.valueOf(diff);
                else               trend = "--";
            }

            String record     = t.getWin()    + "-" + t.getLoss();
            String confRecord = t.getConWin() + "-" + t.getConLoss();
            String rating     = String.format("%.1f", t.getTeamRating());

            // Tag line so readRankings() can find ranked entries unambiguously
            sb.append(String.format(
                    "R|%-3d  %-3s   %-" + nameCol + "s   %-5s   %-6s  %-6s  %-6s\n",
                    rank, trend, t.getName(),
                    t.getConference(), record, confRecord, rating));

            if (rank == 25) {
                sb.append(divider).append("\n");
            }
            rank++;
        }

        // Dropped section
        sb.append("\n DROPPED: ");
        boolean anyDropped = false;
        for (Team t : rankings) {
            if (rankings.indexOf(t) >= 25 && oldTop25.contains(t)) {
                int oldPos = oldTop25.indexOf(t) + 1;
                if (!anyDropped) {
                    anyDropped = true;
                } else {
                    sb.append("  ·  ");
                }
                sb.append(t.getName())
                .append(" (").append(t.getConference()).append(") ")
                .append(t.getWin()).append("-").append(t.getLoss())
                .append(" [was #").append(oldPos).append("]");
            }
        }
        if (!anyDropped) {
            sb.append("none");
        }
        sb.append("\n");

        if (toFile) {
            if (!simulateSeason && !simulatePreST && !simulateConfT) {
                System.out.println("New Rankings! (FootballRanker weight: "
                        + String.format("%.2f", frWeight) + ")");
            }
            File file = new File("FBAJC/Rankings.txt");
            FileWriter fw = new FileWriter(file);
            fw.write(sb.toString());
            fw.close();
        }
    }

    public static void makeGoodLookinStandings() throws IOException {
        StringBuilder master = new StringBuilder();

        writeStandingsFile("Big 12", Big12, "FBAJC/Standings-Big12.txt", master);
        writeStandingsFile("ACC", ACC, "FBAJC/Standings-ACC.txt", master);
        writeStandingsFile("Big East", BigEast, "FBAJC/Standings-BigEast.txt", master);
        writeStandingsFile("SEC", SEC, "FBAJC/Standings-SEC.txt", master);
        writeStandingsFile("Big Ten", BigTen, "FBAJC/Standings-BigTen.txt", master);
        writeStandingsFile("American", American, "FBAJC/Standings-American.txt", master);
        writeStandingsFile("PAC 12", PAC12, "FBAJC/Standings-PAC12.txt", master);
        writeStandingsFile("Atlantic 10", Atlantic10, "FBAJC/Standings-Atlantic10.txt", master);
        writeStandingsFile("Patriot", Patriot, "FBAJC/Standings-Patriot.txt", master);
        writeStandingsFile("Colonial", Colonial, "FBAJC/Standings-Colonial.txt", master);
        writeStandingsFile("Horizon", Horizon, "FBAJC/Standings-Horizon.txt", master);
        writeStandingsFile("Ivy League", Ivy, "FBAJC/Standings-Ivy.txt", master);
        writeStandingsFile("Southern", Southern, "FBAJC/Standings-SoCon.txt", master);
        writeStandingsFile("Sun Belt", SunBelt, "FBAJC/Standings-SunBelt.txt", master);
        writeStandingsFile("Big Sky", BigSky, "FBAJC/Standings-BigSky.txt", master);
        writeStandingsFile("Mountain West", MountainWest, "FBAJC/Standings-MountainWest.txt", master);
        writeStandingsFile("Ohio Valley", OhioValley, "FBAJC/Standings-OhioValley.txt", master);
        writeStandingsFile("NEC", Northeast, "FBAJC/Standings-NEC.txt", master);

        File file = new File("FBAJC/Standings.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(master.toString());
        fw.close();
    }

    private static void writeStandingsFile(String confName, ArrayList<Team> conf,
                                        String fileName, StringBuilder master) throws IOException {
        StringBuilder sb = new StringBuilder();

        appendStandingsHeader(sb, confName);
        appendStandingsRows(conf, sb);

        File file = new File(fileName);
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();

        master.append(sb).append("\n");
    }

    private static void appendStandingsHeader(StringBuilder sb, String confName) {
        String title = "FBAJC STANDINGS  ·  SEASON " + season + "  ·  " + confName;
        String games = gamesPlayed + " GAMES PLAYED";

        sb.append("┌──────────────────────────────────────────────────────────────────────────────┐\n");
        sb.append(String.format("│  %-54s %17s  │%n", title, games));
        sb.append("└──────────────────────────────────────────────────────────────────────────────┘\n\n");

        sb.append(String.format(
                " %-4s %-4s %-32s %-7s %-7s %-7s %-6s %-7s%n",
                "#", "RK", "TEAM", "W-L", "CONF", "PCT", "GB", "RATING"));

        sb.append(" ──── ──── ────────────────────────────── ─────── ─────── ─────── ────── ───────\n");
    }

    private static void appendStandingsRows(ArrayList<Team> conf, StringBuilder sb) {
        if (conf.isEmpty()) return;

        Team leader = conf.get(0);
        int bestConWin  = leader.getConWin();
        int bestConLoss = leader.getConLoss();

        for (int i = 0; i < conf.size(); i++) {
            Team t = conf.get(i);

            boolean confDone  = (t.getConWin() + t.getConLoss() >= 22);
            boolean confChamp = confDone && (t.getConWin() == bestConWin && t.getConLoss() == bestConLoss);
            boolean clinched  = !confDone && isClinchedShare(t, conf);

            String rankTag = "--";
            if (inRanks.contains(t)) {
                rankTag = "#" + (inRanks.indexOf(t) + 1);
            }

            String name = (confChamp || clinched) ? t.getName() + "*" : t.getName() + "  ";
            String record     = t.getWin()    + "-" + t.getLoss();
            String confRecord = t.getConWin() + "-" + t.getConLoss();
            String pct    = String.format("%.3f", t.getWinPerc());
            String gb     = formatGamesBack(leader, t);
            String rating = String.format("%.1f", t.getTeamRating());
            String nameFormat = (confChamp || clinched) ? " %-4d %-4s %-32s %-7s %-7s %-7s %-6s %-7s%n"
                                            : " %-4d %-4s %-32s %-7s %-7s %-7s %-6s %-7s%n";

            sb.append(String.format(
                    nameFormat,
                    i + 1,
                    rankTag,
                    name,
                    record,
                    confRecord,
                    pct,
                    gb,
                    rating));
        }

        sb.append(" ──── ──── ────────────────────────────────── ─────── ─────── ─────── ────── ───────\n");
    }

    private static boolean isClinchedShare(Team leader, ArrayList<Team> conf) {
        int leaderGamesLeft = 22 - (leader.getConWin() + leader.getConLoss());
        // Worst case for leader: lose all remaining
        int leaderMin = leader.getConWin();
        // Best case for leader: win all remaining (used to check if others can surpass)
        int leaderMax = leader.getConWin() + leaderGamesLeft;

        for (Team t : conf) {
            if (t == leader) continue;
            int challGamesLeft = 22 - (t.getConWin() + t.getConLoss());
            int challMax = t.getConWin() + challGamesLeft;
            // Challenger can strictly exceed the leader's floor — not clinched even a share
            if (challMax > leaderMin) {
                return false;
            }
        }
        return true;
    }

    private static String formatGamesBack(Team leader, Team t) {
        double gb = ((leader.getConWin() - t.getConWin())
                + (t.getConLoss() - leader.getConLoss())) / 2.0;

        if (gb == 0.0) {
            return "--";
        }

        if (gb == (int) gb) {
            return String.valueOf((int) gb);
        }

        return String.format("%.1f", gb);
    }

    private static void goodLookingStandHelp(ArrayList<Team> conf,
                                             StringBuilder sb, StringBuilder bigSB) {
        //Western Conference
        int seed = 1;
        int longest = 0;
        for (Team t : conf) {
            int nameLen = t.getName().length();
            if (rankings.contains(t)) {
                if (rankings.indexOf(t) >= 9) {
                    nameLen += 4;
                }
                else {
                    nameLen += 3;
                }
            }
            if (nameLen > longest) {
                longest = nameLen;
            }
        }
        longest++;
        int spaces = longest;
        for (Team t : conf) {
            int nameLen = t.getName().length();
            if (rankings.contains(t)) {
                if (rankings.indexOf(t) >= 9) {
                    nameLen += 4;
                }
                else {
                    nameLen += 3;
                }
            }
            if (seed > 9) {
                spaces -= 1;
            }
            sb.append(seed).append(".");
            if (rankings.contains(t)) {
                sb.append("(").append((rankings.indexOf(t) + 1)).append(")");
            }
            sb.append(t.getName()).append(": ");
            for (int a = (longest - spaces) + nameLen; a < longest; a++) {
                sb.append(" ");
            }
            if (t.getWin() < 10) {
                sb.append(" ");
            }
            sb.append(t.getWin()).append("-").append(t.getLoss()).append(" ");
            if (t.getLoss() < 10) {
                sb.append(" ");
            }
            sb.append("(").append(t.getConWin()).append("-").append(t.getConLoss()).append(")");
            if (t.getConWin() < 10) {
                sb.append(" ");
            }
            if(t.getConLoss() < 10) {
                sb.append(" ");
            }
            Team top = conf.get(0);
            double gb = ((top.getConWin() - t.getConWin()) + (t.getConLoss() -
                    top.getConLoss())) / 2.0;
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
            spaces = longest;
            seed++;
        }
        bigSB.append(sb);
    }

//    public static void randomizeWL(int simulateToGame) throws IOException {
//        if (simulateToGame > TOTAL_NUM_CONF_GAMES + CONF_CHALLENGE_TOTAL + 406) {
//            simulateToGame = TOTAL_NUM_CONF_GAMES + CONF_CHALLENGE_TOTAL + 406;
//        }
//        while (!preSeasonTournies.isEmpty() && gamesPlayed < simulateToGame) {
//            PreSeasonTourny temp = preSeasonTournies.poll();
//            temp.playFakeGame();
//            if (temp.getCurrentGame() < 12) {
//                preSeasonTournies.offer(temp);
//            }
//        }
//        simulateToGame -= 252;
//        for (int a = gamesPlayed - 252; a < simulateToGame && a < 2016; a++) {
//            int random = (int) (Math.random() * 2);
//            Team one = schedule[0][a];
//            Team two = schedule[1][a];
//            boolean sameConf = one.getConference().equals(two.getConference());
//            if (random == 0) {
//                one.setWin(one.getWin() + 1, sameConf);
//                two.setLoss(two.getLoss() + 1, sameConf);
//                toFileResults(one, two, true);
//            }
//            else {
//                two.setWin(two.getWin() + 1, sameConf);
//                one.setLoss(one.getLoss() + 1, sameConf);
//                toFileResults(two, one, false);
//            }
//            gamesPlayed++;
//        }
//        simulateToGame -= 2016;
//        updateStandings();
//        toFileSchedule();
//        makeGoodLookinStandings();
//        toFileWL();
//        toFileRemainingSchedule();
//        postSeasonTournies = new PriorityQueue<>();
//        postTourniesInOrder = new ArrayList<>();
//        PostSeasonTourny temp = new PostSeasonTourny(Big12, "Big 12");
//        postSeasonTournies.add(temp);
//        postTourniesInOrder.add(temp);
//        temp = new PostSeasonTourny(ACC, "ACC");
//        postSeasonTournies.add(temp);
//        postTourniesInOrder.add(temp);
//        temp = new PostSeasonTourny(BigEast, "Big East");
//        postSeasonTournies.add(temp);
//        postTourniesInOrder.add(temp);
//        temp = new PostSeasonTourny(SEC, "SEC");
//        postSeasonTournies.add(temp);
//        postTourniesInOrder.add(temp);
//        temp = new PostSeasonTourny(BigTen, "Big Ten");
//        postSeasonTournies.add(temp);
//        postTourniesInOrder.add(temp);
//        temp = new PostSeasonTourny(American, "American");
//        postSeasonTournies.add(temp);
//        postTourniesInOrder.add(temp);
//        temp = new PostSeasonTourny(PAC12, "PAC 12");
//        postSeasonTournies.add(temp);
//        postTourniesInOrder.add(temp);
//        temp = new PostSeasonTourny(Atlantic10, "Atlantic 10");
//        postSeasonTournies.add(temp);
//        postTourniesInOrder.add(temp);
//        temp = new PostSeasonTourny(Patriot, "Patriot");
//        postSeasonTournies.add(temp);
//        postTourniesInOrder.add(temp);
//        temp = new PostSeasonTourny(Colonial, "Colonial");
//        postSeasonTournies.add(temp);
//        postTourniesInOrder.add(temp);
//        temp = new PostSeasonTourny(Horizon, "Horizon");
//        postSeasonTournies.add(temp);
//        postTourniesInOrder.add(temp);
//        temp = new PostSeasonTourny(Ivy, "Ivy");
//        postSeasonTournies.add(temp);
//        postTourniesInOrder.add(temp);
//        temp = new PostSeasonTourny(Southern, "Southern");
//        postSeasonTournies.add(temp);
//        postTourniesInOrder.add(temp);
//        temp = new PostSeasonTourny(SunBelt, "Sun Belt");
//        postSeasonTournies.add(temp);
//        postTourniesInOrder.add(temp);
//        int a = gamesPlayed - 2268;
//        boolean playedSome = false;
//        while (!postSeasonTournies.isEmpty() && a < simulateToGame) {
//            playedSome = true;
//            PostSeasonTourny tempa = postSeasonTournies.poll();
//            tempa.playFakeGame();
//            if (tempa.getCurrentGame() < 11) {
//                postSeasonTournies.offer(tempa);
//            }
//            a++;
//        }
//        if (gamesPlayed == 2422) {
//            confChamps = new HashSet<>();
//            for (PostSeasonTourny pst : postTourniesInOrder) {
//                confChamps.add(pst.getChampion());
//            }
//            updateRankings(true);
//            if (playedSome) {
//                theBracket = new MarchMadness(rankings);
//                toFileMM();
//            }
//        }
//        updateStandings();
//        toFileSchedule();
//        makeGoodLookinStandings();
//        toFileWL();
//        toFileRemainingSchedule();
//        toFileConfTournies();
//        toFilePreSeasonTournies();
//        Scanner keyboard = new Scanner(System.in);
//        System.out.print("Call to reset records(y/n)? ");
//        String answer = keyboard.nextLine().toUpperCase();
//        while (!answer.equals("Y") && !answer.equals("N")) {
//            System.out.println("Sorry, try again: ");
//            answer = keyboard.nextLine().toUpperCase();
//        }
//        if (answer.equals("Y")) {
//            readOrResetRecords(false);
//        }
//        System.out.println();
//    }

    public static void toFileRemainingSchedule() throws IOException {
        StringBuilder sb = new StringBuilder();
        for (int a = gamesPlayed; a < TOTAL_NUM_CONF_GAMES + CONF_CHALLENGE_TOTAL; a++) {
            Team b = schedule[0][a];
            Team c = schedule[1][a];
            int bRank = inRanks.indexOf(b) + 1;
            int cRank = inRanks.indexOf(c) + 1;
            sb.append("(").append(b.getWin()).append("-").append(b.getLoss()).append(")");
            if (bRank != 0) {
                sb.append(bRank).append(".");
            }
            sb.append(b.getName()).append(" vs ");
            if (cRank != 0) {
                sb.append(cRank).append(".");
            }
            sb.append(c.getName()).append("(").append(c.getWin()).append("-").append(c.getLoss())
                    .append(")");
            sb.append("\n");
        }
        File file = new File("FBAJC/Schedule-Remaining.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    private static void readFirstPreTournys() throws IOException {
        Scanner input = new Scanner(new File("FBAJC/PreTournys.txt"));
        preSeasonTournies = new PriorityQueue<>(27);
        preTourniesInOrder = new ArrayList<>();
        while (input.hasNextLine()) {
            List<Team> teams = new ArrayList<>();
            String tournyName = input.nextLine();
            for (int a = 0; a < 8; a++) {
                teams.add(teamNames.get(input.nextLine()));
            }
            PreSeasonTourny pst = new PreSeasonTourny(teams, tournyName);
            preSeasonTournies.add(pst);
            preTourniesInOrder.add(pst);
        }
        toFilePreSeasonTournies();
    }

    private static void toFilePreSeasonTournies() throws IOException {
        StringBuilder sb = new StringBuilder();
        for (PreSeasonTourny pst : preTourniesInOrder) {
            sb.append(pst.getName()).append("/").append(pst.getCurrentGame()).append("\n");
            Team[][] bracket = pst.getBracket();
            for (int a = 0; a <  12; a++) {
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
            if (pst.getChampion() == null) {
                sb.append("--").append("\n");
            }
            else {
                sb.append(pst.getChampion().getName()).append("\n");
            }
        }
        File file = new File("FBAJC/PSTStorage.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
        makeGoodLookinPreTournies();
    }

    private static void readPreSeasonTournies() throws IOException {
        Scanner input = new Scanner(new File("FBAJC/PSTStorage.txt"));
        preSeasonTournies = new PriorityQueue<>(27);
        preTourniesInOrder = new ArrayList<>();
        while (input.hasNextLine()) {
            String line = input.nextLine();
            Object[] b = line.split("/");
            String tournyName = (String) b[0];
            int currentGame = Integer.parseInt((String) b[1]);
            Team[][] bracket = new Team[2][12];
            for (int a = 0; a < 12; a++) {
                String line1 = input.nextLine();
                String line2 = input.nextLine();
                if (!line1.equals("--")) {
                    bracket[0][a] = teamNames.get(line1);
                }
                if (!line2.equals("--")) {
                    bracket[1][a] = teamNames.get(line2);
                }
            }
            PreSeasonTourny temp = new PreSeasonTourny(tournyName);
            String line3 = input.nextLine();
            if (!line.equals("--")) {
                temp.setChampion(teamNames.get(line3));
            }
            temp.setBracket(bracket);
            temp.setCurrentGame(currentGame);
            if (currentGame < 12) {
                preSeasonTournies.add(temp);
            }
            preTourniesInOrder.add(temp);
        }
    }

    private static void playPreSeasonTournies() throws IOException {
        Scanner keyboard = new Scanner(System.in);
        boolean playedGame = false;
        toFilePreSeasonTournies();
        while (!preSeasonTournies.isEmpty()) {
            playedGame = true;
            PreSeasonTourny temp = preSeasonTournies.poll();
            temp.playGame();
            toFileSchedule();
            toFile();
            toFileWL();
            toFilePreSeasonTournies();
            toFileBestScorers();
            if (temp.getCurrentGame() < 12) {
                preSeasonTournies.offer(temp);
            }
            if (!Main.simulatePreST) {
                if (updateNames) {
                    System.out.print("Update Names!");
                }
                System.out.print("ready for next game?");
                keyboard.nextLine();
                System.out.println();
            }
        }
        toFilePreSeasonTournies();
        if (playedGame) {
            updateRankings(true);
        }
    }

    private static void readEarlyRanks() throws IOException {
        inRanks = new ArrayList<>();
        rankings = new ArrayList<>();
        preSeasonRanks = new ArrayList<>();

        Scanner input = new Scanner(new File("FBAJC/PreSeasonRanks.txt"));

        while (input.hasNextLine() && inRanks.size() < 25) {

            String line = input.nextLine().trim();

            if (line.isEmpty()) {
                continue;
            }

            int underscore = line.indexOf("_");

            if (underscore == -1) {
                continue;
            }

            String teamName = line.substring(underscore + 1);

            Team t = teamNames.get(teamName);

            if (t != null) {
                inRanks.add(t);
                preSeasonRanks.add(t);
            }
        }

        input.close();

        // Before preseason tournaments
        if (gamesPlayed < PRE_S_TOURN_TOTAL) {

            StringBuilder sb = new StringBuilder("-Rankings-\nGames Played: 0\n");

            int longest = 0;

            for (Team t : inRanks) {
                rankings.add(t);

                if (t.getName().length() > longest) {
                    longest = t.getName().length();
                }
            }

            longest += 2;

            int rank = 1;

            for (Team t : inRanks) {

                sb.append(rank)
                        .append(".")
                        .append(t.getName())
                        .append(":");

                int spacing = longest;

                if (rank >= 10) {
                    spacing--;
                }

                for (int a = t.getName().length(); a < spacing; a++) {
                    sb.append(" ");
                }

                sb.append("(NR)\n");

                rank++;
            }

            sb.append("\n-Dropped-\nnone");

            File file = new File("FBAJC/Rankings.txt");
            FileWriter fw = new FileWriter(file);

            fw.write(sb.toString());
            fw.close();
        }
    }

    private static void makeGoodLookinPreTournies() throws IOException {
        StringBuilder sb = new StringBuilder();
        for (PreSeasonTourny pst : preTourniesInOrder) {
            Team[][] bracket = pst.getBracket();
            sb.append("   --").append(pst.getName()).append("--").append("\n");
            for (int a = 0; a < 12; a++) {
                if (a == 0) {
                    sb.append("   -First Round-").append("\n");
                }
                else if (a == 4) {
                    sb.append("   -Loser's Bracket-").append("\n");
                }
                else if(a == 6) {
                    sb.append("   -Semi-Finals-").append("\n");
                }
                else if (a == 8) {
                    sb.append("   -7th Place Game-").append("\n");
                }
                else if (a == 9) {
                    sb.append("   -5th Place Game-").append("\n");
                }
                else if (a == 10) {
                    sb.append("   -3rd Place Game-").append("\n");
                }
                else if (a == 11) {
                    sb.append("   -Championship-").append("\n");
                }
                Team b = bracket[0][a];
                Team c = bracket[1][a];
                if (b != null) {
                    if (preSeasonRanks.contains(b)) {
                        sb.append("(").append((preSeasonRanks.indexOf(b) + 1)).append(")");
                    }
                    sb.append(b.getName());
                }
                else {
                    sb.append("TBD");
                }
                sb.append(" vs ");
                if (c != null) {
                    if (preSeasonRanks.contains(c)) {
                        sb.append("(").append((preSeasonRanks.indexOf(c) + 1)).append(")");
                    }
                    sb.append(c.getName());
                }
                else {
                    sb.append("TBD");
                }
                sb.append("\n");
            }
            sb.append("   -Champions-").append("\n");
            if (pst.getChampion() != null) {
                sb.append(pst.getChampion().getName());
            }
            else {
                sb.append("TBD");
            }
            sb.append("\n").append("\n").append("\n");
        }
        File file = new File("FBAJC/PreSeasonBrackets.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    private static void playConfTournies() throws IOException {
        if (postSeasonTournies == null) {
            readConfTournies();
        }
        boolean playedSome = false;
        while (!postSeasonTournies.isEmpty()) {
            Scanner keyboard = new Scanner(System.in);
            playedSome = true;
            PostSeasonTourny temp = postSeasonTournies.poll();
            makeGoodLookinConfTournies();
            temp.playGame();
            toFileConfTournies();
            toFile();
            toFileWL();
            makeGoodLookinStandings();
            toFileBestScorers();
            if (temp.getCurrentGame() < 11) {
                postSeasonTournies.offer(temp);
            }
            confChamps = new HashSet<>();
            for (PostSeasonTourny pst : postTourniesInOrder) {
                confChamps.add(pst.getChampion());
            }
            if (!Main.simulatePreST) {
                if (updateNames) {
                    System.out.print("Update Names!");
                }
                System.out.print("ready for next game?");
                keyboard.nextLine();
                System.out.println();
            }
        }
        if (playedSome) {
            updateRankings(true);
            theBracket = new MarchMadness(rankings);
            theNIT = new NIT(theBracket.getNITField());
            toFileMM();
            theBracket.printNIT();
        }
    }

    private static void toFileConfTournies() throws IOException {
        StringBuilder sb = new StringBuilder();
        for (PostSeasonTourny pst : postTourniesInOrder) {
            sb.append(pst.getName()).append("/").append(pst.getCurrentGame()).append("\n");
            Team[][] bracket = pst.getBracket();
            for (int a = 0; a <  11; a++) {
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
            if (pst.getChampion() == null) {
                sb.append("--").append("\n");
            }
            else {
                sb.append(pst.getChampion().getName()).append("\n");
            }
        }
        File file = new File("FBAJC/CTStorage.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
        makeGoodLookinConfTournies();
    }

    private static void readConfTournies() throws FileNotFoundException {
        Scanner input = new Scanner(new File("FBAJC/CTStorage.txt"));
        postSeasonTournies = new PriorityQueue<>(11);
        postTourniesInOrder = new ArrayList<>();
        while (input.hasNextLine()) {
            String line = input.nextLine();
            Object[] b = line.split("/");
            String tournyName = (String) b[0];
            int currentGame = Integer.parseInt((String) b[1]);
            Team[][] bracket = new Team[2][11];
            for (int a = 0; a < 11; a++) {
                String line1 = input.nextLine();
                String line2 = input.nextLine();
                if (!line1.equals("--")) {
                    bracket[0][a] = teamNames.get(line1);
                }
                if (!line2.equals("--")) {
                    bracket[1][a] = teamNames.get(line2);
                }
            }
            bracket[0][0].setConfSeed(8);
            bracket[1][0].setConfSeed(9);
            bracket[0][1].setConfSeed(5);
            bracket[1][1].setConfSeed(12);
            bracket[0][2].setConfSeed(6);
            bracket[1][2].setConfSeed(11);
            bracket[0][3].setConfSeed(7);
            bracket[1][3].setConfSeed(10);
            bracket[0][4].setConfSeed(1);
            bracket[0][5].setConfSeed(4);
            bracket[0][6].setConfSeed(3);
            bracket[0][7].setConfSeed(2);
            PostSeasonTourny temp = new PostSeasonTourny(tournyName);
            String line3 = input.nextLine();
            if (!line.equals("--")) {
                temp.setChampion(teamNames.get(line3));
            }
            temp.setBracket(bracket);
            temp.setCurrentGame(currentGame);
            if (currentGame < 11) {
                postSeasonTournies.add(temp);
            }
            postTourniesInOrder.add(temp);
        }
    }

    private static void makeGoodLookinConfTournies() throws IOException {
        StringBuilder sb = new StringBuilder();
        for (PostSeasonTourny pst : postTourniesInOrder) {
            Team[][] bracket = pst.getBracket();
            sb.append("   --").append(pst.getName()).append("--").append("\n");
            for (int a = 0; a < 11; a++) {
                if (a == 0) {
                    sb.append("   -First Round-").append("\n");
                }
                else if (a == 4) {
                    sb.append("   -Quarter-Finals-").append("\n");
                }
                else if(a == 8) {
                    sb.append("   -Semi-Finals-").append("\n");
                }
                else if (a == 10) {
                    sb.append("   -Championship-").append("\n");
                }
                Team b = bracket[0][a];
                Team c = bracket[1][a];
                int b_seed;
                int c_seed;
                if (b != null) {
                    if (b.getConfSeed() == 0) {
                        b_seed = b.getConf().indexOf(b) + 1;
                    }
                    else {
                        b_seed = b.getConfSeed();
                    }
                    sb.append("(").append(b_seed).append(")").append(b.getName());
                }
                else {
                    sb.append("TBD");
                }
                sb.append(" vs ");
                if (c != null) {
                    if (c.getConfSeed() == 0) {
                        c_seed = c.getConf().indexOf(c) + 1;
                    }
                    else {
                        c_seed = c.getConfSeed();
                    }
                    sb.append("(").append(c_seed).append(")").append(c.getName());
                }
                else {
                    sb.append("TBD");
                }
                sb.append("\n");
            }
            sb.append("   -Champions-").append("\n");
            if (pst.getChampion() != null) {
                sb.append(pst.getChampion().getName());
            }
            else {
                sb.append("TBD");
            }
            sb.append("\n").append("\n").append("\n");
        }
        File file = new File("FBAJC/ConferenceBrackets.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    private static void playMarchMadness() throws IOException {
        if (theBracket == null) {
            readMM();
        }
        while (theBracket.getChampion() == null) {
            makeGoodLookinMM();
            makeGoodLookinStandings();
            theBracket.playGame();
            toFileWL();
            toFileMM();
        }
        makeGoodLookinStandings();
        makeGoodLookinMM();
    }

    public static void playNIT() throws IOException {
        if (theBracket == null) {
            if (new File("FBAJC/MMStorage.txt").exists()) {
                readMM();
            } else {
                throw new IllegalStateException("March Madness bracket must be created before NIT.");
            }
        }

        if (theNIT == null) {
            if (new File("FBAJC/NITStorage.txt").exists()) {
                theNIT = new NIT(teamNames); // uses the existing read constructor
            } else {
                throw new IllegalStateException("NIT storage not found.");
            }
        }

        while (!theNIT.isOver()) {
            theNIT.playGame();
            toFileSchedule();
            toFile();
            toFileWL();
            makeGoodLookinStandings();
        }

        System.out.println("Congrats " + theNIT.getChampion().getName()
                + ", you are S" + season + " NIT Champions!");
    }

    private static void toFileMM() throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("S").append(season).append(" March Madness").append("/")
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
        File file = new File("FBAJC/MMStorage.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
        makeGoodLookinMM();
    }

    private static void readMM() throws FileNotFoundException {
        Scanner input = new Scanner(new File("FBAJC/MMStorage.txt"));
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
    }

    private static void makeGoodLookinMM() throws IOException {
        StringBuilder sb = new StringBuilder();
        Team[][] bracket = theBracket.getBracket();
        sb.append("                                              --").append("S").append(season).append(" March Madness").append("--")
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
        File file = new File("FBAJC/MMBrackets.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    private static void clearBrackets() throws IOException {
        StringBuilder sb = new StringBuilder();
        for (int b = 0; b < 24; b++) {
            sb.append("   --").append("TBD").append("--").append("\n");
            for (int a = 0; a < 12; a++) {
                if (a == 0) {
                    sb.append("   -First Round-").append("\n");
                }
                else if (a == 4) {
                    sb.append("   -Loser's Bracket-").append("\n");
                }
                else if(a == 6) {
                    sb.append("   -Semi-Finals-").append("\n");
                }
                else if (a == 8) {
                    sb.append("   -7th Place Game-").append("\n");
                }
                else if (a == 9) {
                    sb.append("   -5th Place Game-").append("\n");
                }
                else if (a == 10) {
                    sb.append("   -3rd Place Game-").append("\n");
                }
                else if (a == 11) {
                    sb.append("   -Championship-").append("\n");
                }
                sb.append("TBD");
                sb.append(" vs ");
                sb.append("TBD");
                sb.append("\n");
            }
            sb.append("   -Champions-").append("\n");
            sb.append("TBD");
            sb.append("\n").append("\n").append("\n");
        }
        File file = new File("FBAJC/PreSeasonBrackets.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
        sb = new StringBuilder();
        for (int b = 0; b < 16; b++) {
            sb.append("   --").append("TBD").append("--").append("\n");
            for (int a = 0; a < 11; a++) {
                if (a == 0) {
                    sb.append("   -First Round-").append("\n");
                }
                else if (a == 4) {
                    sb.append("   -Quarter-Finals-").append("\n");
                }
                else if(a == 8) {
                    sb.append("   -Semi-Finals-").append("\n");
                }
                else if (a == 10) {
                    sb.append("   -Championship-").append("\n");
                }
                sb.append("TBD");
                sb.append(" vs ");
                sb.append("TBD");
                sb.append("\n");
            }
            sb.append("   -Champions-").append("\n");
            sb.append("TBD");
            sb.append("\n").append("\n").append("\n");
        }
        file = new File("FBAJC/ConferenceBrackets.txt");
        fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
        sb = new StringBuilder();
        sb.append("                                              --").append("S").append(season).append(" March Madness").append("--")
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
            sb.append("TBD");
            sb.append(" vs ");
            sb.append("TBD");
            sb.append("\n");
        }
        sb.append("\n");
        for (int a = 60; a < 62; a++) {
            if (a == 60) {
                sb.append("\n").append("   --Final Four--").append("\n");
            }
            sb.append("TBD");
            sb.append(" vs ");
            sb.append("TBD");
            sb.append("\n");
        }
        sb.append("   --National Championship--").append("\n");
        sb.append("TBD");
        sb.append(" vs ");
        sb.append("TBD");
        sb.append("\n");
        sb.append("   --Champions--").append("\n");
        sb.append("TBD");
        sb.append("\n").append("\n").append("\n");
        file = new File("FBAJC/MMBrackets.txt");
        fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    public static void averageTeamRatingsUpdate() {
        averageTeamRatings = 0.0;
        double num_teams = 0.0;
        for (ArrayList<Team> conf: allConferences) {
            for (Team t: conf) {
                num_teams++;
                averageTeamRatings += t.getTeamRating();
            }
        }
        averageTeamRatings /= num_teams;
    }

    private static ArrayList<Team> getPreSeasonRankingList() {
        ArrayList<Team> sortedTeams = new ArrayList<>(teamNames.values());

        // Random tie breaker so equal team ratings do not always stay in the same order
        Collections.shuffle(sortedTeams);

        sortedTeams.sort((t1, t2) -> Double.compare(t2.getTeamRating(), t1.getTeamRating()));

        return sortedTeams;
    }

    private static void toFilePreSeasonRankingsHistory() throws IOException {
        ArrayList<Team> sortedTeams = getPreSeasonRankingList();
        int numTeamsToRank = Math.min(season, sortedTeams.size());

        StringBuilder sb = new StringBuilder();

        sb.append("========================================\n");
        sb.append("        FBAJC PRESEASON RANKINGS        \n");
        sb.append("========================================\n");
        sb.append("Season: S").append(season).append("\n");
        sb.append("Teams Ranked: Top ").append(numTeamsToRank).append("\n\n");

        sb.append(String.format("%-6s %-25s %-8s %-8s%n",
                "Rank", "Team", "Conf", "Rating"));
        sb.append("------------------------------------------------\n");

        for (int i = 0; i < numTeamsToRank; i++) {
            Team t = sortedTeams.get(i);

            sb.append(String.format("%-6d %-25s %-8s %-8.1f%n",
                    i + 1,
                    t.getName(),
                    t.getConference(),
                    t.getTeamRating()));
        }

        sb.append("\n\n");
        sb.append("========================================\n");
        sb.append("        FBAJC PRESEASON TOP PLAYERS     \n");
        sb.append("========================================\n");
        sb.append("Players Ranked: Top ").append(season).append("\n\n");

        ArrayList<Player> allPlayers = new ArrayList<>();

        for (Team t : teams.values()) {
            for (Player p : t.getPlayers()) {
                if (p != null) {
                    allPlayers.add(p);
                }
            }
        }

        Collections.shuffle(allPlayers);
        allPlayers.sort((p1, p2) -> Integer.compare(p2.cur_rating, p1.cur_rating));

        int numPlayersToRank = Math.min(season, allPlayers.size());

        sb.append(String.format("%-6s %-25s %-10s %-8s%n",
                "Rank", "Player", "Team", "Rating"));
        sb.append("------------------------------------------------\n");

        for (int i = 0; i < numPlayersToRank; i++) {
            Player p = allPlayers.get(i);

            sb.append(String.format("%-6d %-25s %-10s %-8d%n",
                    i + 1,
                    p.getName(),
                    p.getTeam().getAbreviation(),
                    p.cur_rating));
        }

        File file = new File("FBAJC/PreSeasonRankingsHistory.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    private static void toFileConferencePreSeasonRankings() throws IOException {
        StringBuilder sb = new StringBuilder();

        sb.append("========================================\n");
        sb.append("     FBAJC CONFERENCE PRESEASON RANKINGS\n");
        sb.append("========================================\n");
        sb.append("Season: S").append(season).append("\n\n");

        for (ArrayList<Team> conf : allConferences) {
            if (conf.isEmpty()) {
                continue;
            }

            ArrayList<Team> sortedConf = new ArrayList<>(conf);
            Collections.shuffle(sortedConf);
            sortedConf.sort((t1, t2) -> Double.compare(t2.getTeamRating(), t1.getTeamRating()));

            String confAbbr = sortedConf.get(0).getConference();

            sb.append("----------------------------------------\n");
            sb.append(getConferenceName(confAbbr))
                    .append(" (")
                    .append(confAbbr)
                    .append(")\n");
            sb.append("----------------------------------------\n");

            sb.append(String.format("%-6s %-25s %-8s%n",
                    "Rank", "Team", "Rating"));
            sb.append("----------------------------------------\n");

            for (int i = 0; i < sortedConf.size(); i++) {
                Team t = sortedConf.get(i);

                sb.append(String.format("%-6d %-25s %-8.1f%n",
                        i + 1,
                        t.getName(),
                        t.getTeamRating()));
            }

            sb.append("\n");
        }

        File file = new File("FBAJC/ConferencePreSeasonRankings.txt");
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    private static String getConferenceName(String conf) {
        if (conf.equals("B12")) return "Big 12";
        if (conf.equals("ACC")) return "ACC";
        if (conf.equals("BE")) return "Big East";
        if (conf.equals("SEC")) return "SEC";
        if (conf.equals("B10")) return "Big Ten";
        if (conf.equals("AAC")) return "American";
        if (conf.equals("P12")) return "PAC 12";
        if (conf.equals("A10")) return "Atlantic 10";
        if (conf.equals("PAT")) return "Patriot";
        if (conf.equals("COL")) return "Colonial";
        if (conf.equals("HOR")) return "Horizon";
        if (conf.equals("IVY")) return "Ivy League";
        if (conf.equals("SOCON")) return "Southern";
        if (conf.equals("SUN")) return "Sun Belt";
        if (conf.equals("SKY")) return "Big Sky";
        if (conf.equals("MWC")) return "Mountain West";
        if (conf.equals("OVC")) return "Ohio Valley";
        return "NEC";
    }

    private static void toFilePreSeasonRanks() throws IOException {
        ArrayList<Team> sortedTeams = getPreSeasonRankingList();

        int top25 = Math.min(25, sortedTeams.size());

        StringBuilder sb = new StringBuilder();

        for (int i = 0; i < top25; i++) {
            Team t = sortedTeams.get(i);

            sb.append(i + 1)
                    .append("_")
                    .append(t.getName());

            if (i != top25 - 1) {
                sb.append("\n");
            }
        }

        File file = new File("FBAJC/PreSeasonRanks.txt");
        FileWriter fw = new FileWriter(file);

        fw.write(sb.toString());
        fw.close();
    }

    private static void toFileAwards() throws IOException {
        updatePlayerPPGs();

        PrintWriter out = new PrintWriter(new FileWriter("FBAJC/Awards.txt"));

        printAwardRace(out, "Trae York Player of the Year",
                new String[]{"PG", "SG", "SF", "PF", "C"}, null, false, 15, false);

        printAwardRace(out, "Angelo Farrell Freshman of the Year",
                new String[]{"PG", "SG", "SF", "PF", "C"}, null, true, 15, false);

        printAwardRace(out, "Rhett Blackwell Guard of the Year",
                new String[]{"PG", "SG"}, null, false, 10, false);

        printAwardRace(out, "Jacob Peters Forward of the Year",
                new String[]{"SF", "PF"}, null, false, 10, false);

        printAwardRace(out, "Dustin Holloway Center of the Year",
                new String[]{"C"}, null, false, 10, false);

        printConferencePlayerOfTheYearRaces(out);

        out.close();
    }

    private static void updatePlayerPPGs() {
        for (Team t : teams.values()) {
            int games = t.getWin() + t.getLoss();

            for (Player p : t.getPlayers()) {
                if (p != null) {
                    p.newPPG(games);
                }
            }
        }
    }

    private static void printConferencePlayerOfTheYearRaces(PrintWriter out) {
        for (ArrayList<Team> conf : allConferences) {
            if (conf.isEmpty()) {
                continue;
            }

            String confAbbr = conf.get(0).getConference();

            // In printConferencePlayerOfTheYearRaces:
            printAwardRace(out,
                getConferenceName(confAbbr) + " Player of the Year",
                new String[]{"PG", "SG", "SF", "PF", "C"},
                confAbbr,
                false,
                10,
                true);  // <-- confAward = true
        }
    }

    private static void printAwardRace(PrintWriter out, String awardName,
                                String[] positions, String conference,
                                boolean freshmenOnly, int limit, boolean confAward) {
        ArrayList<Player> candidates = new ArrayList<>();

        for (Team t : teams.values()) {
            if (conference != null && !t.getConference().equals(conference)) {
                continue;
            }

            for (Player p : t.getPlayers()) {
                if (p != null
                        && matchesPosition(p, positions)
                        && (!freshmenOnly || p.getGrade().equals("Fr"))) {
                    candidates.add(p);
                }
            }
        }

        candidates.sort((a, b) -> {
            int cmp = Double.compare(getAwardScore(b, confAward), getAwardScore(a, confAward));
            if (cmp != 0) return cmp;

            cmp = Double.compare(b.getPPG(), a.getPPG());
            if (cmp != 0) return cmp;

            return Integer.compare(b.cur_rating, a.cur_rating);
        });

        out.println();
        out.println("========== " + awardName + " ==========");

        if (candidates.isEmpty()) {
            out.println("No candidates found.");
            return;
        }

        out.printf("%-5s %-22s %-10s %-5s %-6s %-7s %-10s%n",
                "Rank", "Name", "Team", "Pos", "PPG", "Rating", "Odds");
        out.println("----------------------------------------------------------------");

        int actualLimit = Math.min(limit, candidates.size());
        int oddsPool = Math.min(8, candidates.size());

        double bestScore = getAwardScore(candidates.get(0), confAward);
        double temperature = 8.0;

        ArrayList<Double> weights = new ArrayList<>();
        double totalWeight = 0.0;

        for (int i = 0; i < oddsPool; i++) {
            double score = getAwardScore(candidates.get(i), confAward);
            double weight = Math.exp((score - bestScore) / temperature);
            weights.add(weight);
            totalWeight += weight;
        }

        for (int i = 0; i < actualLimit; i++) {
            Player p = candidates.get(i);

            String odds;
            if (i < oddsPool) {
                double probability = weights.get(i) / totalWeight;
                odds = toAmericanOdds(probability);
            } else {
                odds = "+10000";
            }

            out.printf("%-5d %-22s %-10s %-5s %-6.1f %-7d %-10s%n",
                    i + 1,
                    p.getName(),
                    p.getTeam().getAbreviation(),
                    p.getPosition(),
                    p.getPPG(),
                    p.cur_rating,
                    odds);
        }
    }

    private static boolean matchesPosition(Player p, String[] positions) {
        for (String pos : positions) {
            if (p.getPosition().equals(pos)) {
                return true;
            }
        }
        return false;
    }

    private static double getAwardScore(Player p, boolean confAward) {
        double ppg = Double.isNaN(p.getPPG()) ? 0.0 : p.getPPG();

        // Normalize each component to a 0-100 scale before weighting
        double ppgScore    = (ppg / 30.0) * 100;           // 30 PPG = 100
        double ratingScore = ((p.cur_rating - 60) / 39.0) * 100;  // 60 baseline, 99 = 100
        double teamScore   = getTeamSuccessScore(p, confAward);    // already 10-100

        return ppgScore * 0.40 + ratingScore * 0.35 + teamScore * 0.25;
    }

    private static double getTeamSuccessScore(Player p, boolean confAward) {
        Team t = p.getTeam();

        if (confAward) {
            int confPos = t.getConf().indexOf(t) + 1;
            int confSize = t.getConf().size();
            // 1st = 100, last = ~8
            return Math.max(10, 101 - (int)(((double)(confPos - 1) / confSize) * 100));
        }

        if (rankings == null || rankings.isEmpty()) return 50;

        int rank = rankings.indexOf(t) + 1;

        if (rank <= 0 || rank > 25) {
            // Unranked — use team rating relative to average as a tiebreaker
            // so strong-team-but-unranked players aren't floored at 10
            double teamRating = t.getTeamRating();
            return Math.max(10, Math.min(50, (int)(teamRating - averageTeamRatings + 30)));
        }

        return Math.max(10, 101 - rank);
    }

    private static String toAmericanOdds(double probability) {
        probability = Math.max(0.0001, Math.min(0.9999, probability));

        int odds;

        if (probability > 0.5) {
            odds = (int) Math.round(-100 * probability / (1.0 - probability));
        } else {
            odds = (int) Math.round(100 * (1.0 - probability) / probability);
        }

        if (odds > 10000) odds = 10000;
        if (odds < -5000) odds = -5000;

        return odds > 0 ? "+" + odds : String.valueOf(odds);
    }

    private static void printGameAnnouncement(Team one, Team two) {
        boolean oneRanked = inRanks.contains(one);
        boolean twoRanked = inRanks.contains(two);

        if (!oneRanked && !twoRanked) {
            return;
        }

        int oneRank = oneRanked ? inRanks.indexOf(one) + 1 : 999;
        int twoRank = twoRanked ? inRanks.indexOf(two) + 1 : 999;

        boolean rankedMatchup = oneRanked && twoRanked;

        int bestRank = Math.min(oneRank, twoRank);

        String tier;

        if (rankedMatchup) {
            int worstRank = Math.max(oneRank, twoRank);

            if (worstRank <= 5) {
                tier = "TOP 5 SHOWDOWN";
            }
            else if (worstRank <= 10) {
                tier = "TOP 10 SHOWDOWN";
            }
            else if (worstRank <= 15) {
                tier = "TOP 15 SHOWDOWN";
            }
            else if (worstRank <= 20) {
                tier = "TOP 20 SHOWDOWN";
            }
            else {
                tier = "RANKED MATCHUP";
            }
        }
        else {
            if (bestRank <= 5) {
                tier = "TOP 5 TEAM IN ACTION";
            }
            else if (bestRank <= 10) {
                tier = "TOP 10 TEAM IN ACTION";
            }
            else {
                tier = "RANKED TEAM IN ACTION";
            }
        }

        String oneName = oneRanked
                ? "#" + oneRank + " " + one.getName()
                : one.getName();

        String twoName = twoRanked
                ? "#" + twoRank + " " + two.getName()
                : two.getName();

        String line1 = oneName + " vs " + twoName;

        String line2 = one.getConference()
                + " · "
                + one.getWin() + "-" + one.getLoss()
                + "  vs  "
                + two.getConference()
                + " · "
                + two.getWin() + "-" + two.getLoss();

        String line3 = "Ratings: "
                + String.format("%.1f", one.getTeamRating())
                + " vs "
                + String.format("%.1f", two.getTeamRating());

        final int WIDTH = 62;

        System.out.println();
        System.out.println("╔══════════════════════════════════════════════════════════════╗");
        System.out.printf ("║ %-60s ║%n", centerText(tier, 60));
        System.out.println("╠══════════════════════════════════════════════════════════════╣");
        System.out.printf ("║ %-60s ║%n", centerText(line1, 60));
        System.out.printf ("║ %-60s ║%n", centerText(line2, 60));
        System.out.printf ("║ %-60s ║%n", centerText(line3, 60));
        System.out.println("╚══════════════════════════════════════════════════════════════╝");
        System.out.println();
    }

    private static String centerText(String text, int width) {
        if (text.length() >= width) {
            return text;
        }

        int leftPadding = (width - text.length()) / 2;
        int rightPadding = width - text.length() - leftPadding;

        return " ".repeat(leftPadding)
                + text
                + " ".repeat(rightPadding);
    }
}