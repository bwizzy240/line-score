export default async function handler(req, res) {
  const { gamePk } = req.query;
  if (!gamePk) return res.status(400).json({ error: 'missing gamePk' });

  try {
    const r = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
    if (!r.ok) throw new Error(`MLB API returned ${r.status}`);
    const data = await r.json();

    function extractLineup(teamBox) {
      if (!teamBox || !teamBox.battingOrder || !teamBox.battingOrder.length) return null;
      const playersObj = teamBox.players || {};
      const list = teamBox.battingOrder.map(pid => {
        let p = playersObj[`ID${pid}`];
        if (!p) {
          p = Object.values(playersObj).find(pl => pl.person && pl.person.id === pid);
        }
        if (!p) return null;
        return {
          name: p.person && p.person.fullName,
          position: p.position && p.position.abbreviation
        };
      }).filter(Boolean);
      return list.length ? list : null;
    }

    const away = extractLineup(data.teams && data.teams.away);
    const home = extractLineup(data.teams && data.teams.home);

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate');
    res.status(200).json({
      awayLineup: away,
      homeLineup: home,
      lineupsPosted: !!(away && home)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
