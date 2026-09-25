package fbajc;

import java.io.*;
import java.util.*;

public class NIT {
    private static final String STORAGE_FILE = "FBAJC/NITStorage.txt";
    private static final String DISPLAY_FILE = "FBAJC/NIT.txt";

    private Team[][] bracket;
    private ArrayList<Team> field;
    private int gamesPlayed;
    private Team champion;

    /**
     * Creates a brand new NIT from the 32-team NIT field.
     */
    public NIT(ArrayList<Team> nitField) throws IOException {
        field = new ArrayList<>(nitField);
        bracket = new Team[2][31];
        gamesPlayed = 0;
        champion = null;

        makeBracket();
        toFileNIT();
    }

    /**
     * Reads an already-started NIT from storage.
     * Main should call this with its private teamNames map:
     *     theNIT = new NIT(teamNames);
     */
    public NIT(Map<String, Team> teamNames) throws IOException {
        field = new ArrayList<>();
        bracket = new Team[2][31];
        gamesPlayed = 0;
        champion = null;

        readNIT(teamNames);
        setSeedsFromSavedBracket();
        toFileNIT();
    }

    private void makeBracket() {
        // 32-team bracket, 31 games total.
        // Two regions of 16 teams each.
        // Region 1 gets field indexes 0, 2, 4, ..., 30.
        // Region 2 gets field indexes 1, 3, 5, ..., 31.

        if (field.size() < 32) {
            throw new IllegalArgumentException("NIT field must contain 32 teams.");
        }

        int[] seedOrder = {
                0, 15, 8, 7, 4, 11, 12, 3,
                1, 14, 9, 6, 5, 10, 13, 2
        };

        ArrayList<Team> region1 = new ArrayList<>();
        ArrayList<Team> region2 = new ArrayList<>();

        for (int i = 0; i < 16; i++) {
            Team r1Team = field.get(i * 2);
            Team r2Team = field.get(i * 2 + 1);

            r1Team.setSeed(i + 1);
            r2Team.setSeed(i + 1);

            region1.add(r1Team);
            region2.add(r2Team);
        }

        // Region 1 games: bracket games 0-7
        for (int i = 0; i < 8; i++) {
            bracket[0][i] = region1.get(seedOrder[i * 2]);
            bracket[1][i] = region1.get(seedOrder[i * 2 + 1]);
        }

        // Region 2 games: bracket games 8-15
        for (int i = 0; i < 8; i++) {
            bracket[0][i + 8] = region2.get(seedOrder[i * 2]);
            bracket[1][i + 8] = region2.get(seedOrder[i * 2 + 1]);
        }
    }

    private void readNIT(Map<String, Team> teamNames) throws IOException {
        Scanner input = new Scanner(new File(STORAGE_FILE));

        String header = input.nextLine();
        Object[] headerData = header.split("/");

        if (headerData.length < 3 || !headerData[0].equals("NIT")) {
            input.close();
            throw new IllegalArgumentException("Invalid NIT storage file.");
        }

        gamesPlayed = Integer.parseInt((String) headerData[1]);

        String championName = (String) headerData[2];
        if (!championName.equals("--")) {
            champion = teamNames.get(championName);
        }

        for (int i = 0; i < 31; i++) {
            if (!input.hasNextLine()) {
                input.close();
                throw new IllegalArgumentException("NIT storage file ended too early.");
            }

            String topName = input.nextLine();
            String bottomName = input.nextLine();

            if (!topName.equals("--")) {
                bracket[0][i] = teamNames.get(topName);
            }

            if (!bottomName.equals("--")) {
                bracket[1][i] = teamNames.get(bottomName);
            }
        }

        input.close();
    }

    /**
     * Rebuilds NIT seeds after reading from disk.
     * First-round games 0-7 are Region 1, games 8-15 are Region 2.
     * Each region has seeds 1-16.
     */
    private void setSeedsFromSavedBracket() {
        int[] topSeeds = {
                1, 8, 5, 4, 3, 6, 7, 2,
                1, 8, 5, 4, 3, 6, 7, 2
        };

        int[] bottomSeeds = {
                16, 9, 12, 13, 14, 11, 10, 15,
                16, 9, 12, 13, 14, 11, 10, 15
        };

        for (int i = 0; i < 16; i++) {
            if (bracket[0][i] != null) {
                bracket[0][i].setSeed(topSeeds[i]);
            }

            if (bracket[1][i] != null) {
                bracket[1][i].setSeed(bottomSeeds[i]);
            }
        }
    }

