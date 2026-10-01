export const CATEGORIES = ['Career', 'Financial', 'Health (mental)', 'Health (physical)', 'Husbandry', 'Parenting', 'Personal'];

export const SEED_GOALS = [
  ['Actively work on stamina', 1, 'Husbandry', 'Health (mental)'],
  ['Be first out of bed', 1, 'Husbandry', 'Personal'],
  ['Build FC business plan', 1, 'Career', 'Financial'],
  ['Clear debt, improve savings and investments', 1, 'Financial', 'Health (mental)'],
  ['Cut drinking further', 1, 'Husbandry', 'Health (physical)'],
  ['Daily verbal affirmations', 2, 'Parenting', 'Personal'],
  ['Date nights', 2, 'Husbandry', 'Personal'],
  ['Snoring', 2, 'Husbandry', 'Health (physical)'],
  ['Start driving again', 2, 'Husbandry', 'Personal'],
  ['Encourage hobbies', 3, 'Parenting', 'Personal'],
  ['Improve DIY skills', 3, 'Husbandry', 'Personal'],
  ['Improve gut health', 3, 'Health (physical)', 'Personal'],
  ['Improve social life', 3, 'Personal', 'Health (mental)'],
  ['Learn yoni massage', 3, 'Husbandry', 'Personal'],
  ['Learn to swim', 3, 'Husbandry', 'Parenting'],
  ["Complete 'scrapbook' project", 4, 'Health (mental)', 'Personal'],
  ['Get new tattoos', 4, 'Personal', null],
  ['Improve teeth', 4, 'Personal', 'Health (physical)'],
  ['Write and play music', 5, 'Personal', 'Health (mental)'],
].map(([title, priority, cat1, cat2]) => ({ title, priority, cat1, cat2 }));
