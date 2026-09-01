export default async function handler(req, res) {
  const { season } = req.query;
  if (!season) return res.status(400).json({ error: 'missing season' });
  try {
    const r = await fetch(
      `https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${season}`
    );
    if (!r.ok) throw new Error(`MLB API returned ${r.status}`);
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
