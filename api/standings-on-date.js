export default async function handler(req, res) {
  const { date, season } = req.query;
  if (!date || !season) return res.status(400).json({ error: 'missing date or season' });

  try {
    const r = await fetch(
      `https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${season}&date=${date}`
    );
    if (!r.ok) throw new Error(`MLB API returned ${r.status}`);
    const data = await r.json();

    const map = {};
    (data.records || []).forEach(division => {
      (division.teamRecords || []).forEach(rec => {
        if (rec.team && rec.team.id != null) map[rec.team.id] = rec;
      });
    });

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json({ teams: map });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
