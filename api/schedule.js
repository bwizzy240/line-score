export default async function handler(req, res) {
  const { date, startDate, endDate, gameType } = req.query;
  let rangeParam = '';
  if (date) {
    rangeParam = `&date=${date}`;
  } else if (startDate && endDate) {
    rangeParam = `&startDate=${startDate}&endDate=${endDate}`;
  }
  const gameTypeParam = gameType ? `&gameType=${gameType}` : '';
  // A wide range doesn't need pitcher/linescore hydration — keep it light for the backtest's
  // full-season fetch, only hydrate when doing a normal single-date lookup.
  const hydrate = date ? '&hydrate=probablePitcher,team,linescore' : '';
  try {
    const r = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1${rangeParam}${gameTypeParam}${hydrate}`
    );
    if (!r.ok) throw new Error(`MLB API returned ${r.status}`);
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
