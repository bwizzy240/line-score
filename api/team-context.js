export default async function handler(req, res) {
  const { teamId, pitcherId, beforeDate, currentVenueId } = req.query;
  if (!teamId || !beforeDate) return res.status(400).json({ error: 'missing teamId or beforeDate' });

  try {
    const gameDay = new Date(beforeDate);
    const end = new Date(gameDay);
    end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(gameDay);
    start.setUTCDate(start.getUTCDate() - 8); // look back over a week for pitcher's last start

    const fmt = (d) => d.toISOString().slice(0, 10);

    const r = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&startDate=${fmt(start)}&endDate=${fmt(end)}&hydrate=probablePitcher,team`
    );
    if (!r.ok) throw new Error(`MLB API returned ${r.status}`);
    const data = await r.json();

    const allGames = [];
    (data.dates || []).forEach(day => {
      (day.games || []).forEach(g => allGames.push(g));
    });
    allGames.sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate)); // most recent first

    // Pitcher rest: find this pitcher's most recent start (as probable, regardless of home/away)
    let pitcherRestDays = null;
    if (pitcherId) {
      for (const g of allGames) {
        const awayP = g.teams.away.probablePitcher;
        const homeP = g.teams.home.probablePitcher;
        if ((awayP && String(awayP.id) === String(pitcherId)) || (homeP && String(homeP.id) === String(pitcherId))) {
          const diffMs = gameDay.getTime() - new Date(g.gameDate).getTime();
          pitcherRestDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
          break;
        }
      }
    }

    // Travel: find the most recent completed game (any opponent) to get previous venue
    let travelMiles = null;
    let timezoneShiftHours = null;
    const lastFinal = allGames.find(g => g.status && g.status.abstractGameState === 'Final');
    if (lastFinal && lastFinal.venue && currentVenueId && String(lastFinal.venue.id) !== String(currentVenueId)) {
      try {
        const [prevVenueRes, currVenueRes] = await Promise.all([
          fetch(`https://statsapi.mlb.com/api/v1/venues/${lastFinal.venue.id}?hydrate=location`),
          fetch(`https://statsapi.mlb.com/api/v1/venues/${currentVenueId}?hydrate=location`)
        ]);
        if (prevVenueRes.ok && currVenueRes.ok) {
          const prevData = await prevVenueRes.json();
          const currData = await currVenueRes.json();
          const prevCoords = prevData.venues?.[0]?.location?.defaultCoordinates;
          const currCoords = currData.venues?.[0]?.location?.defaultCoordinates;
          if (prevCoords && currCoords) {
            // Haversine distance
            const toRad = (v) => (v * Math.PI) / 180;
            const R = 3958.8; // miles
            const dLat = toRad(currCoords.latitude - prevCoords.latitude);
            const dLon = toRad(currCoords.longitude - prevCoords.longitude);
            const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(prevCoords.latitude)) * Math.cos(toRad(currCoords.latitude)) * Math.sin(dLon / 2) ** 2;
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            travelMiles = Math.round(R * c);
            // Rough timezone shift estimate from longitude difference (~15 degrees per hour) —
            // an approximation, not a real timezone database lookup.
            timezoneShiftHours = Math.round((currCoords.longitude - prevCoords.longitude) / 15);
          }
        }
      } catch (e) { /* leave travel fields null on failure */ }
    }

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
    res.status(200).json({ pitcherRestDays, travelMiles, timezoneShiftHours });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
