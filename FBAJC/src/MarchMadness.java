import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.*;

public class MarchMadness {
    private Team[][] fullBracket;
    private Team[][] bracket1;
    private Team[][] bracket2;
    private Team[][] bracket3;
    private Team[][] bracket4;
    private ArrayList<Team> region1;
    private ArrayList<Team> region2;
    private ArrayList<Team> region3;
    private ArrayList<Team> region4;
    private ArrayList<Team> field;
    private ArrayList<Team> NIT_field;
    private int gamesPlayed;
    private int r1game;
    private int r2game;
    private int r3game;
    private int r4game;
    private Team champion;


    public MarchMadness(List<Team> teams) {
        gamesPlayed = 0;
        r1game = 0;
        r2game = 0;
        r3game = 0;
        r4game = 0;
        champion = null;
        fullBracket = new Team[2][63];
        setRanksToBracket(teams);
        presentBracket();
    }

    public MarchMadness() {
        gamesPlayed = 0;
        r1game = 0;
        r2game = 0;
        r3game = 0;
        r4game = 0;
        champion = null;
        fullBracket = new Team[2][63];
    }

    private void setRanksToBracket(List<Team> teams) {
        final int FIELD_SIZE = 64;
        final int[] SEED_OPPS_1 = {0, 3, 4, 7, 8, 11, 12, 15};
        final int[] SEED_OPPS_2 = {1, 2, 5, 6, 9, 10, 13, 14};
        field = new ArrayList<>();
        NIT_field = new ArrayList<>();
        int major_conf_champs = 9;
        List<Team> ogRanks = new ArrayList<>(teams);
        region1 = new ArrayList<>();
        region2 = new ArrayList<>();
        region3 = new ArrayList<>();
        region4 = new ArrayList<>();
        List<Team> conferChamps = new ArrayList<>();
        //Sort conf champs by their rank
        for (int a = 0; a < Main.confChamps.size(); a++) {
            Team best = null;
            for (Team t : Main.confChamps) {
                if (!conferChamps.contains(t)) {
                    if (best == null || teams.indexOf(t) < teams.indexOf(best)) {
                        best = t;
                    }
                }
            }
            conferChamps.add(best);
        }
        //Create the 64 team field based on rank
        for (int a = 0; a < FIELD_SIZE; a++) {
            if (conferChamps.size() >= FIELD_SIZE - a) {
                field.add(conferChamps.get(0));
                ogRanks.remove(conferChamps.get(0));
                String conf = conferChamps.get(0).getConference();
                if (conf.equals("B12") || conf.equals("ACC") || conf.equals("BE") || conf.equals("SEC") ||
                        conf.equals("B10") || conf.equals("AAC") || conf.equals("P12") || conf.equals("A10") || conf.equals("MWC")) {
                    major_conf_champs--;
                }
                conferChamps.remove(0);
            }
            else if (major_conf_champs >= 52 - a && major_conf_champs > 0) {
                Team t = conferChamps.get(0);
                String conf = t.getConference();
                int ind = 0;
                while (!conf.equals("B12") && !conf.equals("ACC") && !conf.equals("BE") && !conf.equals("SEC") &&
                        !conf.equals("B10") && !conf.equals("AAC") && !conf.equals("P12") && !conf.equals("A10") && !conf.equals("MWC")) {
                    ind++;
                    t = conferChamps.get(ind);
                    conf = t.getConference();
                }
                field.add(t);
                ogRanks.remove(t);
                conferChamps.remove(t);
                major_conf_champs--;
            }
            else {
                Team t = ogRanks.get(0);
                if (a >= 51) {
                    String conf = t.getConference();
                    int ind = 0;
                    while (conf.equals("B12") || conf.equals("ACC") || conf.equals("BE") || conf.equals("SEC") ||
                            conf.equals("B10") || conf.equals("AAC") || conf.equals("P12") || conf.equals("A10") || conf.equals("MWC")) {
                        ind++;
                        t = ogRanks.get(ind);
                        conf = t.getConference();
                    }
                }
                field.add(t);
                if (conferChamps.contains(t)) {
                    String conf = t.getConference();
                    if (conf.equals("B12") || conf.equals("ACC") || conf.equals("BE") || conf.equals("SEC") ||
                            conf.equals("B10") || conf.equals("AAC") || conf.equals("P12") || conf.equals("A10") || conf.equals("MWC")) {
                        major_conf_champs--;
                    }
                    conferChamps.remove(t);
                }
                ogRanks.remove(t);
            }
        }

        // create NIT field
        for (int i = 0; i < 32; i++) {
            if (!ogRanks.isEmpty()) {
                NIT_field.add(ogRanks.remove(0));
            }
        }

        //create da actual field
        int seed = 0;
        //Seeds 1-2
        for (int a = 0; a < 8; a++) {
            if (a % 4 == 0) {
                seed++;
            }
            if (seed % 2 == 1) {
                if (a % 4 == 0) {
                    region1.add(field.get(0));
                }
                else if (a % 4 == 1) {
                    region2.add(field.get(0));
                }
                else if (a % 4 == 2) {
                    region3.add(field.get(0));
                }
                else {
                    region4.add(field.get(0));
                }
            }
            else {
                if (a % 4 == 0) {
                    region4.add(field.get(0));
                }
                else if (a % 4 == 1) {
                    region3.add(field.get(0));
                }
                else if (a % 4 == 2) {
                    region2.add(field.get(0));
                }
                else {
                    region1.add(field.get(0));
                }
            }
            field.get(0).setSeed(seed);
            field.remove(0);
        }
        //Seeds 3-16
        for (int a = 0; a < 14; a++) {
            ArrayList<Team> this_seed = new ArrayList<>();
            for (int b = 0; b < 4; b++) {
                this_seed.add(field.remove(0));
                this_seed.get(b).setSeed(a + 3);
            }
            if (a % 2 == 1) {
                ArrayList<Team> new_seeds = new ArrayList<>();
                new_seeds.add(this_seed.get(3));
                new_seeds.add(this_seed.get(2));
                new_seeds.add(this_seed.get(1));
                new_seeds.add(this_seed.get(0));
                addToRegions(new_seeds, a + 2);
            }
            else {
                addToRegions(this_seed, a + 2);
            }
        }
        fullBracket = new Team[2][63];
        bracket1 = new Team[2][15];
        bracket2 = new Team[2][15];
        bracket3 = new Team[2][15];
        bracket4 = new Team[2][15];
        //region 1
        bracket1[0][0] = region1.get(0);
        bracket1[0][7] = region1.get(1);
        bracket1[0][4] = region1.get(2);
        bracket1[0][3] = region1.get(3);
        bracket1[0][2] = region1.get(4);
        bracket1[0][5] = region1.get(5);
        bracket1[0][6] = region1.get(6);
        bracket1[0][1] = region1.get(7);
        bracket1[1][1] = region1.get(8);
        bracket1[1][6] = region1.get(9);
        bracket1[1][5] = region1.get(10);
        bracket1[1][2] = region1.get(11);
        bracket1[1][3] = region1.get(12);
        bracket1[1][4] = region1.get(13);
        bracket1[1][7] = region1.get(14);
        bracket1[1][0] = region1.get(15);
        for (int a = 0; a < 8; a++) {
            for (int b = 0; b < 2; b++) {
                fullBracket[b][a] = bracket1[b][a];
            }
        }
        //region 2
        bracket2[0][0] = region2.get(0);
        bracket2[0][7] = region2.get(1);
        bracket2[0][4] = region2.get(2);
        bracket2[0][3] = region2.get(3);
        bracket2[0][2] = region2.get(4);
        bracket2[0][5] = region2.get(5);
        bracket2[0][6] = region2.get(6);
        bracket2[0][1] = region2.get(7);
        bracket2[1][1] = region2.get(8);
        bracket2[1][6] = region2.get(9);
        bracket2[1][5] = region2.get(10);
        bracket2[1][2] = region2.get(11);
        bracket2[1][3] = region2.get(12);
        bracket2[1][4] = region2.get(13);
        bracket2[1][7] = region2.get(14);
        bracket2[1][0] = region2.get(15);
        for (int a = 15; a < 23; a++) {
            for (int b = 0; b < 2; b++) {
                fullBracket[b][a] = bracket2[b][a - 15];
            }
        }
        //region 3
        bracket3[0][0] = region3.get(0);
        bracket3[0][7] = region3.get(1);
        bracket3[0][4] = region3.get(2);
        bracket3[0][3] = region3.get(3);
        bracket3[0][2] = region3.get(4);
        bracket3[0][5] = region3.get(5);
        bracket3[0][6] = region3.get(6);
        bracket3[0][1] = region3.get(7);
        bracket3[1][1] = region3.get(8);
        bracket3[1][6] = region3.get(9);
        bracket3[1][5] = region3.get(10);
        bracket3[1][2] = region3.get(11);
        bracket3[1][3] = region3.get(12);
        bracket3[1][4] = region3.get(13);
        bracket3[1][7] = region3.get(14);
        bracket3[1][0] = region3.get(15);
        for (int a = 30; a < 38; a++) {
            for (int b = 0; b < 2; b++) {
                fullBracket[b][a] = bracket3[b][a - 30];
            }
        }
        //region 4
        bracket4[0][0] = region4.get(0);
        bracket4[0][7] = region4.get(1);
        bracket4[0][4] = region4.get(2);
        bracket4[0][3] = region4.get(3);
        bracket4[0][2] = region4.get(4);
        bracket4[0][5] = region4.get(5);
        bracket4[0][6] = region4.get(6);
        bracket4[0][1] = region4.get(7);
        bracket4[1][1] = region4.get(8);
        bracket4[1][6] = region4.get(9);
        bracket4[1][5] = region4.get(10);
        bracket4[1][2] = region4.get(11);
        bracket4[1][3] = region4.get(12);
        bracket4[1][4] = region4.get(13);
        bracket4[1][7] = region4.get(14);
        bracket4[1][0] = region4.get(15);
        for (int a = 45; a < 53; a++) {
            for (int b = 0; b < 2; b++) {
                fullBracket[b][a] = bracket4[b][a - 45];
            }
        }
    }

