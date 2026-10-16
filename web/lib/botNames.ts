// Catalog of cool names for agents ("bots"): 50 feminine, 50 masculine and 50 unisex. Used by the «Sugerir nombre» button in Equipos.
export type NameGender = 'female' | 'male' | 'unisex'

export const GENDER_LABEL: Record<NameGender, string> = { female: 'Femenino', male: 'Masculino', unisex: 'Unisex' }

export const BOT_NAMES: Record<NameGender, string[]> = {
  female: [
    'Nova', 'Luna', 'Aria', 'Vega', 'Lyra', 'Zara', 'Iris', 'Eva', 'Ada', 'Luz',
    'Nyx', 'Kira', 'Lumi', 'Maya', 'Nora', 'Alba', 'Aura', 'Cleo', 'Dara', 'Eris',
    'Faye', 'Gala', 'Hera', 'Isis', 'Juno', 'Kaia', 'Lexa', 'Mira', 'Nia', 'Ona',
    'Pía', 'Rhea', 'Sia', 'Tara', 'Uma', 'Vera', 'Xena', 'Yara', 'Zoe', 'Ava',
    'Elara', 'Selene', 'Atenea', 'Circe', 'Dafne', 'Electra', 'Helena', 'Ixchel', 'Minerva', 'Valkiria',
  ],
  male: [
    'Atlas', 'Orion', 'Bolt', 'Zeus', 'Max', 'Rex', 'Axel', 'Titán', 'Ryker', 'Neo',
    'Zed', 'Hugo', 'Leo', 'Kai', 'Dax', 'Finn', 'Gus', 'Hal', 'Ike', 'Jax',
    'Kane', 'Lars', 'Milo', 'Nash', 'Otto', 'Pax', 'Rafa', 'Theo', 'Ulises', 'Vlad',
    'Wolf', 'Xavi', 'Yago', 'Zane', 'Apolo', 'Bruno', 'Cosmo', 'Dante', 'Eros', 'Félix',
    'Goliat', 'Hades', 'Ícaro', 'Jano', 'Kratos', 'Loki', 'Marte', 'Odín', 'Pegaso', 'Quetzal',
  ],
  unisex: [
    'Pixel', 'Byte', 'Echo', 'Nexus', 'Sage', 'Sol', 'Wren', 'River', 'Ash', 'Sky',
    'Onyx', 'Cipher', 'Quark', 'Glitch', 'Spark', 'Bit', 'Rune', 'Vector', 'Flux', 'Zen',
    'Alex', 'Ray', 'Robin', 'Jade', 'Indigo', 'Ember', 'Frost', 'Halo', 'Ion', 'Jet',
    'Kilo', 'Lux', 'Mono', 'Neon', 'Orbit', 'Prism', 'Quasar', 'Radar', 'Sigma', 'Turbo',
    'Vortex', 'Warp', 'Xeno', 'Yin', 'Zero', 'Delta', 'Chip', 'Beta', 'Nano', 'Átomo',
  ],
}

/** Avatar faces (0–20) drawn as feminine; every other face is masculine. Used only to pre-select the gender in the picker. */
export const FEMALE_FACES = [6, 7, 11]
export const defaultGender = (face: number): NameGender => (FEMALE_FACES.includes(face) ? 'female' : 'unisex')

const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * A random name of the given gender, avoiding the ones in `taken` (names already used in the team, and the current one) so
 * pressing the button never suggests the same name twice in a row. If every name is taken, any name of that gender.
 */
export function suggestName(gender: NameGender, taken: string[] = [], rnd: () => number = Math.random): string {
  const used = new Set(taken.map(norm))
  const pool = BOT_NAMES[gender]
  const free = pool.filter((n) => !used.has(norm(n)))
  const from = free.length ? free : pool
  return from[Math.min(from.length - 1, Math.floor(rnd() * from.length))]
}