    public void playGame() throws IOException {
        if (champion != null) {
            System.out.println(champion.getName() + " has already won the S" + Main.season + " NIT.");
            return;
        }

        if (gamesPlayed >= 31) {
            throw new IllegalStateException("NIT gamesPlayed is already 31, but champion is null.");
        }

        Team one = bracket[0][gamesPlayed];
        Team two = bracket[1][gamesPlayed];

        if (one == null || two == null) {
            throw new IllegalStateException("NIT game " + (gamesPlayed + 1) + " is missing a team.");
        }

        Scanner keyboard = new Scanner(System.in);

        System.out.println(one.displayToString());
        System.out.println(two.displayToString());
        System.out.println();

        printRoundTitle();

        System.out.println("(" + one.getWin() + "-" + one.getLoss() + ")"
                + one.getSeed() + "." + one.getName()
                + " vs " + two.getSeed() + "." + two.getName()
                + "(" + two.getWin() + "-" + two.getLoss() + ")");

        System.out.print("Start NIT Game?(Simulate through with 'G') ");
        String answer = keyboard.nextLine();

        boolean skip = answer.equalsIgnoreCase("G");

        ArrayList<Player> oneRoster = new ArrayList<>(one.roster);
        ArrayList<Player> twoRoster = new ArrayList<>(two.roster);

        int[] onePlayerPoints = new int[5];
        int[] twoPlayerPoints = new int[5];

        int onePoints = 0;
        int twoPoints = 0;
        int endGamePoss = 120;
        int OTCount = 0;

        for (int i = 0; i < endGamePoss; i++) {
            if (i == 30 && !skip) {
                System.out.print("10 minutes left in 1st half: "
                        + one.getName() + ": " + onePoints + ", "
                        + two.getName() + ": " + twoPoints);
                keyboard.nextLine();
            }
            else if (i == 60 && !skip) {
                System.out.print("Halftime: "
                        + one.getName() + ": " + onePoints + ", "
                        + two.getName() + ": " + twoPoints);
                keyboard.nextLine();
            }
            else if (i == 90 && !skip) {
                System.out.print("10 minutes left in 2nd half: "
                        + one.getName() + ": " + onePoints + ", "
                        + two.getName() + ": " + twoPoints);
                keyboard.nextLine();
            }

            ArrayList<Player> possession;
            Team pos;
            Team def;

            if (i % 2 == 0) {
                possession = oneRoster;
                pos = one;
                def = two;
            } else {
                possession = twoRoster;
                pos = two;
                def = one;
            }

            int getBallTo = 0;
            for (Player p : possession) {
                getBallTo += p.cur_rating;
            }

            getBallTo -= 200;

            int whoGetsBall = (int) (Math.random() * getBallTo) + 1;
            int totalRating = 0;
            Player playerWithBall = possession.get(0);

            for (Player p : possession) {
                totalRating += (p.cur_rating - 40);

                if (totalRating >= whoGetsBall) {
                    playerWithBall = p;
                    break;
                }
            }

            Player defender = def.pickDefender(pos, possession.indexOf(playerWithBall));

            int defEffect = playerWithBall.cur_rating - (int) (0.45 * defender.cur_rating) + 10;
            int oddsToMake = Math.max(35, Math.min(65, defEffect));
            int madeScore = (int) (Math.random() * 100);

            int pointsScored = 0;

            if (oddsToMake >= madeScore) {
                madeScore = Math.abs(madeScore - oddsToMake);

                if (madeScore >= 30) {
                    pointsScored = 3;
                } else {
                    pointsScored = 2;
                }
            }

            if (i % 2 == 0) {
                onePoints += pointsScored;
                onePlayerPoints[oneRoster.indexOf(playerWithBall)] += pointsScored;
            } else {
                twoPoints += pointsScored;
                twoPlayerPoints[twoRoster.indexOf(playerWithBall)] += pointsScored;
            }

            if (i % 10 == 9 && onePoints == twoPoints && i >= 119) {
                endGamePoss += 10;
                OTCount++;
            }
        }

        printBoxScore(one, two, oneRoster, twoRoster, onePlayerPoints, twoPlayerPoints);

        Team winner;
        Team loser;

        if (onePoints > twoPoints) {
            winner = one;
            loser = two;
            one.setWin(one.getWin() + 1, false);
            two.setLoss(two.getLoss() + 1, false);
        } else {
            winner = two;
            loser = one;
            two.setWin(two.getWin() + 1, false);
            one.setLoss(one.getLoss() + 1, false);
        }

        advanceWinner(winner);

        gamesPlayed++;

        System.out.println();
        System.out.print("Final Score: " + one.getName() + ": " + onePoints
                + ", " + two.getName() + ": " + twoPoints);

        if (OTCount > 0) {
            if (OTCount > 1) {
                System.out.println("(" + OTCount + "OT)");
            } else {
                System.out.println("(OT)");
            }
        } else {
            System.out.println();
        }

        System.out.println();
        System.out.println(winner.getName() + " advances.");
        System.out.println(loser.getName() + " is eliminated.");
        System.out.println();

        Main.toFileResults(one, two, onePoints, twoPoints, onePoints > twoPoints);

        toFileNIT();
    }