    public void printNIT () throws IOException {
        if (NIT_field.size() == 32) {
            StringBuilder sb = new StringBuilder();
            sb.append("--NIT--").append("\n").append("\n").append("--Region 1--").append("\n");
            sb.append("1.").append(NIT_field.get(0).getName()).append(" vs 16.").append(NIT_field.get(31).getName()).append("\n");
            sb.append("8.").append(NIT_field.get(15).getName()).append(" vs 9.").append(NIT_field.get(16).getName()).append("\n");
            sb.append("5.").append(NIT_field.get(8).getName()).append(" vs 12.").append(NIT_field.get(23).getName()).append("\n");
            sb.append("4.").append(NIT_field.get(7).getName()).append(" vs 13.").append(NIT_field.get(24).getName()).append("\n");
            sb.append("3.").append(NIT_field.get(4).getName()).append(" vs 14.").append(NIT_field.get(27).getName()).append("\n");
            sb.append("6.").append(NIT_field.get(11).getName()).append(" vs 11.").append(NIT_field.get(20).getName()).append("\n");
            sb.append("7.").append(NIT_field.get(12).getName()).append(" vs 10.").append(NIT_field.get(19).getName()).append("\n");
            sb.append("2.").append(NIT_field.get(3).getName()).append(" vs 15.").append(NIT_field.get(28).getName()).append("\n").append("\n").append("--Region 2--").append("\n");

            sb.append("1.").append(NIT_field.get(1).getName()).append(" vs 16.").append(NIT_field.get(30).getName()).append("\n");
            sb.append("8.").append(NIT_field.get(14).getName()).append(" vs 9.").append(NIT_field.get(17).getName()).append("\n");
            sb.append("5.").append(NIT_field.get(9).getName()).append(" vs 12.").append(NIT_field.get(22).getName()).append("\n");
            sb.append("4.").append(NIT_field.get(6).getName()).append(" vs 13.").append(NIT_field.get(25).getName()).append("\n");
            sb.append("3.").append(NIT_field.get(5).getName()).append(" vs 14.").append(NIT_field.get(26).getName()).append("\n");
            sb.append("6.").append(NIT_field.get(10).getName()).append(" vs 11.").append(NIT_field.get(21).getName()).append("\n");
            sb.append("7.").append(NIT_field.get(13).getName()).append(" vs 10.").append(NIT_field.get(18).getName()).append("\n");
            sb.append("2.").append(NIT_field.get(2).getName()).append(" vs 15.").append(NIT_field.get(29).getName());
            File file = new File("NIT.txt");
            FileWriter fw = new FileWriter(file);
            fw.write(sb.toString());
            fw.close();
        }
    }

