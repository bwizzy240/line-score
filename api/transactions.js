export default async function handler(req, res) {
  const { teamId } = req.query;
  if (!teamId) return res.status(400).json({ error: 'missing teamId' });

  try {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 14);
    const fmt = (d) => d.toISOString().slice(0, 10);

    const r = await fetch(
      `https://statsapi.mlb.com/api/v1/transactions?teamId=${teamId}&startDate=${fmt(start)}&endDate=${fmt(end)}`
    );
    if (!r.ok) throw new Error(`MLB API returned ${r.status}`);
    const data = await r.json();

    const relevant = (data.transactions || [])
      .filter(t => /injured list|activated/i.test(t.description || t.typeDesc || ''))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 6)
      .map(t => ({
        date: t.date,
        player: t.person && t.person.fullName,
        description: t.description
      }));

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
    res.status(200).json({ transactions: relevant });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
