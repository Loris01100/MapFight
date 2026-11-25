import { geoContains } from 'd3-geo'
import type { Feature } from 'geojson'

export type Territory = {
  code: string // propriétaire d'origine (ISO alpha-2)
  name: string
  feature: Feature
  bounds: [[number, number], [number, number]]
  center: [number, number]
}
export type Rng = () => number

export const DIRS = {
  N: [0, 1], NE: [1, 1], E: [1, 0], SE: [1, -1],
  S: [0, -1], SO: [-1, -1], O: [-1, 0], NO: [-1, 1],
} as const
export type Dir = keyof typeof DIRS
const DIR_KEYS = Object.keys(DIRS) as Dir[]

const pick = <T>(arr: T[], rng: Rng) => arr[Math.floor(rng() * arr.length)]
const d6 = (rng: Rng) => 1 + Math.floor(rng() * 6)

export type Round = { att: number[]; def: number[]; bonus: number } // dés bruts, avant bonus et tri
export type Fight = { attackerWins: boolean; att: number[]; def: number[]; bonus: number; rerolls: number; rounds: Round[] }

// 2 dés chacun, dé bonus de l'attaquant remplace son plus faible s'il est meilleur.
// Dés triés puis comparés deux à deux ; égalité au score => tout le monde relance.
export function fight(rng: Rng): Fight {
  const rounds: Round[] = []
  for (let rerolls = 0; ; rerolls++) {
    const att = [d6(rng), d6(rng)], def = [d6(rng), d6(rng)], bonus = d6(rng)
    rounds.push({ att: [...att], def: [...def], bonus })
    const low = att[0] < att[1] ? 0 : 1
    if (bonus > att[low]) att[low] = bonus
    att.sort((a, b) => b - a)
    def.sort((a, b) => b - a)
    const score = Math.sign(att[0] - def[0]) + Math.sign(att[1] - def[1])
    if (score !== 0) return { attackerWins: score > 0, att, def, bonus, rerolls, rounds }
  }
}

const inBox = ({ bounds: [[x0, y0], [x1, y1]] }: Territory, lon: number, lat: number) =>
  lat >= y0 && lat <= y1 && (x0 <= x1 ? lon >= x0 && lon <= x1 : lon >= x0 || lon <= x1)

// ponytail: rayon par pas de 0.1° (~11 km) en lon/lat, les micro-États sont rarement touchés ; réduire le pas si besoin.
export function findDefender(ts: Territory[], owner: string[], from: number, dir: Dir, step = 0.1): number | null {
  const [dx, dy] = DIRS[dir]
  let [lon, lat] = ts[from].center
  for (let i = 0; i < 360 / step; i++) {
    lon = ((lon + dx * step + 540) % 360) - 180
    lat += dy * step
    if (lat > 90 || lat < -90) return null
    const hit = ts.findIndex((t, j) => owner[j] !== owner[from] && inBox(t, lon, lat) && geoContains(t.feature, [lon, lat]))
    if (hit >= 0) return hit
  }
  return null
}

export type Combat = Fight & { attacker: string; defender: string; from: number; to: number; dir: Dir }

// Mute `owner`. Renvoie null si aucune cible trouvée après 50 essais.
export function playTurn(ts: Territory[], owner: string[], rng: Rng = Math.random): Combat | null {
  const alive = [...new Set(owner)]
  for (let tries = 0; tries < 50; tries++) {
    const attacker = pick(alive, rng)
    const from = pick(owner.flatMap((o, i) => (o === attacker ? [i] : [])), rng)
    const dir = pick(DIR_KEYS, rng)
    const to = findDefender(ts, owner, from, dir)
    if (to === null) continue
    const defender = owner[to]
    const r = fight(rng)
    // Une défense perdue = le défenseur perd tous ses territoires.
    if (r.attackerWins) owner.forEach((o, i) => { if (o === defender) owner[i] = attacker })
    else owner[from] = defender
    return { ...r, attacker, defender, from, to, dir }
  }
  return null
}
