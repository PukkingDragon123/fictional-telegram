// Trophies: checked about once a second; each pays a one-off coin reward.
export const ACHIEVEMENTS = [
  { id: 'a_first', name: 'First Customer', desc: 'Serve your first bear.', reward: 15, test: (g) => g.stats.bearsServed >= 1 },
  { id: 'a_love', name: 'Love Is in the Water', desc: '10 fish couples fall in love.', reward: 25, test: (g) => g.stats.courtships >= 10 },
  { id: 'a_full', name: 'Full House', desc: 'Fill the pond to capacity.', reward: 30, test: (g) => g.fish.count >= g.fish.capacity() },
  { id: 'a_happy10', name: 'Crowd Pleaser', desc: '10 bears leave 4+ star reviews.', reward: 60, test: (g) => g.state.reviews.filter((r) => r.stars >= 4).length >= 10 },
  { id: 'a_research5', name: 'Mad Scientist', desc: 'Research 5 upgrades in the Lab.', reward: 60, test: (g) => g.state.research.length >= 5 },
  { id: 'a_hybrid', name: 'Hybrid Theory', desc: 'Discover a hybrid fish.', reward: 120, test: (g) => g.state.discovered.some((id) => g.speciesById(id)?.unlock === 'hybrid') },
  { id: 'a_golden', name: 'Midas Fin', desc: 'Hatch a golden fish.', reward: 150, test: (g) => g.fish.list.some((f) => f.g.morph === 'golden') },
  { id: 'a_dams', name: 'Beaver Fever', desc: 'Have 8 dams built.', reward: 100, test: (g) => g.structures.countBuilt('dam') >= 8 },
  { id: 'a_big', name: 'Great Lake', desc: 'Grow the pond to 130 water tiles.', reward: 180, test: (g) => g.grid.countWater() >= 130 },
  { id: 'a_rating', name: 'Five-Star Fox', desc: 'Reach a 4.5 star rating.', reward: 200, test: (g) => g.state.rating >= 4.5 },
  { id: 'a_ceo', name: 'CEO Approved', desc: 'The CEO leaves a 5-star review.', reward: 300, test: (g) => g.state.reviews.some((r) => r.type === 'ceo' && r.stars >= 5) },
  { id: 'a_week', name: 'One Week Wonder', desc: 'Stay in business for 7 days.', reward: 250, test: (g) => g.state.day >= 8 },
  { id: 'a_rich', name: 'Fat Cat Fox', desc: 'Earn 10,000 coins in total.', reward: 500, test: (g) => g.state.totalEarned >= 10000 },
  { id: 'a_month', name: 'Pond Legend', desc: 'Stay in business for 28 days.', reward: 1500, test: (g) => g.state.day >= 29 },
  { id: 'a_dex', name: 'Know-It-All', desc: 'Discover every fish species.', reward: 2500, test: (g) => g.state.discovered.length >= g.speciesCount() },
];
