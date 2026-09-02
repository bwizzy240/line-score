export default async function handler(req, res) {
  const { teamId, beforeDate, pitcherId, currentVenueId, opponentId, season } = req.query;
  if (!teamId || !beforeDate) return res.status(400).json({ error: 'missing teamId or beforeDate' });

  try {
    const gameDay = new Date(beforeDate);
    const end = new Date(gameDay);
    end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(gameDay);
    start.setUTCDate(start.getUTCDate() - 8); // wide enough to cover both recent-workload and pitcher-rest lookback

    const fmt = (d) => d.toISOString().slice(0, 10);

    const r = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&startDate=${fmt(start)}&endDate=${fmt(end)}&hydrate=probablePitcher,team`
    );
    if (!r.ok) throw new Error(`MLB API returned ${r.status}`);
    const data = await r.json();

    const allGames = [];
    (data.dates || []).forEach(day => (day.games || []).forEach(g => allGames.push(g)));
    allGames.sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));

    // Bullpen workload: completed games in the last 3 days
    const threeDaysAgo = new Date(gameDay);
    threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);
    let gamesInLast3Days = 0;
    let doubleHeaderRecently = false;
    (data.dates || []).forEach(day => {
      const dayDate = new Date(day.date);
      if (dayDate < threeDaysAgo || dayDate >= end) return;
      const finals = (day.games || []).filter(g => g.status && g.status.abstractGameState === 'Final');
      gamesInLast3Days += finals.length;
      if (finals.length > 1) doubleHeaderRecently = true;
    });

    // Starting pitcher rest days
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

    // Travel / jet lag from the most recent completed game's venue
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
            const toRad = (v) => (v * Math.PI) / 180;
            const R = 3958.8;
            const dLat = toRad(currCoords.latitude - prevCoords.latitude);
            const dLon = toRad(currCoords.longitude - prevCoords.longitude);
            const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(prevCoords.latitude)) * Math.cos(toRad(currCoords.latitude)) * Math.sin(dLon / 2) ** 2;
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            travelMiles = Math.round(R * c);
            timezoneShiftHours = Math.round((currCoords.longitude - prevCoords.longitude) / 15);
          }
        }
      } catch (e) { /* leave travel fields null on failure */ }
    }

    // Head-to-head this season, if an opponent was specified
    let h2h = null;
    if (opponentId && season) {
      try {
        const h2hRes = await fetch(
          `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&opponentId=${opponentId}&season=${season}&gameType=R`
        );
        if (h2hRes.ok) {
          const h2hData = await h2hRes.json();
          let wins = 0, losses = 0;
          (h2hData.dates || []).forEach(day => {
            (day.games || []).forEach(g => {
              if (!g.status || g.status.abstractGameState !== 'Final') return;
              if (new Date(g.gameDate) >= gameDay) return;
              const isHome = g.teams.home.team.id === Number(teamId);
              const teamSide = isHome ? g.teams.home : g.teams.away;
              const oppSide = isHome ? g.teams.away : g.teams.home;
              let teamWon;
              if (typeof teamSide.isWinner === 'boolean') teamWon = teamSide.isWinner;
              else if (typeof teamSide.score === 'number' && typeof oppSide.score === 'number') teamWon = teamSide.score > oppSide.score;
              else return;
              if (teamWon) wins++; else losses++;
            });
          });
          h2h = { wins, losses, gamesPlayed: wins + losses };
        }
      } catch (e) { /* leave h2h null on failure */ }
    }

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
    res.status(200).json({
      gamesInLast3Days, doubleHeaderRecently,
      pitcherRestDays, travelMiles, timezoneShiftHours,
      h2h
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
