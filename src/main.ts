import './style.css'
import { geoBounds, geoCentroid, geoNaturalEarth1, geoPath } from 'd3-geo'
import { select } from 'd3-selection'
import { zoom } from 'd3-zoom'
import { feature, merge, mesh } from 'topojson-client'
import isoCountries from 'i18n-iso-countries'
import fr from 'i18n-iso-countries/langs/fr.json'
import world from 'world-atlas/countries-50m.json'
import type { Feature, FeatureCollection } from 'geojson'
import { playTurn, type Combat, type Territory } from './game'

isoCountries.registerLocale(fr)
const flags = import.meta.glob('/node_modules/flag-icons/flags/4x3/*.svg', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const flagUrl = (code: string) => flags[`/node_modules/flag-icons/flags/4x3/${code}.svg`]

// États membres de l'ONU (Tuvalu absent de world-atlas) + Vatican, Palestine, Taïwan, Kosovo.
const PLAYABLE = new Set('af al dz ad ao ag ar am au at az bs bh bd bb by be bz bj bt bo ba bw br bn bg bf bi cv kh cm ca cf td cl cn co km cg cr ci hr cu cy cz kp cd dk dj dm do ec eg sv gq er ee sz et fj fi fr ga gm ge de gh gr gd gt gn gw gy ht hn hu is in id ir iq ie il it jm jp jo kz ke ki kw kg la lv lb ls lr ly li lt lu mg mw my mv ml mt mh mr mu mx fm md mc mn me ma mz mm na nr np nl nz ni ne ng mk no om pk pw pa pg py pe ph pl pt qa kr ro ru rw kn lc vc ws sm st sa sn rs sc sl sg sk si sb so za ss es lk sd sr se ch sy tj th tl tg to tt tn tr tm tv ug ua ae gb tz us uy uz vu ve vn ye zm zw va ps tw xk'.split(' '))
// Géométries fusionnées dans un autre pays (un seul territoire). Les entités sans code ISO sont repérées par leur nom.
const MERGE: Record<string, string> = { gl: 'dk', eh: 'ma', Somaliland: 'so', 'N. Cyprus': 'cy', Kosovo: 'xk' }
// Îles Ashmore-et-Cartier : même code que l'Australie, ignorées pour qu'elle n'ait qu'un territoire.
const SKIP = new Set(['Ashmore and Cartier Is.'])

const geoms = (world as any).objects.countries.geometries as any[]
const groups = new Map<string, any[]>()
for (const geo of geoms) {
  if (SKIP.has(geo.properties.name)) continue
  const iso = geo.id && isoCountries.numericToAlpha2(String(geo.id))?.toLowerCase()
  const code = MERGE[iso || geo.properties.name] ?? iso
  if (PLAYABLE.has(code)) groups.set(code, [...(groups.get(code) ?? []), geo])
}
const territories: Territory[] = [...groups].map(([code, gs]) => {
  const f: Feature = gs.length === 1 ? (feature(world as any, gs[0]) as any) : { type: 'Feature', properties: {}, geometry: merge(world as any, gs) }
  const name = isoCountries.getName(code, 'fr') ?? gs[0].properties.name
  return { code, name, feature: f, bounds: geoBounds(f), center: geoCentroid(f) as [number, number] }
})
const fc: FeatureCollection = { type: 'FeatureCollection', features: territories.map((t) => t.feature) }
const owner = territories.map((t) => t.code)
const nameOf = Object.fromEntries(territories.map((t) => [t.code, t.name]))
const flag = (code: string) => (flagUrl(code) ? `<img class="flag" src="${flagUrl(code)}" alt="">` : '<img class="flag" alt="">')
const label = (code: string) => `${flag(code)}${nameOf[code]}`

// Carte
const svg = select<SVGSVGElement, unknown>('#map')
const { width, height } = svg.node()!.getBoundingClientRect()
svg.attr('viewBox', `0 0 ${width} ${height}`)
const path = geoPath(geoNaturalEarth1().fitSize([width, height], fc))
// Drapeau calé sur le plus grand polygone : sinon la France (Guyane, Réunion) n'affiche que la bande blanche.
const mainBounds = (f: Feature) => {
  const geo = f.geometry as any
  const polys = geo.type === 'MultiPolygon' ? geo.coordinates.map((coordinates: any) => ({ type: 'Polygon', coordinates })) : [geo]
  return path.bounds(polys.reduce((a: any, b: any) => (path.area(b) > path.area(a) ? b : a)))
}
const tBounds = territories.map((t) => mainBounds(t.feature))
// Géométrie topojson -> index de territoire, pour ne tracer que les frontières entre propriétaires différents.
const geomIdx = new Map([...groups.values()].flatMap((gs, i) => gs.map((geo) => [geo, i] as const)))
const ownerOfGeom = (geo: object) => { const i = geomIdx.get(geo); return i === undefined ? undefined : owner[i] }

const defs = svg.append('defs')
const g = svg.append('g')
const paths = g.selectAll('path').data(territories).join('path').attr('d', (t) => path(t.feature))
paths.append('title').text((t) => t.name)
const borders = g.append('path').attr('class', 'borders')
svg.call(zoom<SVGSVGElement, unknown>().scaleExtent([1, 40]).on('zoom', (e) => g.attr('transform', e.transform)))

// Un seul drapeau par empire, étalé sur l'ensemble de ses territoires.
const paint = () => {
  const box = new Map<string, number[]>()
  owner.forEach((o, i) => {
    const [[x0, y0], [x1, y1]] = tBounds[i]
    const b = box.get(o)
    box.set(o, b ? [Math.min(b[0], x0), Math.min(b[1], y0), Math.max(b[2], x1), Math.max(b[3], y1)] : [x0, y0, x1, y1])
  })
  defs.selectAll('pattern').data([...box], (d: any) => d[0]).join((e) => {
    const p = e.append('pattern').attr('id', (d) => `f-${d[0]}`).attr('patternUnits', 'userSpaceOnUse')
    p.append('image').attr('preserveAspectRatio', 'xMidYMid slice').attr('href', (d) => flagUrl(d[0]) ?? null)
    return p
  })
    .attr('x', (d) => d[1][0]).attr('y', (d) => d[1][1]).attr('width', (d) => d[1][2] - d[1][0]).attr('height', (d) => d[1][3] - d[1][1])
    .select('image').attr('width', (d) => d[1][2] - d[1][0]).attr('height', (d) => d[1][3] - d[1][1])
  paths.attr('fill', (_, i) => (flagUrl(owner[i]) ? `url(#f-${owner[i]})` : '#888'))
  borders.attr('d', path(mesh(world as any, (world as any).objects.countries, (a: object, b: object) => a === b || ownerOfGeom(a) !== ownerOfGeom(b))))
}

// Panneaux
const $ = (id: string) => document.getElementById(id)!
let turn = 0

function renderStats() {
  const counts = new Map<string, number>()
  for (const o of owner) counts.set(o, (counts.get(o) ?? 0) + 1)
  const sorted = [...counts].sort((a, b) => b[1] - a[1] || nameOf[a[0]].localeCompare(nameOf[b[0]]))
  const li = ([c, n]: [string, number]) => `<li>${label(c)} — ${n}</li>`
  $('top').innerHTML = sorted.slice(0, 5).map(([c, n]) => `<li>${flag(c)}${nameOf[c]}<span class="n">${n}</span></li>`).join('')
  $('alive').textContent = String(sorted.length)
  $('all').innerHTML = sorted.map(li).join('')
  $('all-title').textContent = `Liste complète (${sorted.length} pays en vie)`
  return sorted.length
}

function renderCombat(c: Combat) {
  const won = c.attackerWins ? c.attacker : c.defender
  const li = document.createElement('li')
  li.innerHTML = `<b>T${turn}</b> ${label(c.attacker)} (${c.dir}) ⚔ ${label(c.defender)}<br>
    [${c.att}] (bonus ${c.bonus}) vs [${c.def}]${c.rerolls ? ` — ${c.rerolls} relance(s)` : ''}<br>
    <span class="${c.attackerWins ? 'win' : 'lose'}">${nameOf[won]} prend ${c.attackerWins ? `tous les territoires de ${nameOf[c.defender]}` : `le territoire ${territories[c.from].name}`}</span>`
  $('history').prepend(li)
  paths.classed('att', (_, i) => i === c.from).classed('def', (_, i) => i === c.to)
  paths.filter('.att, .def').raise()
}

function update() {
  paint()
  const alive = renderStats()
  if (alive === 1) {
    $('status').innerHTML = `🏆 ${label(owner[0])} conquiert le monde en ${turn} tours !`
    ;($('next') as HTMLButtonElement).disabled = true
  }
}

$('next').addEventListener('click', () => {
  const c = playTurn(territories, owner)
  if (!c) return void ($('status').textContent = 'Aucune cible trouvée, réessaie.')
  turn++
  $('status').textContent = ''
  renderCombat(c)
  update()
})

update()
