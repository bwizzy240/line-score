export default async function handler(req, res) {
  const { date } = req.query;
  const dateParam = date ? `&date=${date}` : '';
  try {
    const r = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1${dateParam}&hydrate=probablePitcher,team`
    );
    if (!r.ok) throw new Error(`MLB API returned ${r.status}`);
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