    private void addToRegions (ArrayList<Team> this_seed, int seed) {
        ArrayList<int[]> round_help = new ArrayList<>();
        int[] first_round_found = new int[4];
        int[] second_round_found = new int[4];
        int[] third_round_found = new int[4];
        int[] fourth_round_found = new int[4];
        round_help.add(first_round_found);
        round_help.add(second_round_found);
        round_help.add(third_round_found);
        round_help.add(fourth_round_found);
        ArrayList<ArrayList<Team>> regions = new ArrayList<>();
        regions.add(region1);
        regions.add(region2);
        regions.add(region3);
        regions.add(region4);
        int first_opp = 15 - seed;
        int highest_in_group;
        int second_opp_high;
        int second_opp_low;
        int third_o1_opp_high;
        int third_o1_opp_low;
        int third_o2_opp_high;
        int third_o2_opp_low;
        if (first_opp > seed) {
            second_opp_high = 7 - seed;
            highest_in_group = Math.min(seed, second_opp_high);
        }
        else {
            second_opp_high = 7 - first_opp;
            highest_in_group = Math.min(first_opp, second_opp_high);
        }
        second_opp_low = 15 - second_opp_high;
        third_o1_opp_high = 3 - highest_in_group;
        third_o2_opp_high = 7 - third_o1_opp_high;
        third_o1_opp_low = 15 - third_o1_opp_high;
        third_o2_opp_low = 15 - third_o2_opp_high;

        // find out the conference correlation for each opponent
        int reg_index = 0;
        int team_index = 0;
        for (Team t: this_seed) {
            String conf = t.getConference();
            reg_index = 0;
            for (ArrayList<Team> reg: regions) {
                round_help.get(team_index)[reg_index] = 4;

                if (reg.size() > third_o2_opp_low && reg.get(third_o2_opp_low).getConference().equals(conf)) {
                    round_help.get(team_index)[reg_index] = 3;
                }
                else if (reg.size() > third_o2_opp_high && reg.get(third_o2_opp_high).getConference().equals(conf)) {
                    round_help.get(team_index)[reg_index] = 3;
                }
                else if (reg.size() > third_o1_opp_low && reg.get(third_o1_opp_low).getConference().equals(conf)) {
                    round_help.get(team_index)[reg_index] = 3;
                }
                else if (reg.size() > third_o1_opp_high && reg.get(third_o1_opp_high).getConference().equals(conf)) {
                    round_help.get(team_index)[reg_index] = 3;
                }

                if (reg.size() > second_opp_low && reg.get(second_opp_low).getConference().equals(conf)) {
                    round_help.get(team_index)[reg_index] = 2;
                }
                else if (reg.size() > second_opp_high && reg.get(second_opp_high).getConference().equals(conf)) {
                    round_help.get(team_index)[reg_index] = 2;
                }

                if (reg.size() > first_opp && reg.get(first_opp).getConference().equals(conf)) {
                    round_help.get(team_index)[reg_index] = 1;
                }
                reg_index++;
            }
            team_index++;
        }


        // even, go in order of the regions, odd opposite
        boolean[] taken = new boolean[4];
        ArrayList<Team> third_round_worst = new ArrayList<>();
        ArrayList<Team> second_round_worst = new ArrayList<>();
        ArrayList<Team> first_round_worst = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            int[] reg = round_help.get(i);
            int worst = 4;
            for (int round: reg) {
                if (round < worst) {
                    worst = round;
                }
            }
            if (worst == 3 || worst == 2 || worst == 1) {
                third_round_worst.add (this_seed.get(i));
            }
            if (worst == 2 || worst == 1) {
                second_round_worst.add (this_seed.get(i));
            }
            if (worst == 1) {
                first_round_worst.add (this_seed.get(i));
            }
        }

