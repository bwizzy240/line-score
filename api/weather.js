export default async function handler(req, res) {
  const { venueId, gameDate } = req.query;
  if (!venueId || !gameDate) return res.status(400).json({ error: 'missing venueId or gameDate' });

  try {
    const venueRes = await fetch(
      `https://statsapi.mlb.com/api/v1/venues/${venueId}?hydrate=location,fieldInfo`
    );
    if (!venueRes.ok) throw new Error(`Venue API returned ${venueRes.status}`);
    const venueData = await venueRes.json();
    const venue = venueData.venues && venueData.venues[0];
    const coords = venue && venue.location && venue.location.defaultCoordinates;

    if (!coords) {
      return res.status(200).json({ available: false, reason: 'no coordinates for this venue' });
    }

    const roofType = venue.fieldInfo && venue.fieldInfo.roofType;
    const isDome = roofType && /dome|closed|retractable/i.test(roofType);

    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation_probability&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=UTC`
    );
    if (!weatherRes.ok) throw new Error(`Weather API returned ${weatherRes.status}`);
    const weatherData = await weatherRes.json();

    const times = weatherData.hourly && weatherData.hourly.time;
    if (!times || !times.length) {
      return res.status(200).json({ available: false, reason: 'no forecast data' });
    }

    const target = new Date(gameDate).getTime();
    let closestIdx = 0;
    let closestDiff = Infinity;
    times.forEach((t, i) => {
      const diff = Math.abs(new Date(t).getTime() - target);
      if (diff < closestDiff) { closestDiff = diff; closestIdx = i; }
    });

    // If the closest forecast hour is more than 18 hours off, the game is outside forecast range
    const forecastTooFar = closestDiff > 18 * 60 * 60 * 1000;

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
    res.status(200).json({
      available: !forecastTooFar,
      isDome: !!isDome,
      roofType: roofType || null,
      venueName: venue.name,
      tempF: weatherData.hourly.temperature_2m[closestIdx],
      windMph: weatherData.hourly.wind_speed_10m[closestIdx],
      windDirDeg: weatherData.hourly.wind_direction_10m[closestIdx],
      precipProb: weatherData.hourly.precipitation_probability[closestIdx]
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
