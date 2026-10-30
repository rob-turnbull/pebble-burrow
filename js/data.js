// Static catalogue: species, cheeses, name parts, voice lines.
export const SPECIES = {
  frog:    { label: 'moss frog',    c: '#86c46f', top: 30, secret: "i've been practising a song for you. it's mostly one note." },
  mouse:   { label: 'teacup mouse', c: '#cdbcb2', top: 38, secret: "i keep a crumb under my pillow for emergencies. it's yours." },
  fox:     { label: 'ember kit',    c: '#eb9459', top: 38, secret: "my tail is warmer than it looks. you can borrow it." },
  sheep:   { label: 'cloud lamb',   c: '#f6f3fa', top: 28, secret: "sometimes i drift a little when you're not looking." },
  hedgehog:{ label: 'button hog',   c: '#a98266', top: 30, secret: "the spikes are just for show. inside i'm all buttons." },
  owl:     { label: 'pebble owl',   c: '#9ca8cc', top: 30, secret: "i stay up a bit so you don't have to." },
  axolotl: { label: 'pond lotl',    c: '#f4aac0', top: 44, secret: "i can regrow a smile. i've done it twice today." },
  mole:    { label: 'velvet mole',  c: '#74687e', top: 42, secret: "i dug a little tunnel to your birthday. shh." }
};

export const CHEESES = [
  { id: 'cheddar', label: 'cheddar 🧀', full: 28 },
  { id: 'brie',    label: 'brie 🥐',    full: 24, joy: 6 },
  { id: 'swiss',   label: 'holey swiss', full: 22, joy: 4 },
  { id: 'crumb',   label: 'tiny crumb',  full: 8 }
];

export const FIRST = ['Pip','Wren','Tuft','Bram','Dib','Nim','Sorrel','Tansy','Quill','Puddle','Bun','Flick','Moss','Clove','Juniper','Pebble'];
export const LAST  = ['Fernsnout','Puddlehop','Crumbtoes','Mosswhisk','Thistlebum','Dewpaw','Pebbletum','Burrowbean','Clovernose','Mudwiggle','Acorncheek','Snugglefoot'];

export const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

// What a being says when the sky or weather changes.
export const WEATHER_LINES = {
  clear:   ['sunny on the hill today', 'warm pebbles! my favourite'],
  clouds:  ['the clouds are doing shapes. that one is a cheese', 'soft grey day. good for naps'],
  fog:     ['i can’t see you but i know you’re there', 'the fog tastes a bit like soup'],
  drizzle: ['tiny rain. tickly', 'i’ll be a little muddy, sorry'],
  rain:    ['rain! staying close to the door', 'the puddles are getting big ones'],
  snow:    ['SNOW. can we boing in it?', 'my toes are snowflakes now'],
  storm:   ['big noisy sky. hold my paw?', 'it’s ok. the burrow is very brave'],
  night:   ['the stars came out for you', 'sleepy o’clock'],
  dawn:    ['the sun is waking up too', 'good morning, good morning'],
  dusk:    ['the sky is going pink', 'almost bedtime for the hill'],
  cold:    ['brr. cold makes my tummy rumble']
};
