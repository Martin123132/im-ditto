'use strict';
const {randomUUID} = require('node:crypto');
const C = { mint:'#c4eadb', amber:'#f5d596', lilac:'#d8d2f2', coral:'#f3b6a3', blue:'#c3dce9', paper:'#ede9df' };
const rules = [
'THE IDEA',
'You are the last couriers out after dusk. Light the four corner lanterns, collect their marks on your route passport, then return to the Posthouse. The first courier home with all four marks wins.',
'',
'WHAT YOU NEED',
'The 5 × 5 board, all 24 route cards, one coloured pawn and one route passport per player, and a pencil. Everything except the pencil is in this kit. Fold each pawn on its dashed centre line into a small tent.',
'',
'SETUP',
'Play with 2–4 people. Everyone puts their pawn on the centre Posthouse. Give each player a route passport. Shuffle all route cards into one face-down deck and deal three to each player. The player who most recently posted a letter starts; play clockwise.',
'',
'YOUR TURN',
'1. Play one card from your hand face up into the discard pile. Follow its movement text. “Up to” lets you take fewer steps, including zero. Stay inside the board. An orthogonal step goes to a space sharing an edge; a diagonal step goes to a space sharing a corner. Spaces and paths have no hidden effects. Pawns may share or pass through any space.',
'2. When all movement from your card or cards is finished, check your final space. If it is a corner lantern you have not marked before, tick that lantern on your passport. Passing through a lantern does not mark it. You can mark at most one lantern each turn.',
'3. Draw back up to three cards. If the draw deck is empty, shuffle the discard pile into a new deck, including the cards just played. A card that allows an extra play resolves completely before drawing.',
'',
'THE FOUR LANTERNS',
'Orchard • top left. Observatory • top right. Harbour • bottom left. Workshop • bottom right. Visit them in any order. Your passport, not the shared board, records your own four visits.',
'',
'FINISH',
'After collecting all four marks, finish a later turn on the centre Posthouse to win immediately. If you return there without all four marks, play continues. There is no blocking, stealing, elimination or special tie-break.',
'',
'CARD NOTES',
'Night Express follows one straight row or column. Corner Cut uses diagonal steps. Side Street makes its optional diagonal step after its orthogonal steps. Cross-Town chooses any space in your current row or column, including the space you occupy. Lamplight may exchange one card still in your hand: discard it and draw one before the normal refill. Second Wind may play one extra card still in your hand; after both cards resolve, mark only the final space and then refill to three.',
'',
'PROTOTYPE NOTE',
'An original demonstration for this workshop. The rules and component counts are internally checked; balance and the 15–25 minute estimate have not been established by a human playtest. Try it, take notes, and make your own version.'
].join('\n');
function board(rows = 5, cols = 5) {
  const names = ['Orchard','Apple Walk','North Bridge','Star Lane','Observatory','Hedge Row','Willow Turn','Clock Alley','Maple Steps','Moon Walk','West Gate','Paper Lane','Posthouse','Copper Row','East Gate','Tide Path','Ink Street','Lantern Way','Ember Lane','Tool Row','Harbour','Quay Walk','South Bridge','Foundry Lane','Workshop'];
  const cells = Array.from({length: rows * cols}, (_, i) => ({label: rows === 5 && cols === 5 ? names[i] : 'Space ' + (i + 1), kind:'path', color:C.paper}));
  if (rows === 5 && cols === 5) {
    for (const [i,colour] of [[0,C.mint],[4,C.lilac],[20,C.blue],[24,C.coral]]) Object.assign(cells[i], {kind:'landmark',color:colour});
    Object.assign(cells[12], {kind:'home',color:C.amber});
  }
  return {rows,cols,cells};
}
function cards() {
  return [
    ['Stroll','Move up to 2 orthogonal steps. You may change direction.',6,C.mint,'Everyday route'],
    ['Wayfinder','Move up to 3 orthogonal steps. You may change direction after any step.',4,C.blue,'Everyday route'],
    ['Night Express','Move up to 4 orthogonal steps in one straight direction.',3,C.lilac,'Straight line'],
    ['Side Street','Move up to 2 orthogonal steps, then you may take 1 diagonal step.',3,C.coral,'Mixed route'],
    ['Corner Cut','Move up to 2 diagonal steps. You may change direction.',3,C.amber,'Diagonal route'],
    ['Lamplight','Move up to 1 orthogonal step. You may discard one other card from your hand and draw one before refilling.',2,C.mint,'Refresh'],
    ['Cross-Town','Move to any space in your current row or column.',2,C.blue,'Open route'],
    ['Second Wind','Move up to 1 orthogonal step. You may play one more card from your hand. Mark only your final space, then refill to three.',1,C.coral,'Extra play']
  ].map(([title,body,quantity,color,tag])=>({id:randomUUID(),title,body,quantity,color,tag}));
}
function template(name, demo = false) {
  return {name:name || (demo ? 'Lantern Circuit' : 'Untitled game'),tagline:demo?'Four lanterns. One last route home.':'An idea worth bringing to the table.',players:{min:2,max:4},minutes:20,rules:demo?rules:'GOAL\nWhat are players trying to do?\n\nSETUP\nWhat goes on the table?\n\nON YOUR TURN\nWhat choices can a player make?\n\nENDING\nHow does the game finish?',cards:demo?cards():[],board:board()};
}
module.exports = {template,board,colors:C,rules};
