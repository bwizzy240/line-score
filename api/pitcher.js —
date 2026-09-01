export default async function handler(req, res) {
  const { id, season } = req.query;
  if (!id || !season) return res.status(400).json({ error: 'missing id or season' });
  try {
    const r = await fetch(
      `https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=season&group=pitching&season=${season}`
    );
    if (!r.ok) throw new Error(`MLB API returned ${r.status}`);
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
