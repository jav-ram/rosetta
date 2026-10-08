/** Fantasy-flavoured filler text. Avoids `:`, `#` and quotes so it is safe inside YAML fields and directive attributes. */
const nouns = ["lantern", "crypt", "bridge", "raven", "ledger", "thorn", "oath", "furnace", "caravan", "archive", "hollow", "banner", "relic", "marsh", "tower", "vault", "ember", "tide", "pilgrim", "gate"];
const adjectives = ["ancient", "hollow", "silent", "gilded", "forgotten", "crooked", "pale", "restless", "sunken", "bitter", "hidden", "broken", "distant", "faded", "wary"];
const verbs = ["guards", "hides", "remembers", "follows", "watches", "binds", "crosses", "burns", "carries", "breaks", "whispers to", "shelters"];
const places = ["the old road", "the lower halls", "the salt flats", "the temple stairs", "the drowned market", "the north gate", "the ash fields", "the river camp"];
const creatures = ["Warden", "Stalker", "Hound", "Wraith", "Drake", "Golem", "Witch", "Sentinel", "Crawler", "Harrier"];

export const cap = (s) => s[0].toUpperCase() + s.slice(1);

export function sentence(rng) {
  const a = rng.pick(adjectives);
  const n = rng.pick(nouns);
  switch (rng.int(0, 4)) {
    case 0: return `The ${a} ${n} ${rng.pick(verbs)} ${rng.pick(places)}.`;
    case 1: return `Travelers say that a ${a} ${n} ${rng.pick(verbs)} everything near ${rng.pick(places)}.`;
    case 2: return `If the party reaches ${rng.pick(places)} before dusk, the ${n} will not ${rng.pick(["follow", "wake", "notice them", "yield"])}.`;
    case 3: return `Nothing about the ${a} ${n} is as it seems, and ${rng.pick(places)} keeps its secrets well.`;
    default: return `A ${a} ${rng.pick(nouns)} marks the way, and the ${n} ${rng.pick(verbs)} those who pass.`;
  }
}

export function paragraph(rng) {
  const parts = [];
  const count = rng.int(3, 5);
  for (let i = 0; i < count; i++) {
    let s = sentence(rng);
    if (i === 1 && rng.next() < 0.3) s = s.replace(/\b(\w+)\b/, "**$1**");
    if (i === 2 && rng.next() < 0.3) s = s.replace(/\b(ancient|silent|pale|hidden)\b/, "*$1*");
    parts.push(s);
  }
  return parts.join(" ");
}

export const title = (rng) => `The ${cap(rng.pick(adjectives))} ${cap(rng.pick(nouns))}`;
export const creatureName = (rng) => `${cap(rng.pick(adjectives))} ${rng.pick(creatures)}`;
export const shortPhrase = (rng) => `${cap(rng.pick(adjectives))} ${rng.pick(nouns)}`;
