export default async function handler(req, res) {
  const { venueId } = req.query;
  if (!venueId) return res.status(400).json({ error: 'missing venueId' });

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
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=UTC`
    );
    if (!weatherRes.ok) throw new Error(`Weather API returned ${weatherRes.status}`);
    const weatherData = await weatherRes.json();

    const current = weatherData.current;
    if (!current) {
      return res.status(200).json({ available: false, reason: 'no current conditions returned' });
    }

    // Short cache since this is meant to reflect real-time conditions, not a forecast.
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    res.status(200).json({
      available: true,
      isDome: !!isDome,
      roofType: roofType || null,
      venueName: venue.name,
      tempF: current.temperature_2m,
      windMph: current.wind_speed_10m,
      windDirDeg: current.wind_direction_10m,
      precipNow: current.precipitation,
      observedAt: current.time
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
