package fbajc;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Scanner;

public class PostSeasonTourny implements Comparable<PostSeasonTourny>{
    private Team[][] bracket;
    private String name;
    private int currentGame;
    private Team champion;

    public PostSeasonTourny(List<Team> teams, String n) {
        name = n;
        currentGame = 0;
        champion = null;
        bracket = new Team[2][11];
        bracket[0][4] = teams.get(0);
        bracket[0][7] = teams.get(1);
        bracket[0][6] = teams.get(2);
        bracket[0][5] = teams.get(3);
        bracket[0][1] = teams.get(4);
        bracket[0][2] = teams.get(5);
        bracket[0][3] = teams.get(6);
        bracket[0][0] = teams.get(7);
        bracket[1][0] = teams.get(8);
        bracket[1][3] = teams.get(9);
        bracket[1][2] = teams.get(10);
        bracket[1][1] = teams.get(11);
    }

    public PostSeasonTourny(String n) {
        name = n;
        currentGame = 0;
        bracket = new Team[2][11];
    }

    public Team getChampion() {
        return champion;
    }

    public void setChampion(Team t) {
        champion = t;
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

    public void playGame() throws IOException {
        Scanner keyboard = new Scanner(System.in);
        Team one = bracket[0][currentGame];
        Team two = bracket[1][currentGame];
        String answer = "";
        if (!Main.simulateConfT) {
            System.out.println(one.displayToString());
            System.out.println(two.displayToString());
            System.out.println();
            if (currentGame == 10) {
                System.out.println("-" + name + " Championship-");
            }
            else if (currentGame == 9 || currentGame == 8) {
                System.out.println("-" + name + " Semi-Finals-");
            }
            else if (currentGame <= 7 && currentGame >= 4) {
                System.out.println("-" + name + " Quarter-Finals-");
            }
            else {
                System.out.println("-" + name + " First Round-");
            }
            System.out.println("(" + one.getWin() + "-" + one.getLoss() + ")" + one.getName()
                    + " vs " + two.getName() + "(" + two.getWin() + "-" + two.getLoss() + ")");
            System.out.print("Start Game?(Simulate through with 'G') ");
            answer = keyboard.nextLine();
        }
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
        if (answer.equals("G") || Main.simulateConfT) {
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
            if (i > 109 && Math.abs(onePoints - twoPoints) <= (((endGamePoss-i+1)/2) * 3) && !skip) {
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
                if (madeScore >= 30) {
                    pointsScored = 3;
                }
                else {
                    pointsScored = 2;
                }
                if (i > 109 && Math.abs(onePoints - twoPoints) <= (((endGamePoss-i+1)/2) * 3) && !skip) {
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
        if (!Main.simulateConfT) {
            System.out.println();
            System.out.println(one.getName() + ": ");
        }
        for (int i = 0; i < 5; i++) {
            Player p = oneRoster.get(i);
            if (!Main.simulateConfT) {
                System.out.println("(" + p.getPosition() + ")" + p.getName() + ": " + onePlayerPoints[i]);
            }
            oneRoster.get(i).addPoints(onePlayerPoints[i]);
        }
        if (!Main.simulateConfT) {
            System.out.println();
            System.out.println(two.getName() + ": ");
        }
        for (int i = 0; i < 5; i++) {
            Player p = twoRoster.get(i);
            if (!Main.simulateConfT) {
                System.out.println("(" + p.getPosition() + ")" + p.getName() + ": " + twoPlayerPoints[i]);
            }
            twoRoster.get(i).addPoints(twoPlayerPoints[i]);
        }

        if (!Main.simulateConfT) {
            System.out.println();
        }
        if (onePoints > twoPoints) {
            one.setWin(one.getWin() + 1, false);
            two.setLoss(two.getLoss() + 1, false);
            Main.updateNames = false;
            Main.updatePlayerRatings(one, true);
            Main.updatePlayerRatings(two, false);
            if (currentGame == 10) {
                if (!Main.simulateConfT) {
                    System.out.println(one.getName() + " is " + name + " champion!");
                }
                champion = one;
            }
            else if (currentGame < 10) {
                decideWhereGo(one);
            }
            homeWin = true;
        }
        else {
            two.setWin(two.getWin() + 1, false);
            one.setLoss(one.getLoss() + 1, false);
            Main.updateNames = false;
            Main.updatePlayerRatings(two, true);
            Main.updatePlayerRatings(one, false);
            if (currentGame == 10) {
                if (!Main.simulateConfT) {
                    System.out.println(two.getName() + " is " + name + " champion!");
                }
                champion = two;
            }
            else if (currentGame < 10) {
                decideWhereGo(two);
            }
            homeWin = false;
        }
        if (!Main.simulateConfT) {
            System.out.println();
            int one_seed = one.getConf().indexOf(one);
            int two_seed = two.getConf().indexOf(two);
            if (one.getConfSeed() != 0) {
                one_seed = one.getConfSeed();
            }
            if (two.getConfSeed() != 0) {
                two_seed = two.getConfSeed();
            }
            System.out.print("Final Score: " + one_seed + "." + one.getName() + ": " + onePoints + ", " + two_seed + "." + two.getName() + ": " + twoPoints);
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
        }

        Main.toFileResults(one, two, onePoints, twoPoints, homeWin);
        currentGame++;
    }

    private void decideWhereGo(Team w) {
        if (currentGame == 0) {
            bracket[1][4] = w;
        }
        else if (currentGame == 1) {
            bracket[1][5] = w;
        }
        else if (currentGame == 2) {
            bracket[1][6] = w;
        }
        else if (currentGame == 3) {
            bracket[1][7] = w;
        }
        else if (currentGame == 4) {
            bracket[0][8] = w;
        }
        else if (currentGame == 5) {
            bracket[1][8] = w;
        }
        else if (currentGame == 6) {
            bracket[1][9] = w;
        }
        else if (currentGame == 7) {
            bracket[0][9] = w;
        }
        else if (currentGame == 8) {
            bracket[0][10] = w;
        }
        else if (currentGame == 9) {
            bracket[1][10] = w;
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
            if (currentGame < 10) {
                decideWhereGo(a);
            }
            else {
                champion = a;
            }
            hw = true;
        }
        else {
            b.setWin(b.getWin() + 1, false);
            a.setLoss(a.getLoss() + 1, false);
            if (currentGame < 10) {
                decideWhereGo(b);
            }
            else {
                champion = b;
            }
            hw = false;
        }
//        Main.toFileResults(a, b, hw);
        currentGame++;
        Main.gamesPlayed++;
    }

    @Override
    public int compareTo(PostSeasonTourny o) {
        return currentGame - o.currentGame;
    }
}
