/* ------------------------------------------------------------------
   CD Regal – Spicetify Custom App
   Alben/Singles = CD-Cases, Playlists = Kassetten. Regal-Ansicht,
   3D-Inspect, Abspiel-Animation mit Player-Dock.
   ------------------------------------------------------------------ */
const CDR = (() => {
  "use strict";
  const S = Spicetify;
  const R = S.React;

  // ---------- Konstanten ----------
  const DIM = {
    album: { w: 34, h: 196 },
    single: { w: 21, h: 196 },
    playlist: { w: 28, h: 172 },
  };
  const PAD = 34;
  const FILTERS = [
    ["all", "Alle"],
    ["album", "Alben"],
    ["single", "Singles"],
    ["playlist", "Playlists"],
  ];
  const ICONS = {
    prev: '<path d="M6 5h2v14H6zM20 5v14L9 12z"/>',
    next: '<path d="M16 5h2v14h-2zM4 5v14l11-7z"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    pause: '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>',
    eject: '<path d="M5 17h14v2H5zM12 5l7 10H5z"/>',
    full: '<path d="M4 4h6v2H6v4H4zM14 4h6v6h-2V6h-4zM4 14h2v4h4v2H4zM18 14h2v6h-6v-2h4z"/>',
    back: '<path d="M15 5l-7 7 7 7-1.4 1.4L5.2 12l8.4-8.4z"/>',
  };

  // ---------- Helfer ----------
  const h = (tag, props, ...kids) => {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
        else el.setAttribute(k, v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  };
  const setVars = (el, vars) => {
    for (const k in vars) el.style.setProperty(k, vars[k]);
  };
  const svg = (name, size) =>
    `<svg viewBox="0 0 24 24" width="${size || 22}" height="${size || 22}" fill="currentColor">${ICONS[name]}</svg>`;
  const icon = (name, size) => {
    const s = h("span", { class: "cdr-ico" });
    s.innerHTML = svg(name, size);
    return s;
  };
  const hash = (s) => {
    let x = 2166136261;
    for (let i = 0; i < s.length; i++) {
      x ^= s.charCodeAt(i);
      x = Math.imul(x, 16777619);
    }
    return x >>> 0;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const idOf = (uri) => String(uri || "").split(":").pop();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const isTape = (it) => it.kind === "playlist";
  const fmt = (ms) => {
    const s = Math.max(0, Math.floor((ms || 0) / 1000));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  };
  const artVar = (it) => (it.cover ? `url("${it.cover}")` : "none");

  // ---------- Zustand ----------
  let host = null;
  let items = [];
  let filter = "all";
  let query = "";
  let sortBy = "title";
  let sortDir = 1;
  let stage = null;
  const els = new Map();
  const dock = { el: null, item: null, media: null, since: 0, ejecting: false };
  let shelfScroll, shelfEl, statusEl, searchEl, caseColorInput, caseTextColorInput;
  const pillEls = {};
  let ro = null;
  let lastW = 0;
  let layoutTimer = 0;
  let loadMsg = null;
  let tickTimer = 0;
  let queueItems = [];
  let queuePanel, queueList, queueStatus, queueButton;
  let queueCurrent = null;
  let queueSort = "default";
  let queueTimer = 0;
  let settingsPanel;
  const SETTINGS_KEY = "cdr-settings";
  const settings = {
    color: "walnut",
    width: 1560,
    caseHeight: 196,
    caseGap: 3,
    groupBy: "type",
    caseFont: "spotify",
    customCaseColors: false,
    caseColor: "#334155",
    caseTextColor: "#ffffff",
    showArtistOnSpine: true,
  };
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"));
  } catch (e) {
    console.warn("[CD Regal] Einstellungen konnten nicht geladen werden", e);
  }
  settings.color = ["walnut", "oak", "black"].includes(settings.color) ? settings.color : "walnut";
  settings.width = clamp(Number(settings.width) || 1560, 1000, 2200);
  settings.caseHeight = clamp(Number(settings.caseHeight) || 196, 150, 250);
  settings.caseGap = Number.isFinite(Number(settings.caseGap)) ? clamp(Number(settings.caseGap), 0, 12) : 3;
  settings.groupBy = settings.groupBy === "artist" ? "artist" : "type";
  settings.caseFont = ["spotify", "sans", "serif", "mono"].includes(settings.caseFont) ? settings.caseFont : "spotify";
  settings.customCaseColors = Boolean(settings.customCaseColors);
  settings.caseColor = /^#[0-9a-f]{6}$/i.test(settings.caseColor) ? settings.caseColor : "#334155";
  settings.caseTextColor = /^#[0-9a-f]{6}$/i.test(settings.caseTextColor) ? settings.caseTextColor : "#ffffff";
  settings.showArtistOnSpine = settings.showArtistOnSpine !== false;

  // ---------- Daten laden ----------
  const responseItems = (r) => {
    if (Array.isArray(r)) return r;
    if (Array.isArray(r && r.items)) return r.items;
    if (Array.isArray(r && r.tracks && r.tracks.items)) return r.tracks.items;
    if (Array.isArray(r && r.data && r.data.items)) return r.data.items;
    if (Array.isArray(r && r.data && r.data.tracks && r.data.tracks.items)) return r.data.tracks.items;
    if (Array.isArray(r && r.rows)) return r.rows;
    return [];
  };

  async function pageAll(url, max) {
    const out = [];
    const seen = new Set();
    const cap = max || 10000;
    while (url && out.length < cap) {
      if (seen.has(url)) throw new Error("Spotify hat beim Laden der Titelliste eine wiederholte Seite zurückgegeben");
      seen.add(url);
      const r = await S.CosmosAsync.get(url);
      const page = responseItems(r);
      out.push(...page);
      const next =
        r &&
        (r.next ||
          (r.tracks && r.tracks.next) ||
          (r.data && (r.data.next || (r.data.tracks && r.data.tracks.next))));
      if (next) {
        url = next;
        continue;
      }
      const responseTotal =
        r && (r.total ?? (r.data && r.data.total));
      const total = Number(responseTotal);
      const match = url.match(/[?&]offset=(\d+)/);
      const offset = match ? Number(match[1]) : 0;
      const limitMatch = url.match(/[?&]limit=(\d+)/);
      const limit = limitMatch ? Number(limitMatch[1]) : page.length;
      if (!page.length || !Number.isFinite(total) || total <= offset + page.length || !limit) break;
      const nextOffset = offset + page.length;
      url = url.replace(/([?&])offset=\d+/, `$1offset=${nextOffset}`);
      if (!/[?&]offset=/.test(url)) url += `${url.includes("?") ? "&" : "?"}offset=${nextOffset}`;
    }
    if (out.length >= cap) console.warn("[CD Regal] Titelliste wegen Größenlimit abgeschnitten", cap);
    return out;
  }

  function albumItem(a) {
    const artist = (a.artists || []).map((x) => x.name).join(", ");
    return {
      id: a.id,
      uri: a.uri,
      kind: a.album_type === "single" ? "single" : "album",
      title: a.name || "?",
      artist,
      artistNames: (a.artists || []).map((x) => x.name).filter(Boolean),
      cover: a.images && a.images[0] ? a.images[0].url : "",
      count: a.total_tracks,
      hue: hash((a.name || "") + "|" + artist) % 360,
    };
  }

  function playlistItem(p) {
    const artist = p.owner && p.owner.display_name ? p.owner.display_name : "";
    const total = p.tracks && p.tracks.total != null ? p.tracks.total : p.items && p.items.total;
    return {
      id: p.id,
      uri: p.uri,
      kind: "playlist",
      title: p.name || "Playlist",
      artist,
      artistNames: artist ? [artist] : [],
      cover: p.images && p.images[0] ? p.images[0].url : "",
      count: total,
      hue: hash((p.name || "") + "|" + artist) % 360,
    };
  }

  // --- Strategie A: interne Bibliotheks-API (befüllt auch Spotifys Seitenleiste) ---
  const imgUrl = (im) => {
    let u = !im ? "" : typeof im === "string" ? im : im.url || "";
    if (u.startsWith("spotify:image:")) u = "https://i.scdn.co/image/" + u.slice(14);
    return u;
  };
  const pickImg = (arr) => {
    if (!Array.isArray(arr) || !arr.length) return "";
    const pref = arr.find((i) => i && /xlarge|large/i.test(i.label || "")) || arr[0];
    return imgUrl(pref);
  };
  const nameOf = (x) => (x && (x.name || x.displayName || x.display_name || x.username)) || "";

  function fromLibrary(x) {
    const type = String(x.type || "").toLowerCase();
    const uri = x.uri || "";
    if (!uri) return null;
    const isAlbum = type === "album" || uri.startsWith("spotify:album:");
    const isPl = type === "playlist" || uri.startsWith("spotify:playlist:") || uri.endsWith(":collection");
    if (!isAlbum && !isPl) return null;
    const title = x.name || (uri.endsWith(":collection") ? "Lieblingssongs" : "?");
    const artist = isAlbum
      ? (x.artists || []).map(nameOf).filter(Boolean).join(", ")
      : nameOf(x.owner);
    const single = isAlbum && /single|ep/i.test(String(x.albumType || x.album_type || x.subtype || ""));
    return {
      id: uri,
      uri,
      kind: isPl ? "playlist" : single ? "single" : "album",
      title,
      artist,
      artistNames: isAlbum ? (x.artists || []).map(nameOf).filter(Boolean) : artist ? [artist] : [],
      cover: pickImg(x.images) || imgUrl(x.image),
      count: x.totalTracks != null ? x.totalTracks : x.trackCount != null ? x.trackCount : x.totalLength != null ? x.totalLength : null,
      hue: hash(title + "|" + artist) % 360,
    };
  }

  async function loadViaLibraryApi() {
    const api = S.Platform && S.Platform.LibraryAPI;
    if (!api || typeof api.getContents !== "function") throw new Error("LibraryAPI nicht vorhanden");
    const out = [];
    let offset = 0;
    for (let guard = 0; guard < 80; guard++) {
      const r = await api.getContents({ limit: 100, offset });
      const page = (r && (r.items || r.rows)) || [];
      out.push(...page);
      offset += page.length;
      const total = r && (r.totalLength != null ? r.totalLength : r.total);
      if (!page.length || (total != null && offset >= total)) break;
    }
    const mapped = [];
    const seen = new Set();
    for (const x of out) {
      const it = x && fromLibrary(x);
      if (it && !seen.has(it.id)) {
        seen.add(it.id);
        mapped.push(it);
      }
    }
    return { mapped, raw: out.length };
  }

  // --- Strategie B: Spotify Web API ---
  async function loadViaWebApi() {
    const res = await Promise.allSettled([
      pageAll("https://api.spotify.com/v1/me/albums?limit=50"),
      pageAll("https://api.spotify.com/v1/me/playlists?limit=50"),
    ]);
    const mapped = [];
    if (res[0].status === "fulfilled")
      res[0].value.forEach((x) => {
        if (x && x.album) mapped.push(albumItem(x.album));
      });
    if (res[1].status === "fulfilled")
      res[1].value.forEach((p) => {
        if (p && p.id) mapped.push(playlistItem(p));
      });
    if (!mapped.length && res.every((r) => r.status === "rejected")) throw res[0].reason;
    return { mapped, raw: mapped.length };
  }

  // Singles erkennen (best effort): Web-API kennt album_type, die interne API oft nicht
  async function markSingles() {
    try {
      const albums = await pageAll("https://api.spotify.com/v1/me/albums?limit=50");
      const map = new Map();
      albums.forEach((x) => x && x.album && map.set(x.album.uri, x.album));
      let changed = false;
      items.forEach((it) => {
        const a = map.get(it.uri);
        if (a && it.kind !== "playlist") {
          const k = a.album_type === "single" ? "single" : "album";
          if (k !== it.kind) {
            it.kind = k;
            changed = true;
          }
          if (it.count == null) it.count = a.total_tracks;
        }
      });
      if (changed && !stage) {
        refreshPills();
        layoutShelf();
      }
    } catch (_) {}
  }

  async function load() {
    setStatus("Regal wird eingeräumt …");
    loadMsg = h("div", { class: "cdr-empty" }, h("div", { class: "cdr-spinner" }), "Regal wird eingeräumt …");
    shelfEl.textContent = "";
    shelfEl.append(loadMsg);
    const log = [];
    items = [];
    for (const [label, fn] of [
      ["Bibliotheks-API", loadViaLibraryApi],
      ["Web-API", loadViaWebApi],
    ]) {
      try {
        const r = await fn();
        log.push(`${label}: ${r.raw} Einträge, ${r.mapped.length} verwendbar`);
        if (r.mapped.length) {
          items = r.mapped;
          break;
        }
      } catch (e) {
        console.error("[CD Regal]", label, e);
        log.push(`${label}: Fehler – ${(e && (e.message || e.error || JSON.stringify(e))) || e}`);
      }
    }
    if (!items.length) {
      loadMsg = h(
        "div",
        { class: "cdr-empty" },
        "Es konnten keine Alben oder Playlists geladen werden.",
        h("small", { class: "cdr-diag" }, log.join("  |  ")),
        h("button", { class: "cdr-btn", onclick: load }, "Nochmal versuchen")
      );
      shelfEl.textContent = "";
      shelfEl.append(loadMsg);
      setStatus("Nichts geladen");
      return;
    }
    loadMsg = null;
    refreshPills();
    layoutShelf();
    adoptPlaying();
    if (items.some((i) => i.kind === "album")) markSingles();
  }

  // ---------- Regal ----------
  const visible = () =>
    items.filter(
      (it) =>
        (filter === "all" || it.kind === filter) && (!query || (it.title + " " + it.artist).toLowerCase().includes(query))
    ).sort((a, b) => {
      if (filter === "all" && settings.groupBy === "type" && a.kind !== b.kind) {
        const order = { album: 0, single: 1, playlist: 2 };
        return order[a.kind] - order[b.kind];
      }
      const left = sortBy === "artist" ? a.artist : sortBy === "type" ? a.kind : a.title;
      const right = sortBy === "artist" ? b.artist : sortBy === "type" ? b.kind : b.title;
      return String(left || "").localeCompare(String(right || ""), "de", { sensitivity: "base" }) * sortDir;
    });

  function setStatus(t) {
    if (statusEl) statusEl.textContent = t;
  }

  function refreshPills() {
    const n = { all: items.length, album: 0, single: 0, playlist: 0 };
    items.forEach((it) => n[it.kind]++);
    for (const [k] of FILTERS) {
      pillEls[k].classList.toggle("on", k === filter);
      pillEls[k].querySelector("em").textContent = n[k];
    }
    const cds = n.album + n.single;
    setStatus(`${cds} CDs · ${n.playlist} Kassetten`);
  }

  function spineColors(it) {
    const x = hash(it.title + "|" + it.artist);
    const hue = x % 360;
    const sat = 38 + ((x >>> 8) % 40);
    if (isTape(it)) return { c1: `hsl(${hue} ${sat + 15}% 46%)`, c2: "#fff" };
    if (settings.customCaseColors) return { c1: settings.caseColor, c2: settings.caseTextColor };
    const mode = (x >>> 4) % 6;
    if (mode === 0) return { c1: `hsl(${hue} 22% 92%)`, c2: "#15151a" };
    if (mode === 1) return { c1: "#0e0e10", c2: "#f2f2f2" };
    return { c1: `hsl(${hue} ${sat}% ${18 + ((x >>> 12) % 22)}%)`, c2: "#fff" };
  }

  function makeSpine(it, w, hh, k) {
    const { c1, c2 } = spineColors(it);
    const tape = isTape(it);
    const fs = (it.kind === "single" ? 10 : tape ? 11.5 : 12.5) * k;
    const el = h(
      "div",
      { class: "cdr-sp " + (tape ? "cdr-sp-tape" : "cdr-sp-cd") + (it.kind === "single" ? " cdr-sp-single" : "") },
      h("span", { class: "cdr-sp-cap" }),
      h(
        "span",
        { class: "cdr-sp-text" },
        h("b", { text: it.title }),
        settings.showArtistOnSpine && it.artist ? h("i", { text: it.artist }) : null
      ),
      h("span", { class: "cdr-sp-tag", text: tape ? "C60" : "CD" })
    );
    const fonts = { spotify: 'var(--font-family, "Spotify Mix", "Segoe UI", sans-serif)', sans: "Arial, Helvetica, sans-serif", serif: 'Georgia, "Times New Roman", serif', mono: '"Courier New", monospace' };
    setVars(el, { "--w": w + "px", "--h": hh + "px", "--c1": c1, "--c2": c2, "--fs": fs + "px", "--case-font": fonts[settings.caseFont] });
    return el;
  }

  function itemEl(it) {
    const d = DIM[it.kind];
    const b = h(
      "button",
      {
        class: "cdr-item",
        title: it.artist ? `${it.title} – ${it.artist}` : it.title,
        "aria-label": it.title,
      },
      makeSpine(it, d.w, d.h, 1)
    );
    b.addEventListener("click", () => openStage(it));
    const hoverPlay = h("button", {
      class: "cdr-hover-play",
      title: "Jetzt abspielen",
      "aria-label": `${it.title} von ${it.artist} abspielen`,
      onclick: async (e) => {
        e.stopPropagation();
        await startPlay(it);
      },
    }, icon("play", 16));
    const wrap = h("div", { class: "cdr-item-wrap" }, b, hoverPlay,
      h("div", { class: "cdr-hover-card" }, h("b", { text: it.title }), h("span", { text: it.artist || "Unbekannter Künstler" })));
    if (stage && stage.item === it) b.classList.add("cdr-lifted");
    if (dock.item === it) {
      b.classList.add("cdr-playing");
      if (S.Player.isPlaying()) b.classList.add("is-live");
    }
    els.set(it.id, b);
    return wrap;
  }

  function layoutShelf() {
    if (!shelfEl || !host) return;
    if (!items.length && loadMsg) {
      shelfEl.textContent = "";
      shelfEl.append(loadMsg);
      return;
    }
    const list = visible();
    lastW = shelfScroll.clientWidth;
    const usable = Math.max(260, shelfEl.clientWidth - PAD * 2);
    shelfEl.textContent = "";
    els.clear();
    let slots = null;
    let used = 0;
    let grp = "";
    let rows = 0;
    let lastLabeledGroup = "";
    const addRow = (kind) => {
      slots = h("div", { class: "cdr-slots" });
      slots.style.gap = `${settings.caseGap}px`;
      const labels = { album: "ALBEN", single: "SINGLES", playlist: "PLAYLISTS" };
      const label = filter === "all" && kind && kind !== lastLabeledGroup ? h("div", { class: "cdr-row-label", text: labels[kind] }) : null;
      if (label) lastLabeledGroup = kind;
      shelfEl.append(h("div", { class: "cdr-row" }, label, slots, h("div", { class: "cdr-board" })));
      used = 0;
      rows++;
    };
    const scale = settings.caseHeight / 196;
    const appendItems = (groupItems) => {
      for (const it of groupItems) {
        const w = DIM[it.kind].w * scale + settings.caseGap;
        if (!slots || used + w > usable) addRow(settings.groupBy === "artist" ? null : it.kind);
        const element = itemEl(it);
        const spine = element.querySelector(".cdr-sp");
        if (spine) {
          setVars(spine, {
            "--w": DIM[it.kind].w * scale + "px",
            "--h": DIM[it.kind].h * scale + "px",
            "--fs": (it.kind === "single" ? 10 : isTape(it) ? 11.5 : 12.5) * scale + "px",
          });
        }
        slots.append(element);
        used += w;
      }
    };
    if (settings.groupBy === "artist") {
      const groups = new Map();
      list.forEach((it) => {
        const key = (it.artistNames && it.artistNames[0]) || it.artist || "Unbekannter Künstler";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(it);
      });
      const sortedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "de", { sensitivity: "base" }) * sortDir);
      for (const [artist, artistItems] of sortedGroups) {
        slots = null;
        used = 0;
        grp = "";
        shelfEl.append(h("h2", { class: "cdr-artist-heading", text: artist }));
        appendItems(artistItems);
      }
    } else {
      for (const it of list) {
        if (!slots || (filter === "all" && it.kind !== grp)) {
          addRow(it.kind);
          grp = it.kind;
        }
        appendItems([it]);
      }
    }
    if (!list.length) {
      shelfEl.append(
        h("div", { class: "cdr-empty cdr-empty-in" }, items.length ? "Nichts gefunden." : "Deine Bibliothek ist leer.")
      );
    }
    for (let i = rows; i < 3; i++) addRow();
    if (stage) stage.btnCache = els.get(stage.item.id) || null;
  }

  // ---------- Medien: CD & Kassette ----------
  function makeDisc(it, size) {
    const d = h("div", { class: "cdr-disc" }, h("div", { class: "cdr-disc-face" }));
    d.style.width = d.style.height = size + "px";
    setVars(d, { "--art": artVar(it), "--hue": it.hue });
    return d;
  }

  function makeTape(it) {
    const reel = () => h("div", { class: "cdr-reel" }, h("i"));
    const t = h(
      "div",
      { class: "cdr-tape" },
      h(
        "div",
        { class: "cdr-tape-label" },
        h("div", { class: "cdr-tape-stripe" }),
        h("div", { class: "cdr-tape-title", text: it.title }),
        h("div", { class: "cdr-tape-sub", text: [it.artist, it.count != null ? it.count + " Titel" : ""].filter(Boolean).join(" · ") }),
        h(
          "div",
          { class: "cdr-tape-window" },
          h("div", { class: "cdr-pack cdr-pack-l" }),
          h("div", { class: "cdr-pack cdr-pack-r" }),
          h("div", { class: "cdr-reel-slot cdr-reel-l" }, reel()),
          h("div", { class: "cdr-reel-slot cdr-reel-r" }, reel())
        )
      ),
      h("div", { class: "cdr-tape-foot" }, h("i"), h("i")),
      h("span", { class: "cdr-screw s1" }),
      h("span", { class: "cdr-screw s2" }),
      h("span", { class: "cdr-screw s3" }),
      h("span", { class: "cdr-screw s4" })
    );
    setVars(t, { "--hue": it.hue });
    return t;
  }

  function makeDockTape(it) {
    return h("div", { class: "cdr-scaler" }, makeTape(it));
  }

  // ---------- 3D-Box ----------
  function makeBox(W, H, D) {
    const obj = h("div", { class: "cdr-obj" });
    Object.assign(obj.style, { width: W + "px", height: H + "px", left: -W / 2 + "px", top: -H / 2 + "px" });
    const mk = (cls, w, hh, tr) => {
      const f = h("div", { class: "cdr-face " + cls });
      Object.assign(f.style, {
        width: w + "px",
        height: hh + "px",
        left: (W - w) / 2 + "px",
        top: (H - hh) / 2 + "px",
        transform: tr,
      });
      return f;
    };
    const front = mk("cdr-front", W, H, `translateZ(${D / 2}px)`);
    const back = mk("cdr-back", W, H, `rotateY(180deg) translateZ(${D / 2}px)`);
    const left = mk("cdr-left", D, H, `rotateY(-90deg) translateZ(${W / 2}px)`);
    const right = mk("cdr-right", D, H, `rotateY(90deg) translateZ(${W / 2}px)`);
    const top = mk("cdr-top", W, D, `rotateX(90deg) translateZ(${H / 2}px)`);
    const bottom = mk("cdr-bottom", W, D, `rotateX(-90deg) translateZ(${H / 2}px)`);
    obj.append(back, left, right, top, bottom, front);
    return { obj, front, back, left, right, top, bottom };
  }

  // ---------- Hilfen für Animationen ----------
  const rel = (r) => {
    const hr = host.getBoundingClientRect();
    return { left: r.left - hr.left, top: r.top - hr.top, width: r.width, height: r.height };
  };

  function flyClone(src, from, to, opts) {
    const o = opts || {};
    const nw = src.offsetWidth;
    const nh = src.offsetHeight;
    const c = src.cloneNode(true);
    c.classList.add("cdr-fly");
    Object.assign(c.style, {
      position: "absolute",
      left: "0px",
      top: "0px",
      width: nw + "px",
      height: nh + "px",
      margin: "0",
      opacity: "1",
      visibility: "visible",
      zIndex: "60",
      pointerEvents: "none",
      transformOrigin: "50% 50%",
    });
    host.append(c);
    const tf = (r) =>
      `translate(${r.left + r.width / 2 - nw / 2}px, ${r.top + r.height / 2 - nh / 2}px) scale(${r.width / nw})`;
    const frames = [
      { transform: tf(from), opacity: 1 },
      { transform: tf(to), opacity: o.fadeOut ? 0 : 1 },
    ];
    const a = c.animate(frames, { duration: o.ms || 900, easing: o.easing || "cubic-bezier(.45,0,.2,1)", fill: "forwards" });
    return { clone: c, done: a.finished };
  }

  function tweenRot(st, to, ms) {
    st.rot.y = ((((st.rot.y + 180) % 360) + 360) % 360) - 180;
    const from = { x: st.rot.x, y: st.rot.y, z: st.rot.z };
    return new Promise((res) => {
      const t0 = performance.now();
      const step = (now) => {
        const t = clamp((now - t0) / ms, 0, 1);
        const e = ease(t);
        for (const k of ["x", "y", "z"]) if (to[k] !== undefined) st.rot[k] = from[k] + (to[k] - from[k]) * e;
        st.apply();
        if (t < 1) requestAnimationFrame(step);
        else res();
      };
      requestAnimationFrame(step);
    });
  }

  // ---------- Inspect-Ansicht ----------
  function flipFrom(st) {
    const sr = st.el.getBoundingClientRect();
    const sx = sr.left + sr.width / 2;
    const sy = sr.top + sr.height * 0.46;
    const b = els.get(st.item.id);
    let cx = sx;
    let cy = sy + 240;
    let s = 0.2;
    if (b && b.isConnected) {
      const r = b.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      s = Math.max(0.1, r.height / (st.H * st.base));
    }
    return { dx: cx - sx, dy: cy - sy, s };
  }

  function setLid(st, open) {
    st.open = open;
    st.box.front.style.transform = `translateZ(${st.D / 2}px) rotateY(${open ? -118 : 0}deg)`;
    if (st.btnOpen) st.btnOpen.lastChild.textContent = open ? "Schließen" : "Öffnen";
  }

  async function openStage(it) {
    if (stage || !host) return;
    const tape = isTape(it);
    const H = tape ? 190 : 250;
    const W = tape ? 300 : Math.round(H * 1.136);
    const D = tape ? 24 : it.kind === "single" ? 26 : 40;
    const box = makeBox(W, H, D);
    const st = { item: it, tape, W, H, D, box, rot: { x: -8, y: 90, z: 1 }, base: 1, busy: true, open: false, closing: false };
    stage = st;

    const el = h("div", { class: "cdr-stage" });
    const pop = h("div", { class: "cdr-pop" });
    const scene = h("div", { class: "cdr-scene" }, pop);
    pop.append(box.obj);
    st.el = el;
    st.pop = pop;

    // Flächen befüllen
    if (tape) {
      st.media = makeTape(it);
      box.front.append(st.media);
      const back = h(
        "div",
        { class: "cdr-tape-backface" },
        h(
          "div",
          { class: "cdr-tape-label" },
          h("div", { class: "cdr-tape-stripe" }),
          h("div", { class: "cdr-tape-side", text: "SEITE B" }),
          h("div", { class: "cdr-tape-title", text: it.title }),
          h("div", { class: "cdr-tape-sub", text: it.artist })
        ),
        h("div", { class: "cdr-tape-foot" }, h("i"), h("i"))
      );
      setVars(back, { "--hue": it.hue });
      box.back.append(back);
      for (const f of [box.left, box.right, box.top, box.bottom]) f.classList.add("cdr-plastic");
      if (dock.item === it) st.media.style.opacity = "0.18";
    } else {
      box.front.classList.add("cdr-lid");
      const out = h("div", { class: "cdr-lid-out" }, h("div", { class: "cdr-art" }), h("div", { class: "cdr-gloss" }));
      out.firstChild.style.setProperty("--art", artVar(it));
      const inn = h("div", { class: "cdr-lid-in" }, h("b", { text: it.title }), h("span", { text: it.artist }));
      box.front.append(out, inn);
      box.back.classList.add("cdr-trayface");
      box.back.append(
        h("div", { class: "cdr-back-out" },
          h("div", { class: "cdr-case-back-title", text: it.title }),
          h("div", { class: "cdr-case-back-artist", text: it.artist }),
          h("div", { class: "cdr-case-back-meta", text: `${it.kind === "single" ? "SINGLE / EP" : "ALBUM"}${it.count != null ? ` · ${it.count} TITEL` : ""}` })
        ),
        h("div", { class: "cdr-back-in" })
      );
      box.left.append(makeSpine(it, D, H, H / DIM[it.kind].h));
      for (const f of [box.right, box.top, box.bottom]) f.classList.add("cdr-plastic");
      const dd = Math.round(H * 0.92);
      st.media = makeDisc(it, dd);
      const holder = h("div", { class: "cdr-disc-holder" }, st.media);
      Object.assign(holder.style, {
        width: dd + "px",
        height: dd + "px",
        left: W * 0.54 - dd / 2 + "px",
        top: (H - dd) / 2 + "px",
        transform: `translateZ(${-D / 2 + 9}px)`,
      });
      if (dock.item === it) holder.style.visibility = "hidden";
      box.obj.append(holder);
      box.front.style.transform = `translateZ(${D / 2}px) rotateY(0deg)`;
    }

    // Texte & Buttons
    const meta = [it.count != null ? it.count + " Titel" : "", tape ? "Playlist-Kassette" : it.kind === "single" ? "Single / EP" : "Album"]
      .filter(Boolean)
      .join(" · ");
    const mkBtn = (label, cls, fn, ico) => h("button", { class: "cdr-btn " + cls, onclick: fn }, ico ? icon(ico, 18) : null, label);
    st.btnOpen = tape ? null : mkBtn("Öffnen", "", () => toggleLid(st));
    st.btnFlip = mkBtn("Umdrehen", "", () => flip(st));
    const playing = dock.item === it;
    st.btnPlay = mkBtn(playing ? "Läuft im Player" : "Abspielen", "primary", () => playSequence(st), playing ? null : "play");
    if (playing) st.btnPlay.disabled = true;
    st.btnBack = mkBtn("Zurück ins Regal", "", () => closeStage(), "back");
    st.btns = [st.btnOpen, st.btnFlip, st.btnPlay, st.btnBack].filter(Boolean);

    el.append(
      scene,
      h("div", { class: "cdr-meta" }, h("h2", { text: it.title }), h("p", { text: it.artist }), h("small", { text: meta })),
      h("div", { class: "cdr-actions" }, st.btns),
      h("div", { class: "cdr-hint", text: "Ziehen zum Drehen · Mausrad zum Zoomen · Esc zum Schließen" })
    );

    // Interaktion
    const drag = { on: false, x: 0, y: 0, moved: 0 };
    const vel = { x: 0, y: 0 };
    const coast = () => {
      if (drag.on || st.busy || stage !== st) return;
      vel.x *= 0.94;
      vel.y *= 0.94;
      st.rot.y += vel.x;
      st.rot.x = clamp(st.rot.x + vel.y, -70, 70);
      st.apply();
      if (Math.abs(vel.x) + Math.abs(vel.y) > 0.06) requestAnimationFrame(coast);
    };
    el.addEventListener("pointerdown", (e) => {
      if (st.busy || !box.obj.contains(e.target)) return;
      drag.on = true;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved = 0;
      vel.x = vel.y = 0;
      el.setPointerCapture(e.pointerId);
      el.classList.add("grab");
    });
    el.addEventListener("pointermove", (e) => {
      if (!drag.on) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      st.rot.y += dx * 0.5;
      st.rot.x = clamp(st.rot.x - dy * 0.35, -70, 70);
      vel.x = dx * 0.5;
      vel.y = -dy * 0.35;
      st.apply();
    });
    const up = () => {
      if (!drag.on) return;
      drag.on = false;
      el.classList.remove("grab");
      coast();
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("click", (e) => {
      if (drag.moved > 5) {
        drag.moved = 0;
        return;
      }
      if (!st.busy && (e.target === el || e.target === scene)) closeStage();
    });
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        st.rot.z = clamp(st.rot.z * (e.deltaY < 0 ? 1.08 : 0.92), 0.6, 1.8);
        st.apply();
      },
      { passive: false }
    );

    host.append(el);
    const sr = el.getBoundingClientRect();
    st.base = clamp(Math.min((sr.height * 0.54) / H, (sr.width * 0.46) / W), 0.5, 1.5);
    st.apply = () => {
      box.obj.style.transform = `rotateX(${st.rot.x}deg) rotateY(${st.rot.y}deg) scale(${st.rot.z * st.base})`;
    };
    st.apply();
    const btn = els.get(it.id);
    if (btn) btn.classList.add("cdr-lifted");
    requestAnimationFrame(() => el.classList.add("is-in"));

    const f = flipFrom(st);
    const a = pop.animate(
      [{ transform: `translate(${f.dx}px,${f.dy}px) scale(${f.s})` }, { transform: "translate(0,0) scale(1)" }],
      { duration: 750, easing: "cubic-bezier(.2,.8,.2,1)" }
    );
    await Promise.all([a.finished, tweenRot(st, { y: 24, x: -8 }, 750)]);
    st.busy = false;
  }

  async function closeStage() {
    const st = stage;
    if (!st || st.closing) return;
    st.closing = true;
    st.el.classList.remove("is-in");
    st.el.classList.add("leaving");
    const f = flipFrom(st);
    const a = st.pop.animate(
      [{ transform: "translate(0,0) scale(1)" }, { transform: `translate(${f.dx}px,${f.dy}px) scale(${f.s / st.rot.z})` }],
      { duration: 560, easing: "cubic-bezier(.55,0,.75,.2)", fill: "forwards" }
    );
    await Promise.all([a.finished, tweenRot(st, { y: 90, x: 0 }, 560)]);
    const b = els.get(st.item.id);
    if (b) b.classList.remove("cdr-lifted");
    st.el.remove();
    stage = null;
  }

  function toggleLid(st) {
    if (st.busy || st.closing) return;
    setLid(st, !st.open);
  }

  async function flip(st) {
    if (st.busy || st.closing) return;
    st.busy = true;
    st.rot.y = ((((st.rot.y + 180) % 360) + 360) % 360) - 180;
    await tweenRot(st, { y: st.rot.y + 180, x: -6 }, 750);
    st.busy = false;
  }

  // ---------- Abspiel-Animation ----------
  async function playSequence(st) {
    if (st.busy || st.closing || dock.item === st.item) return;
    st.busy = true;
    st.btns.forEach((b) => (b.disabled = true));
    st.el.classList.add("playing");
    const it = st.item;
    if (dock.item) dockReset();

    await tweenRot(st, { x: 0, y: st.tape ? 0 : -10, z: 1 }, 520);
    const media = dockPrepare(it);
    const started = startPlay(it);
    if (!st.tape) setLid(st, true);
    await sleep(st.tape ? 650 : 820);

    const from = rel(st.media.getBoundingClientRect());
    const to = rel(media.getBoundingClientRect());
    st.media.style.visibility = "hidden";
    const fl = flyClone(st.media, from, to, { ms: 1100 });
    await sleep(380);
    if (!st.tape) setLid(st, false);
    const closing = closeStage();
    await Promise.all([fl.done, closing]);
    media.style.opacity = "1";
    fl.clone.remove();
    if (!(await started)) eject();
  }

  async function startPlay(it) {
    if (dock.item !== it) {
      if (dock.item) dockReset();
      dockPrepare(it).style.opacity = "1";
    }
    const attempts = [
      () => S.Player.playUri(it.uri, {}, {}),
      () => S.Platform.PlayerAPI.play({ uri: it.uri }, {}, {}),
      () => S.CosmosAsync.put("https://api.spotify.com/v1/me/player/play", { context_uri: it.uri }),
    ];
    for (const go of attempts) {
      try {
        await go();
      } catch (e) {
        console.warn("[CD Regal] Abspielversuch fehlgeschlagen", e);
        continue;
      }
      await sleep(1500);
      const d = S.Player.data || {};
      const ctx = (d.context && d.context.uri) || d.context_uri || (d.item && d.item.album && d.item.album.uri);
      if (S.Player.isPlaying() && (!ctx || idOf(ctx) === idOf(it.uri))) return true;
    }
    if (dock.item === it) dockReset();
    S.showNotification("Abspielen hat nicht geklappt", true);
    return false;
  }

  function openSpotifyQueue() {
    if (!queuePanel) return;
    queuePanel.classList.add("is-open");
    queueButton.setAttribute("aria-expanded", "true");
    refreshQueue();
  }

  // ---------- Player-Dock ----------
  function buildDock() {
    dock.slot = h("div", { class: "cdr-slot" });
    dock.title = h("div", { class: "cdr-dock-title" });
    dock.sub = h("div", { class: "cdr-dock-sub" });
    dock.fill = h("i");
    dock.tCur = h("span", { text: "0:00" });
    dock.tEnd = h("span", { text: "0:00" });
    const bar = h(
      "div",
      {
        class: "cdr-bar",
        onclick: (e) => {
          const r = bar.getBoundingClientRect();
          const p = clamp((e.clientX - r.left) / r.width, 0, 1);
          try {
            S.Player.seek(p * S.Player.getDuration());
          } catch (_) {}
        },
      },
      dock.fill
    );
    const ctl = (name, title, fn) => {
      const b = h("button", { class: "cdr-ctl", title, onclick: fn });
      b.innerHTML = svg(name, 22);
      return b;
    };
    dock.btnPlay = ctl("pause", "Wiedergabe pausieren", () => S.Player.togglePlay());
    dock.btnPlay.classList.add("big");
    dock.btnPlay.setAttribute("aria-label", "Wiedergabe pausieren");
    dock.el = h(
      "div",
      { class: "cdr-dock" },
      dock.slot,
      h("div", { class: "cdr-dock-info" }, dock.title, dock.sub, h("div", { class: "cdr-times" }, dock.tCur, bar, dock.tEnd)),
      h(
        "div",
        { class: "cdr-dock-ctl" },
        ctl("prev", "Zurück", () => S.Player.back()),
        dock.btnPlay,
        ctl("next", "Weiter", () => S.Player.next()),
        h("button", {
          class: "cdr-ctl cdr-dock-queue",
          title: "Spotify-Warteschlange anzeigen",
          "aria-label": "Spotify-Warteschlange anzeigen",
          onclick: openSpotifyQueue,
          text: "☷",
        }),
        ctl("eject", "Auswerfen", () => eject())
      )
    );
  }

  function markPlaying(it, on) {
    const b = els.get(it.id);
    if (!b) return;
    b.classList.toggle("cdr-playing", on);
    if (!on) b.classList.remove("is-live");
  }

  function dockPrepare(it) {
    const media = isTape(it) ? makeDockTape(it) : makeDisc(it, 108);
    media.classList.add("cdr-dock-media");
    media.style.opacity = "0";
    dock.slot.textContent = "";
    dock.slot.append(media);
    dock.media = media;
    dock.item = it;
    dock.since = Date.now();
    dock.title.textContent = it.title;
    dock.sub.textContent = it.artist;
    dock.el.classList.add("show");
    host.classList.add("has-dock");
    markPlaying(it, true);
    updateDock();
    return media;
  }

  function getCurrentPlaybackItem() {
    const data = S.Player.data || {};
    const track = data.item || {};
    const metadata = track.metadata || {};
    const trackUri = track.uri || metadata.uri || "";
    if (!trackUri) return null;

    const contextUri = (data.context && data.context.uri) || data.context_uri || "";
    const album = track.album || {};
    const albumUri = album.uri || "";
    const savedItem = items.find((item) => item.uri && (item.uri === contextUri || item.uri === albumUri));
    if (savedItem) return savedItem;

    const artists = Array.isArray(track.artists) ? track.artists : [];
    const albumArtists = Array.isArray(album.artists) ? album.artists : [];
    const images = Array.isArray(album.images) ? album.images : Array.isArray(track.images) ? track.images : [];
    const image = images.find((entry) => entry && entry.url);
    const cover = (image && image.url) || metadata.image_url || metadata.album_cover_url || "";
    const artistNames = (albumArtists.length ? albumArtists : artists).map((entry) => entry.name).filter(Boolean);
    const uri = albumUri || trackUri;
    const title = album.name || track.name || metadata.title || "Spotify-Wiedergabe";

    return {
      id: `now-playing:${contextUri || uri}`,
      uri,
      kind: album.album_type === "single" ? "single" : "album",
      title,
      artist: artistNames.join(", ") || metadata.artist_name || "",
      artistNames,
      cover,
      count: album.total_tracks || 1,
      hue: hash(title + "|" + artistNames.join(", ")) % 360,
    };
  }

  function dockReset() {
    if (dock.item) markPlaying(dock.item, false);
    dock.item = null;
    dock.media = null;
    dock.slot.textContent = "";
    dock.el.classList.remove("show", "is-playing");
    host.classList.remove("has-dock");
  }

  async function eject() {
    const it = dock.item;
    if (!it || dock.ejecting) return;
    dock.ejecting = true;
    try {
      S.Player.pause();
    } catch (_) {}
    const media = dock.media;
    const b = els.get(it.id);
    if (media && b && b.isConnected) {
      const from = rel(media.getBoundingClientRect());
      const r = rel(b.getBoundingClientRect());
      const w = Math.max(14, from.width * 0.22);
      const to = { left: r.left + r.width / 2 - w / 2, top: r.top + r.height / 2 - (w * from.height) / from.width / 2, width: w, height: (w * from.height) / from.width };
      media.style.visibility = "hidden";
      dock.el.classList.remove("is-playing");
      const fl = flyClone(media, from, to, { ms: 750, fadeOut: true, easing: "cubic-bezier(.5,0,.75,.3)" });
      await fl.done;
      fl.clone.remove();
    }
    dockReset();
    dock.ejecting = false;
  }

  function adoptPlaying() {
    if (dock.item) return;
    const it = getCurrentPlaybackItem();
    if (it) dockPrepare(it).style.opacity = "1";
  }

  function updateDock() {
    if (!dock.item) return;
    const d = S.Player.data || {};
    const t = d.item || {};
    const name = t.name || (t.metadata && t.metadata.title) || "";
    const art = (t.artists && t.artists.map((a) => a.name).join(", ")) || (t.metadata && t.metadata.artist_name) || "";
    const album = (t.album && t.album.name) || (t.metadata && t.metadata.album_title) || "";
    dock.title.textContent = name || dock.item.title;
    dock.sub.textContent = [art || dock.item.artist, album].filter(Boolean).join(" · ");
    const playing = !!S.Player.isPlaying();
    dock.el.classList.toggle("is-playing", playing);
    dock.btnPlay.innerHTML = svg(playing ? "pause" : "play", 22);
    dock.btnPlay.title = playing ? "Wiedergabe pausieren" : "Wiedergabe fortsetzen";
    dock.btnPlay.setAttribute("aria-label", dock.btnPlay.title);
    const b = els.get(dock.item.id);
    if (b) b.classList.toggle("is-live", playing);
  }

  function syncPlayback() {
    if (dock.ejecting) return;
    const currentItem = getCurrentPlaybackItem();
    if (!currentItem) {
      if (dock.item) dockReset();
      return;
    }
    if (!dock.item || dock.item.uri !== currentItem.uri) {
      if (dock.item) dockReset();
      dockPrepare(currentItem).style.opacity = "1";
    } else {
      updateDock();
    }
  }

  function onSong() {
    if (queuePanel && queuePanel.classList.contains("is-open")) refreshQueue();
    syncPlayback();
  }

  function tick() {
    if (!dock.item) return;
    let dur = 0;
    let pos = 0;
    try {
      dur = S.Player.getDuration() || 0;
      pos = S.Player.getProgress() || 0;
    } catch (_) {}
    const p = dur ? clamp(pos / dur, 0, 1) : 0;
    dock.fill.style.width = p * 100 + "%";
    dock.tCur.textContent = fmt(pos);
    dock.tEnd.textContent = fmt(dur);
    if (dock.media) dock.media.style.setProperty("--p", p.toFixed(3));
  }

  function applySettings() {
    if (!host) return;
    host.dataset.wood = settings.color;
    host.style.setProperty("--cabinet-width", `${settings.width}px`);
    layoutShelf();
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn("[CD Regal] Einstellungen konnten nicht gespeichert werden", e);
      S.showNotification("Einstellungen konnten nicht gespeichert werden", true);
    }
  }

  function renderQueue() {
    if (!queueList) return;
    queueList.textContent = "";
    if (queueCurrent) {
      queueList.append(h("div", { class: "cdr-queue-current" },
        h("small", { text: "WIRD GERADE WIEDERGEGEBEN" }),
        h("b", { text: queueCurrent.name || "Unbekannter Titel" }),
        h("span", { text: (queueCurrent.artists || []).map((a) => a.name).join(", ") })
      ));
    }
    let tracks = queueItems.slice();
    if (queueSort !== "default") {
      tracks.sort((a, b) => {
        const left = queueSort === "artist" ? (a.artists || []).map((x) => x.name).join(", ") : a.name;
        const right = queueSort === "artist" ? (b.artists || []).map((x) => x.name).join(", ") : b.name;
        return String(left || "").localeCompare(String(right || ""), "de", { sensitivity: "base" });
      });
    }
    tracks.forEach((track, i) => {
      const artists = (track.artists || []).map((a) => a.name).join(", ");
      const action = (label, title, fn, glyph) => h("button", {
        class: "cdr-queue-play",
        title,
        "aria-label": `${track.name || "Titel"} von ${artists}: ${title}`,
        onclick: async (e) => {
          e.stopPropagation();
          try {
            await fn();
            await sleep(250);
            await refreshQueue();
          } catch (e) {
            console.error(`[CD Regal] Warteschlangen-Aktion fehlgeschlagen: ${label}`, e);
            S.showNotification(`${label} fehlgeschlagen`, true);
          }
        },
      }, glyph);
      const play = action("Abspielen", "Titel jetzt abspielen", () => {
        if (!track.uri) throw new Error("Für diesen Titel ist keine Spotify-URI verfügbar");
        return S.Player.playUri(track.uri, {}, {});
      }, icon("play", 15));
      const moveNext = action("Als Nächstes", "An den Anfang der Warteschlange verschieben", async () => {
        if (typeof S.removeFromQueue !== "function" || typeof S.addToQueue !== "function") {
          throw new Error("Diese Spicetify-Version unterstützt das Verschieben in der Warteschlange nicht");
        }
        await S.removeFromQueue([track]);
        await S.addToQueue([track]);
      }, "↑");
      const remove = action("Entfernen", "Aus der Warteschlange entfernen", () => {
        if (typeof S.removeFromQueue !== "function") {
          throw new Error("Diese Spicetify-Version unterstützt das Entfernen aus der Warteschlange nicht");
        }
        return S.removeFromQueue([track]);
      }, "×");
      queueList.append(h("div", { class: "cdr-queue-row" },
        h("span", { class: "cdr-queue-number", text: String(i + 1) }),
        h("div", { class: "cdr-queue-track" }, h("b", { text: track.name || "Unbekannter Titel" }), h("span", { text: artists })),
        h("span", { class: "cdr-queue-duration", text: fmt(track.duration_ms) }),
        h("div", { class: "cdr-queue-actions" }, play, moveNext, remove)
      ));
    });
    if (!tracks.length && !queueCurrent && !queueStatus.dataset.error) {
      queueList.append(h("p", { class: "cdr-queue-empty", text: "Die Spotify-Warteschlange ist leer." }));
    }
  }

  async function refreshQueue() {
    if (!queuePanel) return;
    try {
      const response = await S.CosmosAsync.get("https://api.spotify.com/v1/me/player/queue");
      queueCurrent = response && response.currently_playing ? response.currently_playing : null;
      queueItems = Array.isArray(response && response.queue) ? response.queue : [];
      queueStatus.textContent = `${queueItems.length} Titel in der Warteschlange`;
      queueStatus.dataset.error = "";
      renderQueue();
    } catch (e) {
      console.error("[CD Regal] Spotify-Warteschlange konnte nicht geladen werden", e);
      queueStatus.textContent = "Warteschlange konnte nicht geladen werden";
      queueStatus.dataset.error = "true";
      queueList.textContent = "";
      queueList.append(h("p", { class: "cdr-queue-empty", text: "Spotify konnte die Warteschlange nicht bereitstellen. Starte zuerst die Wiedergabe in Spotify und versuche es erneut." }));
    }
  }

  // ---------- UI ----------
  function buildUI() {
    host.textContent = "";
    FILTERS.forEach(([k, label]) => {
      pillEls[k] = h(
        "button",
        {
          class: "cdr-pill" + (k === filter ? " on" : ""),
          onclick: () => {
            filter = k;
            refreshPills();
            layoutShelf();
          },
        },
        label,
        h("em", { text: "0" })
      );
    });
    searchEl = h("input", {
      class: "cdr-search",
      type: "search",
      placeholder: "Suchen …",
      oninput: (e) => {
        query = e.target.value.trim().toLowerCase();
        layoutShelf();
      },
    });
    const sortSelect = h("select", {
      class: "cdr-select",
      title: "Regal sortieren",
      onchange: (e) => {
        sortBy = e.target.value;
        layoutShelf();
      },
    },
    h("option", { value: "title", text: "Titel" }),
    h("option", { value: "artist", text: "Künstler" }),
    h("option", { value: "type", text: "Typ" }));
    const groupSelect = h("select", {
      class: "cdr-select",
      title: "Regal gruppieren",
      onchange: (e) => {
        settings.groupBy = e.target.value;
        saveSettings();
        layoutShelf();
      },
    },
    h("option", { value: "type", selected: settings.groupBy === "type", text: "Regale: Typ" }),
    h("option", { value: "artist", selected: settings.groupBy === "artist", text: "Regale: Künstler" }));
    const sortDirection = h("button", {
      class: "cdr-iconbtn cdr-sort-direction",
      title: "Sortierreihenfolge umkehren",
      "aria-label": "Sortierreihenfolge umkehren",
      onclick: (e) => {
        sortDir *= -1;
        e.currentTarget.textContent = sortDir > 0 ? "↑" : "↓";
        layoutShelf();
      },
      text: "↑",
    });
    statusEl = h("p", { text: "" });
    const fullBtn = h("button", { class: "cdr-iconbtn", title: "Vollbild", onclick: toggleFull });
    fullBtn.innerHTML = svg("full", 20);
    queueButton = h("button", {
      class: "cdr-iconbtn cdr-queue-toggle",
      title: "Warteschlange anzeigen",
      "aria-label": "Warteschlange anzeigen",
      onclick: () => {
        queuePanel.classList.toggle("is-open");
        queueButton.setAttribute("aria-expanded", queuePanel.classList.contains("is-open") ? "true" : "false");
        if (queuePanel.classList.contains("is-open")) refreshQueue();
      },
      text: "☷",
    });
    const settingsButton = h("button", {
      class: "cdr-iconbtn",
      title: "Regal-Einstellungen",
      "aria-label": "Regal-Einstellungen",
      onclick: () => settingsPanel.classList.toggle("is-open"),
      text: "⚙",
    });
    const top = h(
      "div",
      { class: "cdr-top" },
      h("div", { class: "cdr-brand" }, h("span", { class: "cdr-brand-cd" }), h("div", {}, h("h1", { text: "Mein CD-Regal" }), statusEl)),
      h("div", { class: "cdr-pills" }, Object.values(pillEls)),
      h("div", { class: "cdr-tools" }, searchEl, sortSelect, groupSelect, sortDirection, queueButton, settingsButton, fullBtn)
    );
    settingsPanel = h("section", { class: "cdr-settings" },
      h("h2", { text: "Regal-Einstellungen" }),
      h("label", {}, "Holzfarbe",
        h("select", {
          class: "cdr-select",
          value: settings.color,
          onchange: (e) => {
            settings.color = e.target.value;
            applySettings();
            saveSettings();
          },
        },
        h("option", { value: "walnut", selected: settings.color === "walnut", text: "Nussbaum" }),
        h("option", { value: "oak", selected: settings.color === "oak", text: "Eiche" }),
        h("option", { value: "black", selected: settings.color === "black", text: "Schwarz" }))
      ),
      h("label", {}, `Schrankbreite: ${settings.width}px`,
        h("input", {
          type: "range", min: "1000", max: "2200", step: "40", value: String(settings.width),
          oninput: (e) => {
            settings.width = Number(e.target.value);
            e.target.parentNode.firstChild.textContent = `Schrankbreite: ${settings.width}px`;
            applySettings();
            saveSettings();
          },
        })
      ),
      h("label", {}, `Höhe der Cases: ${settings.caseHeight}px`,
        h("input", {
          type: "range", min: "150", max: "250", step: "2", value: String(settings.caseHeight),
          oninput: (e) => {
            settings.caseHeight = Number(e.target.value);
            e.target.parentNode.firstChild.textContent = `Höhe der Cases: ${settings.caseHeight}px`;
            layoutShelf();
            saveSettings();
          },
        })
      ),
      h("label", {}, `Abstand zwischen Cases: ${settings.caseGap}px`,
        h("input", {
          type: "range", min: "0", max: "12", step: "1", value: String(settings.caseGap),
          oninput: (e) => {
            settings.caseGap = Number(e.target.value);
            e.target.parentNode.firstChild.textContent = `Abstand zwischen Cases: ${settings.caseGap}px`;
            layoutShelf();
            saveSettings();
          },
        })
      ),
      h("label", {}, "Schrift auf den Cases",
        h("select", {
          class: "cdr-select",
          onchange: (e) => {
            settings.caseFont = e.target.value;
            layoutShelf();
            saveSettings();
          },
        },
        h("option", { value: "spotify", selected: settings.caseFont === "spotify", text: "Spotify / System" }),
        h("option", { value: "sans", selected: settings.caseFont === "sans", text: "Sans Serif" }),
        h("option", { value: "serif", selected: settings.caseFont === "serif", text: "Serif" }),
        h("option", { value: "mono", selected: settings.caseFont === "mono", text: "Monospace" }))
      ),
      h("label", { class: "cdr-setting-check" },
        h("input", {
          type: "checkbox",
          checked: settings.showArtistOnSpine,
          onchange: (e) => {
            settings.showArtistOnSpine = e.target.checked;
            layoutShelf();
            saveSettings();
          },
        }),
        "Künstler auf dem Case-Rücken anzeigen"
      ),
      h("label", { class: "cdr-setting-check" },
        h("input", {
          type: "checkbox",
          checked: settings.customCaseColors,
          onchange: (e) => {
            settings.customCaseColors = e.target.checked;
            caseColorInput.disabled = !settings.customCaseColors;
            caseTextColorInput.disabled = !settings.customCaseColors;
            layoutShelf();
            saveSettings();
          },
        }),
        "Eigene Case-Farben verwenden"
      ),
      h("label", { class: "cdr-color-setting" }, "Case-Farbe",
        caseColorInput = h("input", {
          type: "color",
          value: settings.caseColor,
          disabled: !settings.customCaseColors,
          onchange: (e) => {
            settings.caseColor = e.target.value;
            layoutShelf();
            saveSettings();
          },
        })
      ),
      h("label", { class: "cdr-color-setting" }, "Schriftfarbe auf Cases",
        caseTextColorInput = h("input", {
          type: "color",
          value: settings.caseTextColor,
          disabled: !settings.customCaseColors,
          onchange: (e) => {
            settings.caseTextColor = e.target.value;
            layoutShelf();
            saveSettings();
          },
        })
      )
    );
    const queueSortSelect = h("select", { class: "cdr-select", "aria-label": "Warteschlange sortieren", onchange: (e) => { queueSort = e.target.value; renderQueue(); } },
      h("option", { value: "default", text: "Spotify-Reihenfolge" }),
      h("option", { value: "title", text: "Titel A–Z" }),
      h("option", { value: "artist", text: "Künstler A–Z" })
    );
    queueStatus = h("p", { class: "cdr-queue-status", text: "Warteschlange wird geladen …" });
    queueList = h("div", { class: "cdr-queue-list" });
    queuePanel = h("aside", { class: "cdr-queue-panel", "aria-label": "Spotify-Warteschlange" },
      h("div", { class: "cdr-queue-head" }, h("div", {}, h("h2", { text: "Warteschlange" }), queueStatus),
        queueSortSelect,
        h("button", { class: "cdr-iconbtn", title: "Warteschlange aktualisieren", "aria-label": "Warteschlange aktualisieren", onclick: refreshQueue, text: "↻" }),
        h("button", { class: "cdr-iconbtn", title: "Warteschlange schließen", "aria-label": "Warteschlange schließen", onclick: () => queuePanel.classList.remove("is-open"), text: "×" })
      ),
      queueList,
      h("p", { class: "cdr-queue-note", text: "Die Liste lässt sich nach Titel oder Künstler sortieren. „Als Nächstes“ und „Entfernen“ ändern Spotifys Wiedergabe-Warteschlange; die angezeigte Sortierung selbst ändert nicht die Spotify-Reihenfolge." })
    );
    shelfEl = h("div", { class: "cdr-shelves" });
    shelfScroll = h("div", { class: "cdr-scroll" }, h("div", { class: "cdr-cabinet" }, shelfEl));
    buildDock();
    host.append(top, shelfScroll, dock.el, settingsPanel, queuePanel);
    applySettings();
  }

  function toggleFull() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else host.requestFullscreen();
    } catch (_) {}
  }

  function fit() {
    if (!host) return;
    if (document.fullscreenElement === host) {
      host.style.height = "100vh";
      return;
    }
    const top = host.getBoundingClientRect().top;
    const hgt = Math.max(480, Math.round(window.innerHeight - top - 8));
    if (host.style.height !== hgt + "px") host.style.height = hgt + "px";
  }

  const onKey = (e) => {
    if (e.key === "Escape" && stage && !stage.busy) closeStage();
  };
  const onWin = () => fit();

  function mount(el) {
    host = el;
    buildUI();
    fit();
    window.addEventListener("resize", onWin);
    document.addEventListener("fullscreenchange", onWin);
    document.addEventListener("keydown", onKey);
    try {
      S.Player.addEventListener("onplaypause", syncPlayback);
      S.Player.addEventListener("songchange", onSong);
    } catch (_) {}
    tickTimer = setInterval(tick, 500);
    queueTimer = setInterval(() => {
      if (queuePanel && queuePanel.classList.contains("is-open")) refreshQueue();
    }, 15000);
    ro = new ResizeObserver(() => {
      if (!shelfScroll || shelfScroll.clientWidth === lastW) return;
      clearTimeout(layoutTimer);
      layoutTimer = setTimeout(layoutShelf, 120);
    });
    ro.observe(shelfScroll);
    load();
  }

  function unmount() {
    window.removeEventListener("resize", onWin);
    document.removeEventListener("fullscreenchange", onWin);
    document.removeEventListener("keydown", onKey);
    try {
      S.Player.removeEventListener("onplaypause", syncPlayback);
      S.Player.removeEventListener("songchange", onSong);
    } catch (_) {}
    clearInterval(tickTimer);
    clearInterval(queueTimer);
    clearTimeout(layoutTimer);
    if (ro) ro.disconnect();
    ro = null;
    stage = null;
    dock.item = null;
    dock.media = null;
    els.clear();
    host = null;
  }

  const refCb = (el) => {
    if (el) mount(el);
    else unmount();
  };

  return {
    render: () => R.createElement("div", { className: "cdr-host", ref: refCb }),
  };
})();

function render() {
  return CDR.render();
}
