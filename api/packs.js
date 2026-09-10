const ORIGIN = "https://efhub.com";

function clean(s = "") {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function getHTML(url) {
  const r = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; eFootballPackSimulator/1.0)",
      "accept": "text/html,application/xhtml+xml"
    }
  });

  if (!r.ok) throw new Error("eFHUB HTTP " + r.status);
  return await r.text();
}

function parseNewPlayers(html) {
  const groups = [];

  const h2 = [
    ...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)
  ];

  for (let i = 0; i < h2.length; i++) {
    const title = clean(h2[i][1]);

    const start =
      h2[i].index + h2[i][0].length;

    const end =
      i + 1 < h2.length
        ? h2[i + 1].index
        : html.length;

    const block = html.slice(start, end);

    const players = [];
    const seen = new Set();

    for (
      const m of block.matchAll(
        /<a[^>]+href=["'][^"']*\/players\/(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi
      )
    ) {
      const playerId = m[1];
      const text = clean(m[2]);

      const pm = text.match(
        /^(\d{2,3})\s*(GK|CB|LB|RB|DMF|CMF|AMF|LMF|RMF|LWF|RWF|SS|CF)\s+(.+)$/i
      );

      if (!pm) continue;

      const name = clean(pm[3]);

      if (!name || seen.has(name)) continue;

      seen.add(name);

      players.push({
        id: playerId,
        ovr: Number(pm[1]),
        pos: pm[2].toUpperCase(),
        name
      });
    }

    if (players.length) {
      groups.push({
        title,
        players
      });
    }
  }

  return groups;
}function releaseDateFromTitle(title) {
  const m = title.match(
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+'?(\d{2})/i
  );

  if (!m) return "Latest";

  const monthMap = {
    Jan: "Jan",
    Feb: "Feb",
    Mar: "Mar",
    Apr: "Apr",
    May: "May",
    Jun: "Jun",
    Jul: "Jul",
    Aug: "Aug",
    Sep: "Sep",
    Oct: "Oct",
    Nov: "Nov",
    Dec: "Dec"
  };

  const month =
    m[2][0].toUpperCase() +
    m[2].slice(1).toLowerCase();

  return `${Number(m[1])} ${monthMap[month]} 20${m[3]}`;
}

function looksLike150Box(group) {
  if (group.players.length !== 11) {
    return false;
  }

  const first3 = group.players.slice(0, 3);

  const avg =
    first3.reduce(
      (sum, player) => sum + player.ovr,
      0
    ) / 3;

  const highCount =
    first3.filter(
      player => player.ovr >= 85
    ).length;

  const title = group.title.toLowerCase();

  if (
    title.includes("potw") ||
    title.includes("rewards") ||
    title.includes("manager pack")
  ) {
    return false;
  }

  return avg >= 85 && highCount >= 2;
}

function packType(title) {
  const t = title.toLowerCase();

  if (
    t.includes("show time") ||
    t.includes("showtime") ||
    t.includes("summer transfer")
  ) {
    return "SHOW TIME";
  }

  return "EPIC";
}function toPack(group) {
  const type = packType(group.title);

  const cardType =
    type === "SHOW TIME"
      ? "ShowTime"
      : "Epic";

  return {
    date: releaseDateFromTitle(group.title),

    type,

    title: group.title.replace(
      /\s+\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+'?\d{2}$/i,
      ""
    ),

    mains: group.players
      .slice(0, 3)
      .map(player => ({
        name: player.name,
        pos: player.pos,
        ovr: player.ovr,
        type: cardType,
        img: null
      })),

    highlights: group.players
      .slice(3, 11)
      .map(player => [
        player.name,
        player.pos,
        player.ovr
      ])
  };
}

export default async function handler(req, res) {
  const checkedAt = new Date().toISOString();

  try {
    const html = await getHTML(
      `${ORIGIN}/new-players`
    );

    const groups = parseNewPlayers(html);

    const packs = groups
      .filter(looksLike150Box)
      .slice(0, 3)
      .map(toPack);

    res.setHeader(
      "Cache-Control",
      "s-maxage=300, stale-while-revalidate=600"
    );

    return res.status(200).json({
      packs,
      checkedAt,
      source: "eFHUB /new-players"
    });

  } catch (error) {
    return res.status(200).json({
      packs: [],
      checkedAt,
      source: "eFHUB /new-players",
      error: String(error)
    });
  }
}
