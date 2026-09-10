const ORIGIN = "https://efhub.com";

async function getText(url) {
  const r = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      "accept": "text/html,application/xhtml+xml"
    }
  });

  if (!r.ok) throw new Error("EFHub " + r.status);
  return await r.text();
}

function clean(s = "") {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function findPackLinks(html) {
  html = html.replace(/\\u002F/g, "/").replace(/\\\//g, "/");

  return [
    ...new Set(
      [...html.matchAll(/\/packs\/([a-z0-9][a-z0-9-]{2,120})/gi)]
        .map(x => "/packs/" + x[1])
    )
  ];
}

function parsePack(html) {
  const title = clean(
    (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] ||
    (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] ||
    ""
  );

  const lower = title.toLowerCase();

  if (
    !lower.includes("epic") &&
    !lower.includes("show time") &&
    !lower.includes("showtime")
  ) return null;

  const players = [];
  const seen = new Set();

  const rx =
    /"name"\s*:\s*"([^"]+)"[\s\S]{0,300}?"(?:overall|rating|ovr)"\s*:\s*(\d{2,3})[\s\S]{0,300}?"(?:position|pos)"\s*:\s*"([^"]+)"/g;

  let m;

  while ((m = rx.exec(html))) {
    const name = clean(m[1]);

    if (!seen.has(name)) {
      seen.add(name);

      players.push({
        name,
        ovr: Number(m[2]),
        pos: clean(m[3])
      });
    }
  }

  if (players.length < 3) return null;

  const type = lower.includes("show") ? "SHOW TIME" : "EPIC";
  const cardType = type === "SHOW TIME" ? "ShowTime" : "Epic";

  return {
    date: "Latest",
    type,
    title: title.replace(/\s*\|\s*eFHUB.*$/i, ""),
    mains: players.slice(0, 3).map(p => ({
      ...p,
      type: cardType
    })),
    highlights: players.slice(3, 11).map(p => [
      p.name,
      p.pos,
      p.ovr
    ])
  };
}

export default async function handler(req, res) {
  const packs = [];

  try {
    const pages = [
      ORIGIN + "/packs",
      ORIGIN + "/",
      ORIGIN + "/new-players"
    ];

    let links = [];

    for (const page of pages) {
      try {
        links.push(...findPackLinks(await getText(page)));
      } catch {}
    }

    links = [...new Set(links)].slice(-40).reverse();

    for (const path of links) {
      if (packs.length >= 3) break;

      try {
        const pack = parsePack(await getText(ORIGIN + path));

        if (
          pack &&
          !packs.some(x => x.title === pack.title)
        ) {
          packs.push(pack);
        }
      } catch {}
    }
  } catch {}

  res.setHeader(
    "Cache-Control",
    "s-maxage=300, stale-while-revalidate=600"
  );

  res.status(200).json({
    packs,
    checkedAt: new Date().toISOString(),
    source: "eFHUB"
  });
}
