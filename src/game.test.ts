import { expect, test } from 'vitest'
import { geoBounds, geoCentroid } from 'd3-geo'
import type { Feature } from 'geojson'
import { fight, findDefender, playTurn, type Territory } from './game'

// rng qui renvoie les dés voulus (valeur 1..6)
const dice = (...v: number[]) => () => (v.shift()! - 1) / 6

test('bonus remplace le plus petit dé, comparaison dé par dé', () => {
  // att 1,3 bonus 6 => 6,3 ; def 5,2 => att gagne 2 duels
  expect(fight(dice(1, 3, 5, 2, 6))).toMatchObject({ attackerWins: true, att: [6, 3], def: [5, 2], rerolls: 0 })
  // att 4,1 bonus 1 => 4,1 ; def 6,6 => def gagne
  expect(fight(dice(4, 1, 6, 6, 1)).attackerWins).toBe(false)
})

test('1 duel chacun => relance', () => {
  // 6,1 vs 5,2 (1-1) puis 3,3 vs 3,2 (égalité + victoire att)
  expect(fight(dice(6, 1, 5, 2, 1, 3, 3, 3, 2, 1))).toMatchObject({ attackerWins: true, rerolls: 1 })
})

const square = (code: string, x: number, y: number): Territory => {
  const feature: Feature = { type: 'Feature', properties: {}, geometry: { type: 'Polygon',
    coordinates: [[[x, y], [x, y + 2], [x + 2, y + 2], [x + 2, y], [x, y]]] } }
  return { code, name: code, feature, bounds: geoBounds(feature), center: geoCentroid(feature) as [number, number] }
}

test('boussole : premier territoire ennemi dans la direction, en passant l\'antiméridien', () => {
  const ts = [square('a', 0, 0), square('b', 10, 0), square('c', 0, 10), square('d', -10, 0), square('e', 10, 10)]
  const owner = ts.map((t) => t.code)
  expect(findDefender(ts, owner, 0, 'E')).toBe(1)
  expect(findDefender(ts, owner, 0, 'N')).toBe(2)
  expect(findDefender(ts, owner, 0, 'NE')).toBe(4)
  expect(findDefender(ts, owner, 1, 'E')).toBe(3) // fait le tour du globe
  expect(findDefender(ts, owner, 0, 'S')).toBe(null)
  owner[1] = 'a' // territoire allié ignoré
  expect(findDefender(ts, owner, 0, 'E')).toBe(3)
})

test('le perdant cède son territoire', () => {
  const ts = [square('a', 0, 0), square('b', 10, 0)]
  const owner = ['a', 'b']
  // attaquant a, territoire 0, dir E(index 2) ; att 1,1 bonus 1 vs def 6,6
  const c = playTurn(ts, owner, dice(1, 1, 3, 1, 1, 6, 6, 1))!
  expect(c).toMatchObject({ attacker: 'a', defender: 'b', from: 0, to: 1, attackerWins: false })
  expect(owner).toEqual(['b', 'b'])
})

test('une défense perdue coûte tous les territoires', () => {
  const ts = [square('a', 0, 0), square('b', 10, 0), square('b2', 50, 50)]
  const owner = ['a', 'b', 'b']
  // attaquant a, territoire 0, dir E ; att 6,6 bonus 1 vs def 1,1
  const c = playTurn(ts, owner, dice(1, 1, 3, 6, 6, 1, 1, 1))!
  expect(c).toMatchObject({ attacker: 'a', defender: 'b', attackerWins: true })
  expect(owner).toEqual(['a', 'a', 'a'])
})