    private void advanceWinner(Team winner) {
        if (gamesPlayed < 16) {
            // Round of 32 winners go to games 16-23
            int nextGame = 16 + (gamesPlayed / 2);

            if (gamesPlayed % 2 == 0) {
                bracket[0][nextGame] = winner;
            } else {
                bracket[1][nextGame] = winner;
            }
        }
        else if (gamesPlayed < 24) {
            // Sweet 16 winners go to games 24-27
            int nextGame = 24 + ((gamesPlayed - 16) / 2);

            if ((gamesPlayed - 16) % 2 == 0) {
                bracket[0][nextGame] = winner;
            } else {
                bracket[1][nextGame] = winner;
            }
        }
        else if (gamesPlayed < 28) {
            // Elite 8 winners go to games 28-29
            int nextGame = 28 + ((gamesPlayed - 24) / 2);

            if ((gamesPlayed - 24) % 2 == 0) {
                bracket[0][nextGame] = winner;
            } else {
                bracket[1][nextGame] = winner;
            }
        }
        else if (gamesPlayed < 30) {
            // Final 4 winners go to championship
            if (gamesPlayed == 28) {
                bracket[0][30] = winner;
            } else {
                bracket[1][30] = winner;
            }
        }
        else {
            champion = winner;
            System.out.println(winner.getName() + " is the S" + Main.season + " NIT Champion!");
        }
    }

    private void printRoundTitle() {
        if (gamesPlayed < 16) {
            System.out.println("-NIT Round of 32-");
        }
        else if (gamesPlayed < 24) {
            System.out.println("-NIT Sweet 16-");
        }
        else if (gamesPlayed < 28) {
            System.out.println("-NIT Elite 8-");
        }
        else if (gamesPlayed < 30) {
            System.out.println("-NIT Final 4-");
        }
        else {
            System.out.println("-S" + Main.season + " NIT Championship-");
        }
    }

    private void printBoxScore(Team one, Team two,
                               ArrayList<Player> oneRoster,
                               ArrayList<Player> twoRoster,
                               int[] onePlayerPoints,
                               int[] twoPlayerPoints) {
        System.out.println();
        System.out.println(one.getName() + ": ");

        for (int i = 0; i < 5; i++) {
            Player p = oneRoster.get(i);
            System.out.println("(" + p.getPosition() + ")" + p.getName() + ": " + onePlayerPoints[i]);
            p.addPoints(onePlayerPoints[i]);
        }

        System.out.println();
        System.out.println(two.getName() + ": ");

        for (int i = 0; i < 5; i++) {
            Player p = twoRoster.get(i);
            System.out.println("(" + p.getPosition() + ")" + p.getName() + ": " + twoPlayerPoints[i]);
            p.addPoints(twoPlayerPoints[i]);
        }
    }

    public void toFileNIT() throws IOException {
        toFileNITStorage();
        toFileNITDisplay();
    }

