/**
 * LOKALNY SERWER API DO SKINÓW (bez Lovable, bez VPS)
 * ---------------------------------------------------------------
 * Uruchamiasz na SWOIM komputerze — tym, gdzie stoi CS2 + MariaDB.
 * Frontend (kolekcje.html) leży na GitHub Pages i puka tutaj przez tunel.
 *
 * Dopóki to okno działa  -> strona: "Serwer online · zapis działa".
 * Zamykasz okno          -> strona: "Serwer offline · zapis wyłączony".
 *
 * Wymagania: Node.js 18+, `npm install` w tym folderze.
 * Start: start-server.bat
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ─── KONFIGURACJA — UZUPEŁNIJ ─────────────────────────────────
const PORT = Number(process.env.PORT || 8787);

const DB = {
  host: "127.0.0.1",
  port: 3306,
  user: "root",
  password: "",
  database: "weaponpaints",
};

/**
 * Kto może wchodzić na API. "*" = każdy (najprostsze).
 * Jeśli chcesz zawęzić: ["https://twoj-login.github.io"]
 */
const ALLOWED_ORIGINS = ["*"];
// ──────────────────────────────────────────────────────────────

const PLAYERS_FILE = path.join(HERE, "players.json");
const LOADOUTS_FILE = path.join(HERE, "loadouts.json");

const TEAM = { CT: 3, T: 2 };

const DEFINDEX = {
  "Desert Eagle": 1, "Dual Berettas": 2, "Five-SeveN": 3, "Glock-18": 4,
  "AK-47": 7, "AUG": 8, "AWP": 9, "FAMAS": 10, "G3SG1": 11, "Galil AR": 13,
  "M249": 14, "M4A4": 16, "MAC-10": 17, "P90": 19, "Zeus x27": 31,
  "MP5-SD": 23, "UMP-45": 24, "XM1014": 25, "PP-Bizon": 26, "MAG-7": 27,
  "Negev": 28, "Sawed-Off": 29, "Tec-9": 30, "P2000": 32, "MP7": 33,
  "MP9": 34, "Nova": 35, "P250": 36, "SCAR-20": 38, "SG 553": 39,
  "SSG 08": 40, "M4A1-S": 60, "USP-S": 61, "CZ75-Auto": 63, "R8 Revolver": 64,
  "★ Bayonet": 500, "★ Classic Knife": 503, "★ Flip Knife": 505,
  "★ Gut Knife": 506, "★ Karambit": 507, "★ M9 Bayonet": 508,
  "★ Huntsman Knife": 509, "★ Falchion Knife": 512, "★ Bowie Knife": 514,
  "★ Butterfly Knife": 515, "★ Shadow Daggers": 516, "★ Paracord Knife": 517,
  "★ Survival Knife": 518, "★ Ursus Knife": 519, "★ Navaja Knife": 520,
  "★ Nomad Knife": 521, "★ Stiletto Knife": 522, "★ Talon Knife": 523,
  "★ Skeleton Knife": 525, "★ Kukri Knife": 526,
  "★ Bloodhound Gloves": 5027, "★ Sport Gloves": 5030, "★ Driver Gloves": 5031,
  "★ Hand Wraps": 5032, "★ Moto Gloves": 5033, "★ Specialist Gloves": 5034,
  "★ Hydra Gloves": 5035, "★ Broken Fang Gloves": 4725,
};

const KNIFE_ENTITY = {
  500: "weapon_bayonet", 503: "weapon_knife_css", 505: "weapon_knife_flip",
  506: "weapon_knife_gut", 507: "weapon_knife_karambit", 508: "weapon_knife_m9_bayonet",
  509: "weapon_knife_tactical", 512: "weapon_knife_falchion", 514: "weapon_knife_survival_bowie",
  515: "weapon_knife_butterfly", 516: "weapon_knife_push", 517: "weapon_knife_cord",
  518: "weapon_knife_canis", 519: "weapon_knife_ursus", 520: "weapon_knife_gypsy_jackknife",
  521: "weapon_knife_outdoor", 522: "weapon_knife_stiletto", 523: "weapon_knife_widowmaker",
  525: "weapon_knife_skeleton", 526: "weapon_knife_kukri",
};

