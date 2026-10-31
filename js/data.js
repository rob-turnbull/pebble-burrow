// Static catalogue: species, cheeses, name parts, voice lines.
export const SPECIES = {
  frog:    { label: 'moss frog',    c: '#86c46f', top: 30, secret: "i've been practising a song for you. it's mostly one note." },
  mouse:   { label: 'teacup mouse', c: '#cdbcb2', top: 38, secret: "i keep a crumb under my pillow for emergencies. it's yours." },
  fox:     { label: 'ember kit',    c: '#eb9459', top: 38, secret: "my tail is warmer than it looks. you can borrow it." },
  sheep:   { label: 'cloud lamb',   c: '#f6f3fa', top: 28, secret: "sometimes i drift a little when you're not looking." },
  hedgehog:{ label: 'button hog',   c: '#a98266', top: 30, secret: "the spikes are just for show. inside i'm all buttons." },
  owl:     { label: 'pebble owl',   c: '#9ca8cc', top: 30, secret: "i stay up a bit so you don't have to." },
  axolotl: { label: 'pond lotl',    c: '#f4aac0', top: 44, secret: "i can regrow a smile. i've done it twice today." },
  mole:    { label: 'velvet mole',  c: '#74687e', top: 42, secret: "i dug a little tunnel to your birthday. shh." },
  bunny:   { label: 'clover bunny', c: '#efe4d6', top: 34, secret: "i can hear you coming from three hills away. i always run to the door." },
  duckling:{ label: 'puddle duck',  c: '#f6d867', top: 36, secret: "i practise quacking quietly so i don't wake you." },
  redpanda:{ label: 'ember panda',  c: '#c8613a', top: 36, secret: "i've been counting the stripes on my tail. there's one for every day we've had." },
  otter:   { label: 'river otter',  c: '#9a7457', top: 38, secret: "this is my favourite pebble. i want you to have it. (i'll keep it safe for you.)" },
  penguin: { label: 'tuxedo chick', c: '#3e4a63', top: 30, secret: "i'm not cold, i'm just dressed for a party." },
  bear:    { label: 'honey cub',    c: '#a87452', top: 30, secret: "i hibernate a little bit every afternoon. it's practice." },
  snail:   { label: 'shell snail',  c: '#b8d49a', top: 42, secret: "my shell is a burrow too. you're invited." },
  bat:     { label: 'dusk bat',     c: '#6d5b86', top: 34, secret: "i hang upside down so i can see the hill the other way." }
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

// Growth: stages come from how many different days a being was tended.
export const STAGES = [
  { id: 'sprout', label: 'sprout', from: 0 },
  { id: 'young',  label: 'young',  from: 7 },
  { id: 'grown',  label: 'grown',  from: 30 }
];

// Wearables. `unlock` is checked by engine.unlockedWear(); `hint` shows while locked.
export const WEARABLES = [
  { id: 'flowers', label: 'flower crown', hint: 'unlocks when they grow young' },
  { id: 'scarf',   label: 'cosy scarf',   hint: 'unlocks after 10 feasts' },
  { id: 'bow',     label: 'big bow',      hint: 'unlocks after 25 hugs' },
  { id: 'star',    label: 'star badge',   hint: 'unlocks when they’re grown' },
  { id: 'pumpkin', label: 'pumpkin hat',  hint: 'unlocks at halloween' },
  { id: 'party',   label: 'party hat',    hint: 'unlocks on your birthday' }
];

export const SEASON_LINES = {
  halloween: ['the pumpkins are watching. nicely.', 'boo! (did it work?)', 'i want to be a ghost but i keep giggling'],
  costume:   ['HAPPY HALLOWEEN. do you like my hat?', 'trick or cheese!'],
  autumn:    ['crunchy leaves are the best leaves', 'i caught a leaf. it was a slow one'],
  winter:    ['the lights make the door look cosy', 'winter is just a long nap season'],
  spring:    ['the petals are tickling my nose', 'everything smells green'],
  summer:    ['warm grass, big naps', 'the hill is all buzzy'],
  newyear:   ['new year! same burrow. best burrow.']
};
