export default async function handler(req, res) {
  const { teamId, beforeDate } = req.query;
  if (!teamId || !beforeDate) return res.status(400).json({ error: 'missing teamId or beforeDate' });

  try {
    const gameDay = new Date(beforeDate);
    const end = new Date(gameDay);
    end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(gameDay);
    start.setUTCDate(start.getUTCDate() - 3);

    const fmt = (d) => d.toISOString().slice(0, 10);

    const r = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&startDate=${fmt(start)}&endDate=${fmt(end)}`
    );
    if (!r.ok) throw new Error(`MLB API returned ${r.status}`);
    const data = await r.json();

    let gamesPlayed = 0;
    let doubleHeaderRecently = false;

    (data.dates || []).forEach(day => {
      const finals = (day.games || []).filter(g => g.status && g.status.abstractGameState === 'Final');
      gamesPlayed += finals.length;
      if (finals.length > 1) doubleHeaderRecently = true;
    });

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
    res.status(200).json({
      gamesInLast3Days: gamesPlayed,
      doubleHeaderRecently
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
