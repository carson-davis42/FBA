package fbajc;
import java.io.IOException;
import java.util.*;

public class PreSeasonTourny implements Comparable<PreSeasonTourny> {
    private Team[][] bracket;
    private String name;
    private int currentGame;
    private Team champion;

    public PreSeasonTourny(List<Team> teams, String n) {
        name = n;
        currentGame = 0;
        champion = null;
        bracket = new Team[2][12];
        int rand = (int) (Math.random() * teams.size());
        bracket[0][0] = teams.remove(rand);
        rand = (int) (Math.random() * teams.size());
        bracket[1][0] = teams.remove(rand);
        rand = (int) (Math.random() * teams.size());
        bracket[0][1] = teams.remove(rand);
        rand = (int) (Math.random() * teams.size());
        bracket[1][1] = teams.remove(rand);
        rand = (int) (Math.random() * teams.size());
        bracket[0][2] = teams.remove(rand);
        rand = (int) (Math.random() * teams.size());
        bracket[1][2] = teams.remove(rand);
        rand = (int) (Math.random() * teams.size());
        bracket[0][3] = teams.remove(rand);
        rand = (int) (Math.random() * teams.size());
        bracket[1][3] = teams.remove(rand);
    }

    public PreSeasonTourny(String n) {
        name = n;
        currentGame = 0;
        champion = null;
        bracket = new Team[2][12];
    }

    public String getName() {
        return name;
    }

    public int getCurrentGame() {
        return currentGame;
    }

    public void setCurrentGame(int cg) {
        currentGame = cg;
    }

    public Team[][] getBracket() {
        return bracket;
    }

    public void setBracket(Team[][] b) {
        bracket = b;
    }

    public void setChampion(Team c) {
        champion = c;
    }

    public Team getChampion() {
        return champion;
    }

