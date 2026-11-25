import './style.css'
import { geoBounds, geoCentroid, geoNaturalEarth1, geoPath } from 'd3-geo'
import { select } from 'd3-selection'
import { zoom } from 'd3-zoom'
import { feature } from 'topojson-client'
import isoCountries from 'i18n-iso-countries'
import fr from 'i18n-iso-countries/langs/fr.json'
import world from 'world-atlas/countries-50m.json'
import type { Feature, FeatureCollection } from 'geojson'
import { playTurn, type Combat, type Territory } from './game'

isoCountries.registerLocale(fr)
const flags = import.meta.glob('/node_modules/flag-icons/flags/4x3/*.svg', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const flagUrl = (code: string) => flags[`/node_modules/flag-icons/flags/4x3/${code}.svg`]

// Territoires sans code ISO dans world-atlas. Indian Ocean Ter. et Siachen Glacier ne sont pas des pays : ignorés.
const NO_ISO: Record<string, string> = { Kosovo: 'xk', Somaliland: 'somaliland', 'N. Cyprus': 'n-cyprus' }
// Îles Ashmore-et-Cartier : même code que l'Australie, ignorées pour qu'elle n'ait qu'un territoire.
const SKIP = new Set(['Ashmore and Cartier Is.'])

const fc = feature(world as any, (world as any).objects.countries) as unknown as FeatureCollection
const territories: Territory[] = fc.features.flatMap((f: Feature) => {
  const geoName = f.properties!.name as string
  if (SKIP.has(geoName)) return []
  const code = f.id ? isoCountries.numericToAlpha2(String(f.id))?.toLowerCase() : NO_ISO[geoName]
  if (!code) return []
  const name = isoCountries.getName(code, 'fr') ?? geoName
  return [{ code, name, feature: f, bounds: geoBounds(f), center: geoCentroid(f) as [number, number] }]
})
const owner = territories.map((t) => t.code)
const nameOf = Object.fromEntries(territories.map((t) => [t.code, t.name]))
const flag = (code: string) => (flagUrl(code) ? `<img class="flag" src="${flagUrl(code)}" alt="">` : '<img class="flag" alt="">')
const label = (code: string) => `${flag(code)}${nameOf[code]}`

// Carte
const svg = select<SVGSVGElement, unknown>('#map')
const { width, height } = svg.node()!.getBoundingClientRect()
svg.attr('viewBox', `0 0 ${width} ${height}`)
const path = geoPath(geoNaturalEarth1().fitSize([width, height], fc))
const defs = svg.append('defs')
for (const code of new Set(owner)) {
  if (!flagUrl(code)) continue
  defs.append('pattern').attr('id', `f-${code}`).attr('patternContentUnits', 'objectBoundingBox').attr('width', 1).attr('height', 1)
    .append('image').attr('href', flagUrl(code)).attr('width', 1).attr('height', 1).attr('preserveAspectRatio', 'none')
}
const g = svg.append('g')
const paths = g.selectAll('path').data(territories).join('path').attr('d', (t) => path(t.feature))
paths.append('title').text((t) => t.name)
svg.call(zoom<SVGSVGElement, unknown>().scaleExtent([1, 40]).on('zoom', (e) => g.attr('transform', e.transform)))

const paint = () => paths.attr('fill', (_, i) => (flagUrl(owner[i]) ? `url(#f-${owner[i]})` : '#888'))

// Panneaux
const $ = (id: string) => document.getElementById(id)!
let turn = 0

function renderStats() {
  const counts = new Map<string, number>()
  for (const o of owner) counts.set(o, (counts.get(o) ?? 0) + 1)
  const sorted = [...counts].sort((a, b) => b[1] - a[1] || nameOf[a[0]].localeCompare(nameOf[b[0]]))
  const li = ([c, n]: [string, number]) => `<li>${label(c)} — ${n}</li>`
  $('top').innerHTML = sorted.slice(0, 5).map(li).join('')
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
  $('status').innerHTML = `Tour ${turn} : ${label(c.attacker)} tire <b>${c.dir}</b> → ${label(c.defender)}`
  renderCombat(c)
  update()
})

update()