        for (Team t: first_round_worst) {
            int index = this_seed.indexOf(t);
            int[] reg = round_help.get(index);
            if (!taken[0] && reg[0] != 1) {
                region1.add(t);
                taken[0] = true;
                this_seed.remove(t);
                second_round_worst.remove(t);
                third_round_worst.remove(t);
                round_help.remove(reg);
            }
            else if (!taken[1] && reg[1] != 1) {
                region2.add(t);
                taken[1] = true;
                this_seed.remove(t);
                second_round_worst.remove(t);
                third_round_worst.remove(t);
                round_help.remove(reg);
            }
            else if (!taken[2] && reg[2] != 1) {
                region3.add(t);
                taken[2] = true;
                this_seed.remove(t);
                second_round_worst.remove(t);
                third_round_worst.remove(t);
                round_help.remove(reg);
            }
            else if (!taken[3] && reg[3] != 1) {
                region4.add(t);
                taken[3] = true;
                this_seed.remove(t);
                second_round_worst.remove(t);
                third_round_worst.remove(t);
                round_help.remove(reg);
            }
        }
        for (Team t: second_round_worst) {
            int index = this_seed.indexOf(t);
            int[] reg = round_help.get(index);
            if (!taken[0] && reg[0] != 2) {
                region1.add(t);
                taken[0] = true;
                this_seed.remove(t);
                third_round_worst.remove(t);
                round_help.remove(reg);
            }
            else if (!taken[1] && reg[1] != 2) {
                region2.add(t);
                taken[1] = true;
                this_seed.remove(t);
                third_round_worst.remove(t);
                round_help.remove(reg);
            }
            else if (!taken[2] && reg[2] != 2) {
                region3.add(t);
                taken[2] = true;
                this_seed.remove(t);
                third_round_worst.remove(t);
                round_help.remove(reg);
            }
            else if (!taken[3] && reg[3] != 2) {
                region4.add(t);
                taken[3] = true;
                this_seed.remove(t);
                third_round_worst.remove(t);
                round_help.remove(reg);
            }
        }
        for (Team t: third_round_worst) {
            int index = this_seed.indexOf(t);
            int[] reg = round_help.get(index);
            if (!taken[0] && reg[0] != 3) {
                region1.add(t);
                taken[0] = true;
                this_seed.remove(t);
                round_help.remove(reg);
            }
            else if (!taken[1] && reg[1] != 3) {
                region2.add(t);
                taken[1] = true;
                this_seed.remove(t);
                round_help.remove(reg);
            }
            else if (!taken[2] && reg[2] != 3) {
                region3.add(t);
                taken[2] = true;
                this_seed.remove(t);
                round_help.remove(reg);
            }
            else if (!taken[3] && reg[3] != 3) {
                region4.add(t);
                taken[3] = true;
                this_seed.remove(t);
                round_help.remove(reg);
            }
        }
        for (Team t: this_seed) {
            if (!taken[0]) {
                region1.add(t);
                taken[0] = true;
            }
            else if (!taken[1]) {
                region2.add(t);
                taken[1] = true;
            }
            else if (!taken[2]) {
                region3.add(t);
                taken[2] = true;
            }
            else {
                region4.add(t);
                taken[3] = true;
            }
        }
    }

    public void playGame() throws IOException {
        Team[][] bracket = whichRegion();
        int currentGame;
        String name;
        Team one;
        Team two;
        int oneRank;
        int twoRank;
        String answer = "";
        if (Arrays.deepEquals(bracket, bracket1)) {
            currentGame = r1game;
            name = "Region 1";
            one = bracket[0][currentGame];
            two = bracket[1][currentGame];
        }
        else if (Arrays.deepEquals(bracket, bracket2)) {
            currentGame = r2game;
            name = "Region 2";
            one = bracket[0][currentGame];
            two = bracket[1][currentGame];
        }
        else if (Arrays.deepEquals(bracket, bracket3)) {
            currentGame = r3game;
            name = "Region 3";
            one = bracket[0][currentGame];
            two = bracket[1][currentGame];
        }
        else if (Arrays.deepEquals(bracket, bracket4)) {
            currentGame = r4game;
            name = "Region 4";
            one = bracket[0][currentGame];
            two = bracket[1][currentGame];
        }
        else {
            currentGame = gamesPlayed;
            name = "National";
            one = bracket[0][currentGame];
            two = bracket[1][currentGame];
        }
        oneRank = one.getSeed();
        twoRank = two.getSeed();
        Scanner keyboard = new Scanner(System.in);
        System.out.println(one.displayToString());
        System.out.println(two.displayToString());
        System.out.println();
        if (!name.equals("National")) {
            if (currentGame < 8) {
                System.out.println("-" + name + " Round of 64-");
            }
            else if (currentGame < 12) {
                System.out.println("-" + name + " Round of 32-");
            }
            else if (currentGame < 14) {
                System.out.println("-" + name + " Sweet 16-");
            }
            else {
                System.out.println("-" + name + " Elite 8-");
            }
        }
        else {
            if (currentGame == 60 || currentGame == 61) {
                System.out.println("-Final 4-");
            }
            else {
                System.out.println("-S" + Main.season + " National Championship-");
            }
        }
        System.out.println("(" + one.getWin() + "-" + one.getLoss() + ")" + oneRank + "." + one.getName()
                + " vs " + twoRank + "." + two.getName() + "(" + two.getWin() + "-" + two.getLoss() + ")");
        System.out.print("Start Game?(Simulate through with 'G') ");
        answer = keyboard.nextLine();
        boolean homeWin = false;
        boolean sameConf = one.getConference().equals(two.getConference());
        ArrayList<Player> oneRoster = new ArrayList<>(one.roster);
        int[] onePlayerPoints = new int[5];
        ArrayList<Player> twoRoster = new ArrayList<>(two.roster);
        int[] twoPlayerPoints = new int[5];
        ArrayList<Player> possession;
        ArrayList<Player> defense;
        int OTCount = 0;
        int onePoints = 0;
        int twoPoints = 0;
        int endGamePoss = 120;
        boolean skip = false;
        if (answer.equals("G")) {
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
            if (i > 89 && !skip) {
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
            }
            else {
                possession = twoRoster;
                defense = oneRoster;
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
            Player defender = defense.get(0);
            for (Player p : defense) {
                if (Objects.equals(p.getPosition(), playerWithBall.getPosition())) {
                    defender = p;
                }
            }
            int def_effect = playerWithBall.cur_rating - (int) (0.45 * defender.cur_rating) + 10;
            int oddsToMake = Math.max(35, Math.min(60, def_effect));
            int madeScore = (int) (Math.random() * 100);
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
                if (i > 89 && !skip) {
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

        System.out.println();
        if (onePoints > twoPoints) {
            one.setWin(one.getWin() + 1, false);
            two.setLoss(two.getLoss() + 1, false);
            if (currentGame == 62) {
                System.out.println(one.getName() + " is " + name + " champion!");
                champion = one;
            }
            else if (currentGame < 62) {
                decideWhereGo(one, bracket, currentGame);
            }
        }
        else {
            two.setWin(two.getWin() + 1, false);
            one.setLoss(one.getLoss() + 1, false);
            if (currentGame == 62) {
                System.out.println(two.getName() + " is " + name + " champion!");
                champion = two;
            }
            else if (currentGame < 62) {
                decideWhereGo(two, bracket, currentGame);
            }
        }
        if (Arrays.deepEquals(bracket, bracket1)) {
            r1game++;
            gamesPlayed++;
        }
        else if (Arrays.deepEquals(bracket, bracket2)) {
            r2game++;
            gamesPlayed++;
        }
        else if (Arrays.deepEquals(bracket, bracket3)) {
            r3game++;
            gamesPlayed++;
        }
        else if (Arrays.deepEquals(bracket, bracket4)) {
            r4game++;
            gamesPlayed++;
        }
        else {
            gamesPlayed++;
        }
        System.out.println();
        System.out.println(one.getName() + ": " + one.getWin() + "-" + one.getLoss());
        System.out.println(two.getName() + ": " + two.getWin() + "-" + two.getLoss());
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
        Main.toFileResults(one, two, onePoints, twoPoints, homeWin);
    }

    private Team[][] whichRegion() {
        if (gamesPlayed >= 60) {
            return fullBracket;
        }
        else if (r1game <= r2game && r1game <= r3game && r1game <= r4game) {
            return bracket1;
        }
        else if (r2game <= r3game && r2game <= r4game) {
            return bracket2;
        }
        else if (r3game <= r4game) {
            return bracket3;
        }
        return bracket4;
    }

    private void decideWhereGo(Team w, Team[][] bracket, int currentGame) {
        if (currentGame == 0) {
            bracket[0][8] = w;
        }
        else if (currentGame == 1) {
            bracket[1][8] = w;
        }
        else if (currentGame == 2) {
            bracket[1][9] = w;
        }
        else if (currentGame == 3) {
            bracket[0][9] = w;
        }
        else if (currentGame == 4) {
            bracket[0][10] = w;
        }
        else if (currentGame == 5) {
            bracket[1][10] = w;
        }
        else if (currentGame == 6) {
            bracket[1][11] = w;
        }
        else if (currentGame == 7) {
            bracket[0][11] = w;
        }
        else if (currentGame == 8) {
            bracket[0][12] = w;
        }
        else if (currentGame == 9) {
            bracket[1][12] = w;
        }
        else if (currentGame == 10) {
            bracket[1][13] = w;
        }
        else if (currentGame == 11) {
            bracket[0][13] = w;
        }
        else if (currentGame == 12) {
            bracket[0][14] = w;
        }
        else if (currentGame == 13) {
            bracket[1][14] = w;
        }
        else if (currentGame == 14) {
            if (region1.contains(w)) {
                fullBracket[0][60] = w;
            }
            else if (region2.contains(w)) {
                fullBracket[0][61] = w;
            }
            else if (region3.contains(w)) {
                fullBracket[1][61] = w;
            }
            else {
                fullBracket[1][60] = w;
            }
        }
        else if (currentGame == 60) {
            bracket[0][62] = w;
        }
        else if (currentGame == 61) {
            bracket[1][62] = w;
        }
        for (int a = 0; a < 15; a++) {
            for (int c = 0; c < 2; c++) {
                fullBracket[c][a] = bracket1[c][a];
            }
        }
        for (int a = 0; a < 15; a++) {
            for (int c = 0; c < 2; c++) {
                fullBracket[c][a + 15] = bracket2[c][a];
            }
        }
        for (int a = 0; a < 15; a++) {
            for (int c = 0; c < 2; c++) {
                fullBracket[c][a + 30] = bracket3[c][a];
            }
        }
        for (int a = 0; a < 15; a++) {
            for (int c = 0; c < 2; c++) {
                fullBracket[c][a + 45] = bracket4[c][a];
            }
        }
    }

    public Team getChampion() {
        return champion;
    }

    public void setChampion(Team t) {
        champion = t;
    }

    public void setBracket(Team[][] b) {
        fullBracket = b;
        bracket1 = new Team[2][15];
        bracket2 = new Team[2][15];
        bracket3 = new Team[2][15];
        bracket4 = new Team[2][15];
        region1 = new ArrayList<>();
        region2 = new ArrayList<>();
        region3 = new ArrayList<>();
        region4 = new ArrayList<>();
        field = new ArrayList<>();
        for (int a = 0; a < 15; a++) {
            for (int c = 0; c < 2; c++) {
                bracket1[c][a] = fullBracket[c][a];
            }
        }
        for (int a = 0; a < 64; a++) {
            field.add(null);
        }
        region1.add(bracket1[0][0]);
        region1.add(bracket1[0][7]);
        region1.add(bracket1[0][4]);
        region1.add(bracket1[0][3]);
        region1.add(bracket1[0][2]);
        region1.add(bracket1[0][5]);
        region1.add(bracket1[0][6]);
        region1.add(bracket1[0][1]);
        region1.add(bracket1[1][1]);
        region1.add(bracket1[1][6]);
        region1.add(bracket1[1][5]);
        region1.add(bracket1[1][2]);
        region1.add(bracket1[1][3]);
        region1.add(bracket1[1][4]);
        region1.add(bracket1[1][7]);
        region1.add(bracket1[1][0]);
        field.set(0,region1.get(0));
        field.set(7,region1.get(1));
        field.set(8,region1.get(2));
        field.set(15,region1.get(3));
        field.set(16,region1.get(4));
        field.set(23,region1.get(5));
        field.set(24,region1.get(6));
        field.set(31,region1.get(7));
        field.set(32,region1.get(8));
        field.set(39,region1.get(9));
        field.set(40,region1.get(10));
        field.set(47,region1.get(11));
        field.set(48,region1.get(12));
        field.set(55,region1.get(13));
        field.set(56,region1.get(14));
        field.set(63,region1.get(15));
        for (int a = 0; a < 15; a++) {
            for (int c = 0; c < 2; c++) {
                bracket2[c][a] = fullBracket[c][a + 15];
            }
        }
        int seed = 0;
        for (Team t : region1) {
            seed++;
            t.setSeed(seed);
        }
        region2.add(bracket2[0][0]);
        region2.add(bracket2[0][7]);
        region2.add(bracket2[0][4]);
        region2.add(bracket2[0][3]);
        region2.add(bracket2[0][2]);
        region2.add(bracket2[0][5]);
        region2.add(bracket2[0][6]);
        region2.add(bracket2[0][1]);
        region2.add(bracket2[1][1]);
        region2.add(bracket2[1][6]);
        region2.add(bracket2[1][5]);
        region2.add(bracket2[1][2]);
        region2.add(bracket2[1][3]);
        region2.add(bracket2[1][4]);
        region2.add(bracket2[1][7]);
        region2.add(bracket2[1][0]);
        field.set(1,region2.get(0));
        field.set(6,region2.get(1));
        field.set(9,region2.get(2));
        field.set(14,region2.get(3));
        field.set(17,region2.get(4));
        field.set(22,region2.get(5));
        field.set(25,region2.get(6));
        field.set(30,region2.get(7));
        field.set(33,region2.get(8));
        field.set(38,region2.get(9));
        field.set(41,region2.get(10));
        field.set(46,region2.get(11));
        field.set(49,region2.get(12));
        field.set(54,region2.get(13));
        field.set(57,region2.get(14));
        field.set(62,region2.get(15));
        for (int a = 0; a < 15; a++) {
            for (int c = 0; c < 2; c++) {
                bracket3[c][a] = fullBracket[c][a + 30];
            }
        }
        seed = 0;
        for (Team t : region2) {
            seed++;
            t.setSeed(seed);
        }
        region3.add(bracket3[0][0]);
        region3.add(bracket3[0][7]);
        region3.add(bracket3[0][4]);
        region3.add(bracket3[0][3]);
        region3.add(bracket3[0][2]);
        region3.add(bracket3[0][5]);
        region3.add(bracket3[0][6]);
        region3.add(bracket3[0][1]);
        region3.add(bracket3[1][1]);
        region3.add(bracket3[1][6]);
        region3.add(bracket3[1][5]);
        region3.add(bracket3[1][2]);
        region3.add(bracket3[1][3]);
        region3.add(bracket3[1][4]);
        region3.add(bracket3[1][7]);
        region3.add(bracket3[1][0]);
        field.set(2,region3.get(0));
        field.set(5,region3.get(1));
        field.set(10,region3.get(2));
        field.set(13,region3.get(3));
        field.set(18,region3.get(4));
        field.set(21,region3.get(5));
        field.set(26,region3.get(6));
        field.set(29,region3.get(7));
        field.set(34,region3.get(8));
        field.set(37,region3.get(9));
        field.set(42,region3.get(10));
        field.set(45,region3.get(11));
        field.set(50,region3.get(12));
        field.set(53,region3.get(13));
        field.set(58,region3.get(14));
        field.set(61,region3.get(15));
        for (int a = 0; a < 15; a++) {
            for (int c = 0; c < 2; c++) {
                bracket4[c][a] = fullBracket[c][a + 45];
            }
        }
        seed = 0;
        for (Team t : region3) {
            seed++;
            t.setSeed(seed);
        }
        region4.add(bracket4[0][0]);
        region4.add(bracket4[0][7]);
        region4.add(bracket4[0][4]);
        region4.add(bracket4[0][3]);
        region4.add(bracket4[0][2]);
        region4.add(bracket4[0][5]);
        region4.add(bracket4[0][6]);
        region4.add(bracket4[0][1]);
        region4.add(bracket4[1][1]);
        region4.add(bracket4[1][6]);
        region4.add(bracket4[1][5]);
        region4.add(bracket4[1][2]);
        region4.add(bracket4[1][3]);
        region4.add(bracket4[1][4]);
        region4.add(bracket4[1][7]);
        region4.add(bracket4[1][0]);
        field.set(3,region4.get(0));
        field.set(4,region4.get(1));
        field.set(11,region4.get(2));
        field.set(12,region4.get(3));
        field.set(19,region4.get(4));
        field.set(20,region4.get(5));
        field.set(27,region4.get(6));
        field.set(28,region4.get(7));
        field.set(35,region4.get(8));
        field.set(36,region4.get(9));
        field.set(43,region4.get(10));
        field.set(44,region4.get(11));
        field.set(51,region4.get(12));
        field.set(52,region4.get(13));
        field.set(59,region4.get(14));
        field.set(60,region4.get(15));
        seed = 0;
        for (Team t : region4) {
            seed++;
            t.setSeed(seed);
        }
    }

    public int getGamesPlayed() {
        return gamesPlayed;
    }

    public int getR1game() {
        return r1game;
    }

    public int getR2game() {
        return r2game;
    }

    public int getR3game() {
        return r3game;
    }

    public int getR4game() {
        return r4game;
    }

    public void setAllGamesPlayed(int gp, int r1, int r2, int r3, int r4) {
        gamesPlayed = gp;
        r1game = r1;
        r2game = r2;
        r3game = r3;
        r4game = r4;
    }

    public Team[][] getBracket() {
        return fullBracket;
    }

    private void presentBracket() {
        Scanner keyboard = new Scanner(System.in);
        ArrayList<ArrayList<Team>> regions = new ArrayList<>();
        regions.add(region1);
        regions.add(region2);
        regions.add(region3);
        regions.add(region4);
        System.out.println("Press enter to reveal each");
        int reg = 1;
        for (ArrayList<Team> r : regions) {
            System.out.print("Region " + reg + ":");
            reg++;
            keyboard.nextLine();
            System.out.print("1." + r.get(0).getName() + " vs " + "16." + r.get(15).getName());
            keyboard.nextLine();
            System.out.print("8." + r.get(7).getName() + " vs " + "9." + r.get(8).getName());
            keyboard.nextLine();
            System.out.print("5." + r.get(4).getName() + " vs " + "12." + r.get(11).getName());
            keyboard.nextLine();
            System.out.print("4." + r.get(3).getName() + " vs " + "13." + r.get(12).getName());
            keyboard.nextLine();
            System.out.print("3." + r.get(2).getName() + " vs " + "14." + r.get(13).getName());
            keyboard.nextLine();
            System.out.print("6." + r.get(5).getName() + " vs " + "11." + r.get(10).getName());
            keyboard.nextLine();
            System.out.print("7." + r.get(6).getName() + " vs " + "10." + r.get(9).getName());
            keyboard.nextLine();
            System.out.print("2." + r.get(1).getName() + " vs " + "15." + r.get(14).getName());
            keyboard.nextLine();
        }
    }
}