    public void playGame() throws IOException {
        Scanner keyboard = new Scanner(System.in);
        Team a = bracket[0][currentGame];
        Team b = bracket[1][currentGame];
        String answer = "";
        if (!Main.simulatePreST) {
            System.out.println(a.displayToString());
            System.out.println(b.displayToString());
            System.out.println();
            if (currentGame == 11) {
                System.out.println("-" + name + " Championship-");
            }
            else if (currentGame == 10) {
                System.out.println("-" + name + " 3rd Place Game-");
            }
            else if (currentGame == 9) {
                System.out.println("-" + name + " 5th Place Game-");
            }
            else if (currentGame == 8) {
                System.out.println("-" + name + " 7th Place Game-");
            }
            else if (currentGame == 6 || currentGame == 7) {
                System.out.println("-" + name + " Semi-Finals-");
            }
            else if (currentGame == 4 || currentGame == 5) {
                System.out.println("-" + name + " Loser's Bracket-");
            }
            else {
                System.out.println("-" + name + "-");
            }
            System.out.print("(" + a.getWin() + "-" + a.getLoss() + ")");
            if (Main.inRanks.contains(a)) {
                System.out.print((Main.inRanks.indexOf(a) + 1) + ".");
            }
            System.out.print(a.getName() + " vs ");
            if (Main.inRanks.contains(b)) {
                System.out.print((Main.inRanks.indexOf(b) + 1) + ".");
            }
            System.out.println(b.getName() + "(" + b.getWin() + "-" + b.getLoss() + ")");
            System.out.print("Start Game?(Simulate through with 'G') ");
            answer = keyboard.nextLine();
        }
        boolean sameConf = a.getConference().equals(b.getConference());
        boolean hw;
        ArrayList<Player> oneRoster = new ArrayList<>(a.roster);
        int[] onePlayerPoints = new int[5];
        ArrayList<Player> twoRoster = new ArrayList<>(b.roster);
        int[] twoPlayerPoints = new int[5];
        ArrayList<Player> possession;
        ArrayList<Player> defense;
        int OTCount = 0;
        int onePoints = 0;
        int twoPoints = 0;
        int endGamePoss = 120;
        boolean skip = false;
        if (answer.equals("G") || Main.simulatePreST) {
            skip = true;
        }
        boolean score = false;
        //Runs through a game
        for (int i = 0; i < endGamePoss; i++) {
            if (i == 30 && !skip) {
                System.out.print("10 minutes left in 1st half: " + a.getName() + ": " + onePoints + ", " + b.getName() + ": " + twoPoints);
                keyboard.nextLine();
            }
            else if (i == 60 && !skip) {
                System.out.print("Halftime: " + a.getName() + ": " + onePoints + ", " + b.getName() + ": " + twoPoints);
                keyboard.nextLine();
            }
            else if (i == 90 && !skip) {
                System.out.print("10 minutes left in 2nd half: " + a.getName() + ": " + onePoints + ", " + b.getName() + ": " + twoPoints);
                keyboard.nextLine();
            }
            else if (i == 120 && !skip) {
                System.out.print("End of the Regulation: " + a.getName() + ": " + onePoints + ", " + b.getName() + ": " + twoPoints);
                keyboard.nextLine();
            }
            else if (i%10 == 0 && i > 120 && !skip) {
                System.out.print("End of " + (OTCount - 1) + "OT: " + a.getName() + ": " + onePoints + ", " + b.getName() + ": " + twoPoints);
                keyboard.nextLine();
            }
            if (i > 109 && Math.abs(onePoints - twoPoints) <= (((endGamePoss-i+1)/2) * 3) && !skip) {
                System.out.print(endGamePoss-i + " Possessions left: " + a.getName() + ": " + onePoints + ", " + b.getName() + ": " + twoPoints + ", ");
                if (i%2 == 0) {
                    System.out.print(a.getAbreviation() + " Possession");
                }
                else {
                    System.out.print(b.getAbreviation() + " Possession");
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
                if (i > 109 && Math.abs(onePoints - twoPoints) <= (((endGamePoss-i+1)/2) * 3) && !skip) {
                    Team t = a;
                    if (i % 2 == 1) {
                        t = b;
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
        if (!Main.simulatePreST) {
            System.out.println();
            System.out.println(a.getName() + ": ");
        }
        for (int i = 0; i < 5; i++) {
            Player p = oneRoster.get(i);
            if (!Main.simulatePreST) {
                System.out.println("(" + p.getPosition() + ")" + p.getName() + ": " + onePlayerPoints[i]);
            }
            oneRoster.get(i).addPoints(onePlayerPoints[i]);
        }
        if (!Main.simulatePreST) {
            System.out.println();
            System.out.println(b.getName() + ": ");
        }
        for (int i = 0; i < 5; i++) {
            Player p = twoRoster.get(i);
            if (!Main.simulatePreST) {
                System.out.println("(" + p.getPosition() + ")" + p.getName() + ": " + twoPlayerPoints[i]);
            }
            twoRoster.get(i).addPoints(twoPlayerPoints[i]);
        }

        if (!Main.simulatePreST) {
            System.out.println();
        }
        if (onePoints > twoPoints) {
            a.setWin(a.getWin() + 1, sameConf);
            b.setLoss(b.getLoss() + 1, sameConf);
            Main.updateNames = false;
            Main.updatePlayerRatings(a, true);
            Main.updatePlayerRatings(b, false);
            if (currentGame == 11) {
                if (!Main.simulatePreST) {
                    System.out.println(a.getName() + " is " + name + " champion!");
                }
                champion = a;
            }
            else if (currentGame < 8) {
                decideWhereGo(a, b);
            }
            hw = true;
        }
        else {
            b.setWin(b.getWin() + 1, sameConf);
            a.setLoss(a.getLoss() + 1, sameConf);
            Main.updateNames = false;
            Main.updatePlayerRatings(b, true);
            Main.updatePlayerRatings(a, false);
            if (currentGame == 11) {
                if (!Main.simulatePreST) {
                    System.out.println(b.getName() + " is " + name + " champion!");
                }
                champion = b;
            }
            else if (currentGame < 8) {
                decideWhereGo(b, a);
            }
            hw = false;
        }

        if (!Main.simulatePreST) {
            System.out.println();
            System.out.print("Final Score: " + a.getName() + ": " + onePoints + ", " + b.getName() + ": " + twoPoints);
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
            System.out.println(a.getName() + ": " + a.getWin() + "-" + a.getLoss());
            System.out.println(b.getName() + ": " + b.getWin() + "-" + b.getLoss());
            System.out.println();
        }
        Main.toFileResults(a, b, onePoints, twoPoints, hw);
        currentGame++;
        Main.gamesPlayed++;
    }

    private void decideWhereGo(Team w, Team l) {
        if (currentGame == 0) {
            bracket[0][6] = w;
            bracket[0][4] = l;
        }
        else if (currentGame == 1) {
            bracket[1][6] = w;
            bracket[1][4] = l;
        }
        else if (currentGame == 2) {
            bracket[0][7] = w;
            bracket[0][5] = l;
        }
        else if (currentGame == 3) {
            bracket[1][7] = w;
            bracket[1][5] = l;
        }
        else if (currentGame == 4) {
            bracket[0][9] = w;
            bracket[0][8] = l;
        }
        else if (currentGame == 5) {
            bracket[1][9] = w;
            bracket[1][8] = l;
        }
        else if (currentGame == 6) {
            bracket[0][11] = w;
            bracket[0][10] = l;
        }
        else if (currentGame == 7) {
            bracket[1][11] = w;
            bracket[1][10] = l;
        }
    }

    public void playFakeGame() throws IOException {
        Team a = bracket[0][currentGame];
        Team b = bracket[1][currentGame];
        int rand = (int) (Math.random() * 2);
        boolean hw;
        if (rand == 0) {
            a.setWin(a.getWin() + 1, false);
            b.setLoss(b.getLoss() + 1, false);
            if (currentGame < 8) {
                decideWhereGo(a, b);
            }
            else if (currentGame == 11) {
                champion = a;
            }
            hw = true;
        }
        else {
            b.setWin(b.getWin() + 1, false);
            a.setLoss(a.getLoss() + 1, false);
            if (currentGame < 8) {
                decideWhereGo(b, a);
            }
            else if (currentGame == 11) {
                champion = b;
            }
            hw = false;
        }
//        Main.toFileResults(a, b, hw);
        currentGame++;
        Main.gamesPlayed++;
    }

    @Override
    public int compareTo(PreSeasonTourny o) {
        return currentGame - o.currentGame;
    }
}
