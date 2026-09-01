export default async function handler(req, res) {
  const { gamePk, awayTeamId, homeTeamId, season } = req.query;
  if (!gamePk) return res.status(400).json({ error: 'missing gamePk' });

  try {
    const r = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
    if (!r.ok) throw new Error(`MLB API returned ${r.status}`);
    const data = await r.json();

    function extractLineup(teamBox) {
      if (!teamBox || !teamBox.battingOrder || !teamBox.battingOrder.length) return null;
      const playersObj = teamBox.players || {};
      const list = teamBox.battingOrder.map(pid => {
        let p = playersObj[`ID${pid}`];
        if (!p) {
          p = Object.values(playersObj).find(pl => pl.person && pl.person.id === pid);
        }
        if (!p) return null;
        return {
          id: pid,
          name: p.person && p.person.fullName,
          position: p.position && p.position.abbreviation
        };
      }).filter(Boolean);
      return list.length ? list : null;
    }

    const awayList = extractLineup(data.teams && data.teams.away);
    const homeList = extractLineup(data.teams && data.teams.home);
    const lineupsPosted = !!(awayList && homeList);

    let awayLineupOPS = null;
    let homeLineupOPS = null;
    let awayTeamOPS = null;
    let homeTeamOPS = null;

    if (lineupsPosted && season) {
      const allIds = [...awayList.map(p => p.id), ...homeList.map(p => p.id)];
      try {
        const statsRes = await fetch(
          `https://statsapi.mlb.com/api/v1/people?personIds=${allIds.join(',')}&hydrate=stats(group=[hitting],type=[season],season=${season})`
        );
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          const opsById = {};
          (statsData.people || []).forEach(person => {
            const groups = person.stats || [];
            const hittingGroup = groups.find(g => g.group && g.group.displayName === 'hitting');
            const split = hittingGroup && hittingGroup.splits && hittingGroup.splits[0];
            const ops = split && split.stat && parseFloat(split.stat.ops);
            if (ops && !isNaN(ops)) opsById[person.id] = ops;
          });

          const avgOPS = (list) => {
            const vals = list.map(p => opsById[p.id]).filter(v => v);
            return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
          };
          awayLineupOPS = avgOPS(awayList);
          homeLineupOPS = avgOPS(homeList);
        }
      } catch (e) { /* leave lineup OPS null on failure */ }

      if (awayTeamId) {
        try {
          const tRes = await fetch(`https://statsapi.mlb.com/api/v1/teams/${awayTeamId}/stats?stats=season&group=hitting&season=${season}`);
          if (tRes.ok) {
            const tData = await tRes.json();
            const split = tData.stats && tData.stats[0] && tData.stats[0].splits && tData.stats[0].splits[0];
            const ops = split && split.stat && parseFloat(split.stat.ops);
            if (ops && !isNaN(ops)) awayTeamOPS = ops;
          }
        } catch (e) { /* leave null */ }
      }
      if (homeTeamId) {
        try {
          const tRes = await fetch(`https://statsapi.mlb.com/api/v1/teams/${homeTeamId}/stats?stats=season&group=hitting&season=${season}`);
          if (tRes.ok) {
            const tData = await tRes.json();
            const split = tData.stats && tData.stats[0] && tData.stats[0].splits && tData.stats[0].splits[0];
            const ops = split && split.stat && parseFloat(split.stat.ops);
            if (ops && !isNaN(ops)) homeTeamOPS = ops;
          }
        } catch (e) { /* leave null */ }
      }
    }

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate');
    res.status(200).json({
      awayLineup: awayList,
      homeLineup: homeList,
      lineupsPosted,
      awayLineupOPS,
      homeLineupOPS,
      awayTeamOPS,
      homeTeamOPS
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
