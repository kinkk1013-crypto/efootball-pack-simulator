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

function decodeHtml(s = "") {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/");
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
  const headings = [
    ...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)
  ];

  for (let i = 0; i < headings.length; i++) {
    const title = clean(headings[i][1]);

    const start =
      headings[i].index + headings[i][0].length;

    const end =
      i + 1 < headings.length
        ? headings[i + 1].index
        : html.length;

    const block = html.slice(start, end);

    const players = [];
    const seen = new Set();

    for (
      const m of block.matchAll(
        /<a[^>]+href=["'][^"']*\/players\/(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi
      )
    ) {
      const id = m[1];
      const text = clean(m[2]);

      const pm = text.match(
        /^(\d{2,3})\s*(GK|CB|LB|RB|DMF|CMF|AMF|LMF|RMF|LWF|RWF|SS|CF)\s+(.+)$/i
      );

      if (!pm) continue;

      const name = clean(pm[3]);

      if (!name || seen.has(name)) continue;

      seen.add(name);

      players.push({
        id,
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

  return `${Number(m[1])} ${m[2]} 20${m[3]}`;
}

function isPremium150Box(group) {
  if (group.players.length !== 11) {
    return false;
  }

  const t = group.title.toLowerCase();

  const excluded = [
    "potw",
    "rewards",
    "manager pack",
    "national teams selection",
    "european clubs selection",
    "madrid chamartin b selection",
    "anticipated standouts",
    "english league selection 13 aug",
    "gracias"
  ];

  if (excluded.some(x => t.includes(x))) {
    return false;
  }

  const premiumHints = [
    "epic",
    "show time",
    "showtime",
    "summer transfer",
    "guardians",
    "snap strike"
  ];

  return premiumHints.some(
    x => t.includes(x)
  );
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
}

function getAttr(tag, attr) {
  const m = tag.match(
    new RegExp(
      attr + String.raw`\s*=\s*["']([^"']+)["']`,
      "i"
    )
  );

  return m
    ? decodeHtml(m[1])
    : "";
}

function absolutizeImage(src) {
  if (!src) return null;

  if (src.startsWith("//")) {
    return "https:" + src;
  }

  if (src.startsWith("/")) {
    return ORIGIN + src;
  }

  if (/^https?:\/\//i.test(src)) {
    return src;
  }

  return null;
}

function parsePlayerCardImage(
  html,
  playerName
) {
  const imgs = [
    ...html.matchAll(/<img\b[^>]*>/gi)
  ].map(m => m[0]);

  for (const tag of imgs) {
    const alt =
      clean(
        getAttr(tag, "alt")
      ).toLowerCase();

    if (
      alt.includes("player card") ||
      (
        alt.includes(
          playerName.toLowerCase()
        ) &&
        alt.includes("card")
      )
    ) {
      const src =
        getAttr(tag, "src") ||
        getAttr(tag, "data-src");

      if (src) {
        return absolutizeImage(src);
      }

      const srcset =
        getAttr(tag, "srcset");

      if (srcset) {
        const first =
          srcset
            .split(",")[0]
            .trim()
            .split(/\s+/)[0];

        const url =
          absolutizeImage(first);

        if (url) {
          return url;
        }
      }
    }
  }

  const escaped =
    playerName.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const around =
    new RegExp(
      `<img[^>]{0,1200}alt=["'][^"']*(?:${escaped}|player card)[^"']*["'][^>]*>`,
      "i"
    ).exec(html);

  if (around) {
    const src =
      getAttr(around[0], "src") ||
      getAttr(around[0], "data-src");

    if (src) {
      return absolutizeImage(src);
    }
  }

  return null;
}async function fetchPlayerCardImage(
  player
) {
  try {
    const html =
      await getHTML(
        `${ORIGIN}/players/${player.id}`
      );

    return parsePlayerCardImage(
      html,
      player.name
    );
  } catch {
    return null;
  }
}

function toPack(group) {
  const type =
    packType(group.title);

  const cardType =
    type === "SHOW TIME"
      ? "ShowTime"
      : "Epic";

  return {
    date:
      releaseDateFromTitle(
        group.title
      ),

    type,

    title:
      group.title.replace(
        /\s+\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+'?\d{2}$/i,
        ""
      ),

    mains:
      group.players
        .slice(0, 3)
        .map(player => ({
          id: player.id,
          name: player.name,
          pos: player.pos,
          ovr: player.ovr,
          type: cardType,
          img: null
        })),

    highlights:
      group.players
        .slice(3, 11)
        .map(player => [
          player.name,
          player.pos,
          player.ovr
        ])
  };
}

async function addMainPlayerImages(
  packs
) {
  const jobs = [];

  for (const pack of packs) {
    for (const player of pack.mains) {
      jobs.push(
        fetchPlayerCardImage(
          player
        ).then(img => {
          player.img = img;
        })
      );
    }
  }

  await Promise.all(jobs);
  return packs;
}

export default async function handler(
  req,
  res
) {
  const checkedAt =
    new Date().toISOString();

  try {
    const html =
      await getHTML(
        `${ORIGIN}/new-players`
      );

    const groups =
      parseNewPlayers(html);

    let packs =
      groups
        .filter(isPremium150Box)
        .slice(0, 3)
        .map(toPack);

    packs =
      await addMainPlayerImages(
        packs
      );

    res.setHeader(
      "Cache-Control",
      "s-maxage=300, stale-while-revalidate=600"
    );

    return res.status(200).json({
      packs,
      checkedAt,
      source:
        "eFHUB /new-players + /players"
    });

  } catch (error) {
    return res.status(200).json({
      packs: [],
      checkedAt,
      source: "eFHUB",
      error: String(error)
    });
  }
}
