export default async function handler(req, res) {
  const { teamId, opponentId, season, beforeDate } = req.query;
  if (!teamId || !opponentId || !season) {
    return res.status(400).json({ error: 'missing teamId, opponentId, or season' });
  }

  try {
    const r = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&opponentId=${opponentId}&season=${season}&gameType=R`
    );
    if (!r.ok) throw new Error(`MLB API returned ${r.status}`);
    const data = await r.json();

    let wins = 0;
    let losses = 0;

    (data.dates || []).forEach(day => {
      (day.games || []).forEach(g => {
        if (!g.status || g.status.abstractGameState !== 'Final') return;
        if (beforeDate && new Date(g.gameDate) >= new Date(beforeDate)) return;

        const isHome = g.teams.home.team.id === Number(teamId);
        const teamSide = isHome ? g.teams.home : g.teams.away;
        const oppSide = isHome ? g.teams.away : g.teams.home;

        let teamWon;
        if (typeof teamSide.isWinner === 'boolean') {
          teamWon = teamSide.isWinner;
        } else if (typeof teamSide.score === 'number' && typeof oppSide.score === 'number') {
          teamWon = teamSide.score > oppSide.score;
        } else {
          return;
        }

        if (teamWon) wins++; else losses++;
      });
    });

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
    res.status(200).json({ wins, losses, gamesPlayed: wins + losses });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