    private void toFileNITStorage() throws IOException {
        StringBuilder sb = new StringBuilder();

        sb.append("NIT/")
                .append(gamesPlayed)
                .append("/")
                .append(champion == null ? "--" : champion.getName())
                .append("\n");

        for (int i = 0; i < 31; i++) {
            if (bracket[0][i] == null) {
                sb.append("--\n");
            } else {
                sb.append(bracket[0][i].getName()).append("\n");
            }

            if (bracket[1][i] == null) {
                sb.append("--\n");
            } else {
                sb.append(bracket[1][i].getName()).append("\n");
            }
        }

        File file = new File(STORAGE_FILE);
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    private void toFileNITDisplay() throws IOException {
        StringBuilder sb = new StringBuilder();

        sb.append("                                              --S")
                .append(Main.season).append(" NIT--\n");

        // Region 1: bracket games 0-7 (round of 32), 16-19 (sweet 16), 24-25 (elite 8), 28 (final 4)
        sb.append("--Region 1--\n").append("   -Round of 32-\n");
        for (int a = 0; a < 8; a++) {
            appendMatchup(sb, bracket[0][a], bracket[1][a]);
        }

        sb.append("   -Sweet 16-\n");
        for (int a = 16; a < 20; a++) {
            appendMatchup(sb, bracket[0][a], bracket[1][a]);
        }

        sb.append("   -Elite 8-\n");
        for (int a = 24; a < 26; a++) {
            appendMatchup(sb, bracket[0][a], bracket[1][a]);
        }

        sb.append("   -Final 4-\n");
        appendMatchup(sb, bracket[0][28], bracket[1][28]);

        // Region 2: bracket games 8-15 (round of 32), 20-23 (sweet 16), 26-27 (elite 8), 29 (final 4)
        sb.append("\n\n--Region 2--\n").append("   -Round of 32-\n");
        for (int a = 8; a < 16; a++) {
            appendMatchup(sb, bracket[0][a], bracket[1][a]);
        }

        sb.append("   -Sweet 16-\n");
        for (int a = 20; a < 24; a++) {
            appendMatchup(sb, bracket[0][a], bracket[1][a]);
        }

        sb.append("   -Elite 8-\n");
        for (int a = 26; a < 28; a++) {
            appendMatchup(sb, bracket[0][a], bracket[1][a]);
        }

        sb.append("   -Final 4-\n");
        appendMatchup(sb, bracket[0][29], bracket[1][29]);

        sb.append("\n\n   --NIT Championship--\n");
        appendMatchup(sb, bracket[0][30], bracket[1][30]);

        sb.append("   --Champions--\n");
        if (champion != null) {
            sb.append(champion.getName());
        } else {
            sb.append("TBD");
        }
        sb.append("\n\n\n");

        File file = new File(DISPLAY_FILE);
        FileWriter fw = new FileWriter(file);
        fw.write(sb.toString());
        fw.close();
    }

    private void appendMatchup(StringBuilder sb, Team top, Team bottom) {
        if (top != null) {
            sb.append("(").append(top.getSeed()).append(")").append(top.getName());
        } else {
            sb.append("TBD");
        }
        sb.append(" vs ");
        if (bottom != null) {
            sb.append("(").append(bottom.getSeed()).append(")").append(bottom.getName());
        } else {
            sb.append("TBD");
        }
        sb.append("\n");
    }

    private void appendRound(StringBuilder sb, String roundName, int start, int end) {
        sb.append("--").append(roundName).append("--\n");

        for (int i = start; i < end; i++) {
            Team one = bracket[0][i];
            Team two = bracket[1][i];

            sb.append("Game ").append(i + 1).append(": ");

            appendTeamWithSeed(sb, one);

            sb.append(" vs ");

            appendTeamWithSeed(sb, two);

            if (i < gamesPlayed) {
                sb.append("  [FINAL]");
            }

            sb.append("\n");
        }

        sb.append("\n");
    }

    private void appendTeamWithSeed(StringBuilder sb, Team team) {
        if (team == null) {
            sb.append("TBD");
        } else {
            if (team.getSeed() > 0) {
                sb.append(team.getSeed()).append(".");
            }
            sb.append(team.getName());
        }
    }

    public boolean isOver() {
        return champion != null;
    }

    public Team getChampion() {
        return champion;
    }

    public int getGamesPlayed() {
        return gamesPlayed;
    }

    public Team[][] getBracket() {
        return bracket;
    }

    public void setGamesPlayed(int gp) {
        gamesPlayed = gp;
    }

    public void setChampion(Team champ) {
        champion = champ;
    }

    public void setBracket(Team[][] b) {
        bracket = b;
        setSeedsFromSavedBracket();
    }
}
