// Display-name moderation: names that pass for the project, its author or staff, and a short list of common slurs and swear words.
// Matching folds case, accents, look-alike digits and symbols, and ignores spaces and punctuation.
const FOLD = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };
// Cyrillic and Greek letters that look like Latin ones.
const LOOK = { а: 'a', в: 'b', с: 'c', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', т: 't', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ԛ: 'q', ԝ: 'w', ӏ: 'l', ғ: 'f', ɡ: 'g',
  α: 'a', β: 'b', γ: 'y', ε: 'e', ζ: 'z', η: 'n', ι: 'i', κ: 'k', μ: 'u', ν: 'v', ο: 'o', ρ: 'p', σ: 'o', τ: 't', υ: 'u', χ: 'x', ω: 'w' };
const unlook = (s) => s.replace(/[\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufeff\u00ad]/g, '').toLowerCase().replace(/[\u0370-\u03ff\u0400-\u052f\u0250-\u02af]/g, (c) => LOOK[c] || c);
const squash = (s) => unlook(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[01345789@$!|+]/g, (c) => FOLD[c]).replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
const fold = (list) => list.map(squash);

// Impersonation. The project and its author match anywhere in the name. Role words match as the whole name or as its first or
// last word part, so "Systemic" and "Rooted" stay fine while "Admin Ada" and "Ada (staff)" do not.
const RESERVED_ANYWHERE = fold(['systemdesigner', 'adityareddy', 'adireddy', 'adityareddydev', 'eightfold']);
const RESERVED_EXACT = fold(['aditya', 'system', 'root', 'owner', 'founder', 'devteam', 'gamemaster', 'support', 'sysadmin']);
const RESERVED_EDGE = fold(['admin', 'administrator', 'moderator', 'official', 'staff']);

// Rude words. Long ones match anywhere. Short ones that hide inside ordinary words (grape, Dickens, Cockburn) match only as the whole name.
const RUDE_ANYWHERE = fold(['fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'whore', 'asshole', 'pussy', 'hitler', 'wanker', 'bollocks', 'rapist', 'tranny']);
const RUDE_EXACT = fold(['fag', 'dick', 'cock', 'cum', 'rape', 'spic', 'kike', 'chink', 'slut', 'porn', 'penis', 'vagina', 'bastard', 'twat', 'nazi', 'anal', 'sex']);

// Real words and places that contain a rude string.
const OK = fold(['scunthorpe', 'shitake', 'shiitake', 'assassin', 'cocktail', 'peacock', 'hancock']);

// Returns null when the name is fine, or 'reserved' / 'rude'.
export function nameProblem(name) {
  let k = squash(String(name));
  for (const w of OK) k = k.split(w).join('');
  if (!k) return null;
  if (RESERVED_ANYWHERE.some((r) => k.includes(r)) || RESERVED_EXACT.includes(k) || RESERVED_EDGE.some((r) => k === r || k.startsWith(r) || k.endsWith(r))) return 'reserved';
  if (RUDE_ANYWHERE.some((w) => k.includes(w)) || RUDE_EXACT.includes(k)) return 'rude';
  return null;
}
