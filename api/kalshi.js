export default async function handler(req, res) {
  const { type, away, home } = req.query;
  if (!type || !away || !home) return res.status(400).json({ error: 'missing type, away, or home' });

  try {
    if (type === 'moneyline') {
      const r = await fetch(
        'https://api.elections.kalshi.com/trade-api/v2/events?series_ticker=KXMLBGAME&status=open&with_nested_markets=true&limit=200'
      );
      if (!r.ok) throw new Error(`Kalshi API returned ${r.status}`);
      const data = await r.json();
      const events = data.events || [];
      const suffix = `${away}${home}`;
      const match = events.find(e =>
        e.event_ticker && e.event_ticker.startsWith('KXMLBGAME-') && e.event_ticker.endsWith(suffix)
      );
      if (!match || !match.markets || !match.markets.length) {
        return res.status(200).json({ available: false });
      }
      const market = match.markets[0];
      const yesBid = parseFloat(market.yes_bid_dollars);
      const yesAsk = parseFloat(market.yes_ask_dollars);
      if (!yesBid && !yesAsk) {
        return res.status(200).json({ available: false, reason: 'no live quotes yet' });
      }
      const yesProb = (yesBid && yesAsk) ? (yesBid + yesAsk) / 2 : (yesBid || yesAsk);
      const yesTeam = market.ticker.split('-').pop();
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate');
      return res.status(200).json({ available: true, yesTeam, yesProb, eventTicker: match.event_ticker });
    }

    if (type === 'runline' || type === 'total') {
      const seriesTicker = type === 'runline' ? 'KXMLBSPREAD' : 'KXMLBTOTAL';
      const r = await fetch(
        `https://api.elections.kalshi.com/trade-api/v2/events?series_ticker=${seriesTicker}&status=open&with_nested_markets=true&limit=200`
      );
      if (!r.ok) throw new Error(`Kalshi API returned ${r.status}`);
      const data = await r.json();
      const events = data.events || [];
      const suffix = `${away}${home}`;
      const match = events.find(e =>
        e.event_ticker && e.event_ticker.startsWith(`${seriesTicker}-`) && e.event_ticker.endsWith(suffix)
      );
      if (!match || !match.markets || !match.markets.length) {
        return res.status(200).json({ available: false });
      }

      const lines = match.markets.map(market => {
        const yesBid = parseFloat(market.yes_bid_dollars);
        const yesAsk = parseFloat(market.yes_ask_dollars);
        const yesProb = (yesBid && yesAsk) ? (yesBid + yesAsk) / 2 : (yesBid || yesAsk || null);
        const text = market.yes_sub_title || market.title || '';
        const lineMatch = text.match(/(\d+\.?\d*)/);
        const line = lineMatch ? parseFloat(lineMatch[1]) : null;

        if (type === 'runline') {
          const tickerSuffix = market.ticker.split('-').pop();
          const favoredTeam = (tickerSuffix.match(/^[A-Z]+/) || [null])[0];
          return { favoredTeam, line, yesProb };
        }
        return { line, overProb: yesProb };
      }).filter(l => (l.yesProb || l.overProb) && l.line !== null);

      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate');
      return res.status(200).json({ available: lines.length > 0, lines, eventTicker: match.event_ticker });
    }

    return res.status(400).json({ error: 'unknown type' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
