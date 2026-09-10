const ORIGIN = "https://efhub.com";
const MODEL =
  process.env.OPENAI_VISION_MODEL ||
  "gpt-5.6-luna";

const POS =
  "GK|CB|LB|RB|DMF|CMF|AMF|LMF|RMF|LWF|RWF|SS|CF";

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

async function html(url) {
  const r = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      accept: "text/html"
    }
  });

  if (!r.ok) {
    throw new Error(
      `eFHUB ${r.status}`
    );
  }

  return r.text();
}

function parseGroups(h) {
  const hs = [
    ...h.matchAll(
      /<h2[^>]*>([\s\S]*?)<\/h2>/gi
    )
  ];

  return hs.map((m, i) => {
    const title = clean(m[1]);

    const block = h.slice(
      m.index + m[0].length,
      i + 1 < hs.length
        ? hs[i + 1].index
        : h.length
    );

    const players = [];
    const seen = new Set();

    const rx = new RegExp(
      `<a[^>]+href=["'][^"']*\\/players\\/(\\d+)[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>`,
      "gi"
    );

    for (
      const x of block.matchAll(rx)
    ) {
      const t = clean(x[2]);

      const p = t.match(
        new RegExp(
          `^(\\d{2,3})\\s*(${POS})\\s+(.+)$`,
          "i"
        )
      );

      if (!p) continue;

      const name = clean(p[3]);

      if (
        !name ||
        seen.has(name)
      ) {
        continue;
      }

      seen.add(name);

      players.push({
        id: x[1],
        ovr: +p[1],
        pos: p[2].toUpperCase(),
        name
      });
    }

    return {
      title,
      players
    };
  }).filter(
    g => g.players.length
  );
}

function image(id) {
  return `https://boooost.jp/img/p/${id}.webp`;
}

function date(title) {
  const m = title.match(
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+'?(\d{2})/i
  );

  return m
    ? `${+m[1]} ${m[2]} 20${m[3]}`
    : "Latest";
}function textDecision(group) {
  if (group.players.length !== 11) {
    return "REJECT";
  }

  const t =
    group.title.toLowerCase();

  const reject = [
    "potw",
    "rewards",
    "manager pack",
    "national teams selection",
    "european clubs selection",
    "anticipated standouts",
    "gracias"
  ];

  if (
    reject.some(
      x => t.includes(x)
    )
  ) {
    return "REJECT";
  }

  const obvious = [
    "epic",
    "show time",
    "showtime",
    "summer transfer",
    "guardians",
    "snap strike"
  ];

  if (
    obvious.some(
      x => t.includes(x)
    )
  ) {
    return "ACCEPT";
  }

  return "AI";
}

function outputText(data) {
  if (
    typeof data?.output_text ===
    "string"
  ) {
    return data.output_text;
  }

  const out = [];

  for (
    const item of
      data?.output || []
  ) {
    for (
      const c of
        item?.content || []
    ) {
      if (
        c?.type ===
          "output_text" &&
        typeof c?.text ===
          "string"
      ) {
        out.push(c.text);
      }
    }
  }

  return out.join("\n");
}

async function aiCheck(group) {
  const key =
    process.env.OPENAI_API_KEY;

  if (!key) return false;

  const cards =
    group.players.slice(0, 3);

  if (cards.length < 3) {
    return false;
  }

  const content = [
    {
      type: "input_text",
      text:
        `Classify this eFootball release: "${group.title}". ` +
        `Look at the three card images. ` +
        `Return only PREMIUM if they are the three featured cards of an Epic/Show Time style 150-player box. ` +
        `Otherwise return OTHER.`
    },

    ...cards.map(
      p => ({
        type: "input_image",
        image_url: image(p.id),
        detail: "low"
      })
    )
  ];

  try {
    const r = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${key}`,
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          model: MODEL,
          input: [
            {
              role: "user",
              content
            }
          ],
          max_output_tokens: 20
        })
      }
    );

    if (!r.ok) {
      console.warn(
        "OpenAI",
        r.status
      );

      return false;
    }

    const data =
      await r.json();

    return outputText(data)
      .trim()
      .toUpperCase()
      .startsWith("PREMIUM");

  } catch (e) {
    console.warn(e);
    return false;
  }
}

function typeOf(title) {
  const t =
    title.toLowerCase();

  if (
    t.includes("show time") ||
    t.includes("showtime") ||
    t.includes("summer transfer")
  ) {
    return "SHOW TIME";
  }

  return "EPIC";
}function toPack(group) {
  const type = typeOf(group.title);

  return {
    date: date(group.title),
    type,
    title: group.title.replace(
      /\s+\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+'?\d{2}$/i,
      ""
    ),

    mains: group.players
      .slice(0, 3)
      .map(p => ({
        id: p.id,
        name: p.name,
        pos: p.pos,
        ovr: p.ovr,
        type:
          type === "SHOW TIME"
            ? "ShowTime"
            : "Epic",
        img: image(p.id)
      })),

    highlights: group.players
      .slice(3, 11)
      .map(p => [
        p.name,
        p.pos,
        p.ovr
      ])
  };
}

async function selectGroups(groups) {
  const picked = [];
  const ai = [];

  for (const g of groups) {
    if (picked.length >= 3) break;

    const d =
      textDecision(g);

    if (d === "ACCEPT") {
      picked.push(g);
    } else if (d === "AI") {
      ai.push(g);
    }
  }

  for (const g of ai) {
    if (picked.length >= 3) break;

    if (await aiCheck(g)) {
      picked.push(g);
    }
  }

  return picked.slice(0, 3);
}

export default async function handler(
  req,
  res
) {
  const checkedAt =
    new Date().toISOString();

  try {
    const h =
      await html(
        `${ORIGIN}/new-players`
      );

    const groups =
      parseGroups(h);

    const selected =
      await selectGroups(groups);

    const packs =
      selected.map(toPack);

    res.setHeader(
      "Cache-Control",
      "s-maxage=900, stale-while-revalidate=1800"
    );

    return res.status(200).json({
      packs,
      checkedAt,
      source:
        "eFHUB /new-players",
      imageSource:
        "boooost player-id cards",
      aiVision:
        Boolean(
          process.env.OPENAI_API_KEY
        ),
      aiModel:
        process.env.OPENAI_API_KEY
          ? MODEL
          : null
    });

  } catch (error) {
    return res.status(200).json({
      packs: [],
      checkedAt,
      source: "eFHUB",
      aiVision:
        Boolean(
          process.env.OPENAI_API_KEY
        ),
      error:
        String(error)
    });
  }
}
