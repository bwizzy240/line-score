export default async function handler(req, res) {
  const { season } = req.query;
  if (!season) return res.status(400).json({ error: 'missing season' });
  try {
    const [standingsRes, hittingRes, pitchingRes] = await Promise.all([
      fetch(`https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${season}`),
      fetch(`https://statsapi.mlb.com/api/v1/teams/stats?season=${season}&sportId=1&group=hitting&stats=season`),
      fetch(`https://statsapi.mlb.com/api/v1/teams/stats?season=${season}&sportId=1&group=pitching&stats=season`)
    ]);

    if (!standingsRes.ok) throw new Error(`MLB standings API returned ${standingsRes.status}`);
    if (!hittingRes.ok) throw new Error(`MLB hitting stats API returned ${hittingRes.status}`);
    if (!pitchingRes.ok) throw new Error(`MLB pitching stats API returned ${pitchingRes.status}`);

    const data = await standingsRes.json();
    const hitting = await hittingRes.json();
    const pitching = await pitchingRes.json();

    // Build teamId -> runs lookup from each stats response
    const runsScoredByTeam = {};
    (hitting?.stats?.[0]?.splits || []).forEach(split => {
      if (split?.team?.id != null) {
        runsScoredByTeam[split.team.id] = split.stat?.runs ?? null;
      }
    });

    const runsAllowedByTeam = {};
    (pitching?.stats?.[0]?.splits || []).forEach(split => {
      if (split?.team?.id != null) {
        runsAllowedByTeam[split.team.id] = split.stat?.runs ?? null;
      }
    });

    // Merge runs data into each team's standings record
    (data?.records || []).forEach(division => {
      (division?.teamRecords || []).forEach(teamRecord => {
        const teamId = teamRecord?.team?.id;
        const runsScored = teamId != null ? runsScoredByTeam[teamId] : null;
        const runsAllowed = teamId != null ? runsAllowedByTeam[teamId] : null;
        teamRecord.runsScored = runsScored ?? null;
        teamRecord.runsAllowed = runsAllowed ?? null;
        teamRecord.runDifferential =
          runsScored != null && runsAllowed != null ? runsScored - runsAllowed : null;
      });
    });

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