// ─── gracze (SteamID64 + hasło) ────────────────────────────────
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}
function loadPlayers() {
  const players = readJson(PLAYERS_FILE, null);
  if (!players) {
    const DEFAULT_PLAYERS = {
      "76561199480761391": "zmien-to-haslo",
      "76561199460584489": "Orzech123L",
      "76561199663460221": "Malaka123KK",
      "76561198657310841": "123",
    };
    writeJson(PLAYERS_FILE, DEFAULT_PLAYERS);
    console.log("! Utworzyłem players.json — wpisz tam znajomych (SteamID64: hasło)");
    return DEFAULT_PLAYERS;
  }
  return players;
}

function checkPassword(steamId, password) {
  const players = loadPlayers();               // czytane na bieżąco — możesz edytować plik bez restartu
  const expected = players[String(steamId)];
  if (!expected) return false;
  const a = Buffer.from(String(password));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ─── baza + malowania ──────────────────────────────────────────
let pool;
const getPool = () => {
  if (!pool) {
    pool = mysql.createPool({
      ...DB,
      waitForConnections: true,
      connectionLimit: 4,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
    // zerwane polaczenie z MariaDB nie moze wywalic calego serwera
    pool.on("error", (err) => {
      console.error("! blad puli MySQL:", err.code || err.message);
      try { pool.end().catch(() => {}); } catch {}
      pool = null;
    });
  }
  return pool;
};

async function dbPing() {
  const c = await getPool().getConnection();
  try { await c.ping(); } finally { c.release(); }
}

let paintIndex = null;   // dokladne klucze (bron|skin, z faza)
let paintPhases = null;  // bron|pattern -> { faza: paint_index }

const norm = (v) =>
  String(v ?? "")
    .replace(/^★\s*/, "")
    .replace(/StatTrak™?\s*/gi, "")
    .replace(/^Souvenir\s+/i, "")
    .replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i, "")
    .replace(/[™★|]/g, " ")
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9']+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
const key = (w, s) => norm(w) + "|" + norm(s);

// nazwy faz, ktore MUSZA sie zgadzac (inaczej noz wyglada inaczej niz napis)
const PHASE_WORDS = [
  "ruby", "sapphire", "black pearl", "emerald",
  "phase 1", "phase 2", "phase 3", "phase 4",
];
function splitPhase(skinName) {
  const n = norm(skinName);
  for (const p of PHASE_WORDS) {
    if (n === p) return { base: "", phase: p };
    if (n.endsWith(" " + p)) return { base: n.slice(0, -(p.length + 1)).trim(), phase: p };
  }
  return { base: n, phase: "" };
}

async function loadPaintIndex() {
  if (paintIndex) return paintIndex;
  const cache = path.join(HERE, "skins-cache.json");
  let list = readJson(cache, null);
  if (!Array.isArray(list) || list.length === 0) {
    const url = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json";
    const res = await fetch(url);
    if (!res.ok) throw new Error("Nie udalo sie pobrac listy malowan: HTTP " + res.status);
    list = await res.json();
    try { writeJson(cache, list); } catch {}
  }

  paintIndex = {};
  paintPhases = {};
  const put = (w, s, idx) => {
    const k = key(w, s);
    if (k.endsWith("|") || k.startsWith("|")) return;
    if (paintIndex[k] == null) paintIndex[k] = Number(idx);
  };

  for (const s of list) {
    if (s.paint_index == null) continue;
    const weapon = (s.weapon?.name || "").trim();
    if (!weapon) continue;
    const pattern = (s.pattern?.name || "").trim();
    const phase = (s.phase || "").trim();
    const full = (s.name || "").trim();
    const afterPipe = full.includes("|") ? full.split("|").slice(1).join("|").trim() : "";
    const names = [...new Set([pattern, afterPipe].filter(Boolean))];

    for (const base of names) {
      if (phase) {
        // warianty z faza — zawsze dokladne
        put(weapon, base + " " + phase, s.paint_index);
        put(weapon, base + " (" + phase + ")", s.paint_index);
        const pk = key(weapon, base);
        (paintPhases[pk] ??= {})[norm(phase)] = Number(s.paint_index);
      } else {
        put(weapon, base, s.paint_index);
      }
    }
  }

  // dla skinow fazowych bez podanej fazy: domyslnie Phase 1 (nie Black Pearl!)
  for (const [pk, phases] of Object.entries(paintPhases)) {
    if (paintIndex[pk] != null) continue;
    const pick =
      phases["phase 1"] ?? phases["phase 2"] ?? phases["phase 3"] ?? phases["phase 4"] ??
      Object.values(phases)[0];
    if (pick != null) paintIndex[pk] = pick;
  }

  console.log("  \u21b3 wczytano " + Object.keys(paintIndex).length + " malowan");
  return paintIndex;
}

/**
 * Zwraca { paint, label } albo null.
 * Gdy w nazwie jest faza (Ruby/Sapphire/Phase X/Emerald/Black Pearl),
 * dopasowanie MUSI trafic w te faze — zadnych podmianek na inna.
 */
function resolvePaint(weaponName, skinName) {
  const paints = paintIndex || {};
  const direct = paints[key(weaponName, skinName)];
  const { base, phase } = splitPhase(skinName);

  if (!phase) return direct == null ? null : { paint: direct, label: skinName };

  const pk = key(weaponName, base);
  const byPhase = paintPhases?.[pk]?.[phase];
  if (byPhase != null) return { paint: byPhase, label: base + " " + phase };

  // faza podana, ale nie znaleziona dla tej broni -> lepiej nie zakladac nic
  if (direct != null) return { paint: direct, label: skinName };
  return null;
}

async function applyLoadout(steamid, loadout) {
  const db = getPool();
  const paints = await loadPaintIndex();
  let applied = 0;

  for (const side of ["CT", "T"]) {
    const team = TEAM[side];
    const picks = loadout?.[side] || {};
    for (const [weaponName, pick] of Object.entries(picks)) {
      const defindex = DEFINDEX[weaponName];
      if (!defindex) { console.warn(`  ! nieznana broń: "${weaponName}"`); continue; }
      const found = resolvePaint(weaponName, pick.skin);
      if (!found) { console.warn(`  ! nieznane malowanie: "${weaponName} | ${pick.skin}"`); continue; }
      const paint = found.paint;
      console.log(`    - ${weaponName} | ${found.label} -> paint ${paint}`);
      const st = pick.st ? 1 : 0;
      const wear = Number.isFinite(Number(pick.wear)) ? Math.min(1, Math.max(0, Number(pick.wear))) : 0.01;
      const seed = Number.isFinite(Number(pick.seed)) ? Math.max(0, Math.trunc(Number(pick.seed))) : 0;

      await db.execute(
        `INSERT INTO wp_player_skins
           (steamid, weapon_team, weapon_defindex, weapon_paint_id, weapon_wear, weapon_seed, weapon_stattrak)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE weapon_paint_id = VALUES(weapon_paint_id),
                                 weapon_wear = VALUES(weapon_wear),
                                 weapon_seed = VALUES(weapon_seed),
                                 weapon_stattrak = VALUES(weapon_stattrak)`,
        [steamid, team, defindex, paint, wear, seed, st],
      );
      if (KNIFE_ENTITY[defindex]) {
        await db.execute(
          `INSERT INTO wp_player_knife (steamid, weapon_team, knife) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE knife = VALUES(knife)`,
          [steamid, team, KNIFE_ENTITY[defindex]],
        );
      }
      if (defindex >= 4725 && defindex <= 5035) {
        await db.execute(
          `INSERT INTO wp_player_gloves (steamid, weapon_team, weapon_defindex) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE weapon_defindex = VALUES(weapon_defindex)`,
          [steamid, team, defindex],
        );
      }
      applied++;
    }
  }
  return applied;
}

// ─── HTTP ──────────────────────────────────────────────────────
function cors(req, res) {
  const origin = req.headers.origin || "";
  const allow = ALLOWED_ORIGINS.includes("*") ? "*" : (ALLOWED_ORIGINS.includes(origin) ? origin : "");
  if (allow) res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
}
const json = (res, code, data) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
};
const readBody = (req) => new Promise((resolve, reject) => {
  let raw = "";
  req.on("data", (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
  req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
  req.on("error", reject);
});

const isSteamId = (v) => /^\d{17}$/.test(String(v || ""));

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, "http://x");
  const route = url.pathname.replace(/\/+$/, "") || "/";

  try {
    if (route === "/health" || route === "/") {
      let db = true, dbError = null;
      try { await dbPing(); } catch (e) { db = false; dbError = e.code || e.message; }
      return json(res, 200, {
        ok: true, online: true, db, dbError,
        writes_enabled: db, time: new Date().toISOString(),
      });
    }

    if (route === "/load" && req.method === "GET") {
      const steamId = url.searchParams.get("steamId");
      if (!isSteamId(steamId)) return json(res, 400, { ok: false, error: "zły SteamID64" });
      const all = readJson(LOADOUTS_FILE, {});
      const lo = all[steamId];
      if (!lo) return json(res, 404, { ok: false, error: "brak zapisanego loadoutu" });
      return json(res, 200, { ok: true, loadout: lo.loadout, updatedAt: lo.updatedAt });
    }

    if (route === "/save" && req.method === "POST") {
      const body = await readBody(req);
      const { steamId, password, loadout } = body || {};
      if (!isSteamId(steamId)) return json(res, 400, { ok: false, error: "zły SteamID64" });
      if (!loadout || typeof loadout !== "object" || !loadout.CT || !loadout.T)
        return json(res, 400, { ok: false, error: "zły format loadoutu" });
      if (!checkPassword(steamId, password)) {
        console.log(`✗ złe hasło / nieznany gracz: ${steamId}`);
        return json(res, 403, { ok: false, error: "nieprawidłowe hasło" });
      }

      const applied = await applyLoadout(steamId, loadout);
      const all = readJson(LOADOUTS_FILE, {});
      all[steamId] = { loadout, updatedAt: new Date().toISOString() };
      writeJson(LOADOUTS_FILE, all);
      console.log(`✓ zapisano loadout ${steamId} — ${applied} przedmiotów`);
      return json(res, 200, { ok: true, applied });
    }

    return json(res, 404, { ok: false, error: "nie ma takiego endpointu" });
  } catch (e) {
    console.error("✗ błąd:", e.message);
    return json(res, 500, { ok: false, error: e.message });
  }
});

// serwer ma dzialac dalej nawet po nieoczekiwanym bledzie (inaczej strona pokazuje "offline")
process.on("uncaughtException", (e) => console.error("! nieobsluzony blad:", e?.stack || e));
process.on("unhandledRejection", (e) => console.error("! nieobsluzone odrzucenie:", e?.stack || e));
server.on("clientError", (err, socket) => { try { socket.destroy(); } catch {} });
server.keepAliveTimeout = 65000;
server.headersTimeout = 70000;

server.listen(PORT, () => {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║  LOKALNY SERWER SKINÓW CS2                 ║");
  console.log("╚════════════════════════════════════════════╝");
  console.log(`Nasłuchuję na  http://localhost:${PORT}`);
  console.log("Gracze:", Object.keys(loadPlayers()).join(", ") || "(brak — uzupełnij players.json)");
  console.log("\nZamknij to okno, żeby wyłączyć zapis skinów.\n");
});
