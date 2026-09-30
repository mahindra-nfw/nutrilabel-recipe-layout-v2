// Shared ingredient library + sample recipe used by BOTH test layouts.
// Nutrition values are approximate, per 100 g:
// [kcal, fat g, sat fat g, cholesterol mg, sodium mg, carbs g, fiber g, sugars g, protein g]
window.NL = window.NL || {};

const RAW = [
  // Liquids & stocks
  ['water', 'Water', 'Liquids & Stocks', null, [0, 0, 0, 0, 0, 0, 0, 0, 0]],
  ['chicken_stock', 'Chicken Stock', 'Liquids & Stocks', 'Sysco', [7, 0.2, 0.1, 3, 340, 0.4, 0, 0.3, 1]],
  ['pork_bone_broth', 'Pork Bone Broth', 'Liquids & Stocks', 'Sysco', [30, 1.8, 0.6, 8, 380, 0.5, 0, 0, 3.2]],
  ['soy_sauce', 'Soy Sauce', 'Liquids & Stocks', 'JFC International', [53, 0.6, 0.1, 0, 5500, 4.9, 0.8, 0.4, 8.1]],
  ['mirin', 'Mirin', 'Liquids & Stocks', 'JFC International', [241, 0, 0, 0, 160, 43, 0, 43, 0.3]],
  ['sake', 'Cooking Sake', 'Liquids & Stocks', 'JFC International', [134, 0, 0, 0, 2, 5, 0, 0, 0.5]],
  ['rice_vinegar', 'Rice Vinegar', 'Liquids & Stocks', 'Mutual Trading', [18, 0, 0, 0, 2, 0.8, 0, 0, 0.3]],
  ['fish_sauce', 'Fish Sauce', 'Liquids & Stocks', 'US Foods', [35, 0, 0, 0, 7850, 3.6, 0, 3.6, 5.1]],
  ['lemon_juice', 'Lemon Juice', 'Liquids & Stocks', 'US Foods', [22, 0.2, 0, 0, 1, 6.9, 0.3, 2.5, 0.4]],
  ['coconut_milk', 'Coconut Milk', 'Liquids & Stocks', 'Restaurant Depot', [197, 21, 19, 0, 13, 2.8, 0, 3.3, 2]],

  // Seasonings & sauces
  ['white_miso', 'White Miso', 'Seasonings & Sauces', 'Mutual Trading', [198, 6, 1, 0, 3730, 26, 5.4, 6.2, 12.8]],
  ['red_miso_powder', 'Red Miso Powder', 'Seasonings & Sauces', 'Nikken Foods', [350, 10, 1.5, 0, 9000, 40, 8, 10, 25]],
  ['dashi_powder', 'Dashi Soup Stock (powder)', 'Seasonings & Sauces', 'Ajinomoto', [224, 1.3, 0.4, 20, 15700, 30, 0, 20, 24]],
  ['yeast_extract', 'Aromild Yeast Extract', 'Seasonings & Sauces', 'Kohjin', [300, 0.5, 0.1, 0, 5000, 20, 0, 1, 50]],
  ['ajitop', 'Ajitop Seasoning', 'Seasonings & Sauces', 'Ajinomoto', [180, 0, 0, 0, 12000, 25, 0, 0, 20]],
  ['ultra_spicy_sauce', 'Ultra Spicy Sauce', 'Seasonings & Sauces', 'House-made', [90, 3, 0.5, 0, 2500, 14, 2, 8, 2]],
  ['topping_spicy_miso', 'Topping Spicy Miso', 'Seasonings & Sauces', 'House-made', [220, 10, 1.5, 0, 3000, 25, 3, 12, 6]],
  ['gochujang', 'Gochujang', 'Seasonings & Sauces', 'Restaurant Depot', [233, 1.9, 0.3, 0, 2485, 50, 2.6, 21, 4.6]],
  ['sriracha', 'Sriracha', 'Seasonings & Sauces', 'US Foods', [93, 0.9, 0.1, 0, 2124, 19, 2.2, 15, 1.9]],
  ['oyster_sauce', 'Oyster Sauce', 'Seasonings & Sauces', 'JFC International', [51, 0.3, 0.1, 0, 2733, 11, 0.3, 0, 1.4]],
  ['salt', 'Salt', 'Seasonings & Sauces', 'Sysco', [0, 0, 0, 0, 38758, 0, 0, 0, 0]],
  ['sugar', 'Sugar, granulated', 'Seasonings & Sauces', 'Sysco', [387, 0, 0, 0, 1, 100, 0, 100, 0]],
  ['brown_sugar', 'Brown Sugar', 'Seasonings & Sauces', 'Sysco', [380, 0, 0, 0, 28, 98, 0, 97, 0.1]],
  ['honey', 'Honey', 'Seasonings & Sauces', 'US Foods', [304, 0, 0, 0, 4, 82, 0.2, 82, 0.3]],
  ['black_pepper', 'Black Pepper, ground', 'Seasonings & Sauces', 'Sysco', [251, 3.3, 1.4, 0, 20, 64, 25, 0.6, 10]],
  ['chili_flakes', 'Chili Flakes', 'Seasonings & Sauces', 'Sysco', [282, 14, 2.5, 0, 30, 50, 34, 10, 12]],
  ['msg', 'MSG', 'Seasonings & Sauces', 'Ajinomoto', [0, 0, 0, 0, 12300, 0, 0, 0, 0]],
  ['sesame_seeds', 'Sesame Seeds, toasted', 'Seasonings & Sauces', 'Mutual Trading', [565, 48, 6.7, 0, 11, 26, 14, 0.3, 17]],
  ['hazelnuts', 'Hazelnuts', 'Seasonings & Sauces', 'US Foods', [628, 61, 4.5, 0, 0, 17, 9.7, 4.3, 15]],
  ['coriander_seeds', 'Coriander Seeds', 'Seasonings & Sauces', 'Sysco', [298, 18, 1, 0, 35, 55, 42, 0, 12]],
  ['ground_ginger', 'Ginger, dried ground', 'Seasonings & Sauces', 'Sysco', [335, 4.2, 2.6, 0, 27, 72, 14, 3.4, 9]],
  ['white_pepper', 'White Pepper, ground', 'Seasonings & Sauces', 'Sysco', [296, 2.1, 0.6, 0, 5, 69, 26, 0.6, 10]],

  // Oils & fats
  ['sesame_oil', 'Sesame Oil', 'Oils & Fats', 'JFC International', [884, 100, 14, 0, 0, 0, 0, 0, 0]],
  ['olive_oil', 'Olive Oil', 'Oils & Fats', 'US Foods', [884, 100, 14, 0, 2, 0, 0, 0, 0]],
  ['vegetable_oil', 'Vegetable Oil', 'Oils & Fats', 'Sysco', [884, 100, 7.4, 0, 0, 0, 0, 0, 0]],
  ['butter', 'Butter, unsalted', 'Oils & Fats', 'Sysco', [717, 81, 51, 215, 11, 0.1, 0, 0.1, 0.9]],
  ['lard', 'Pork Lard', 'Oils & Fats', 'Restaurant Depot', [902, 100, 39, 95, 0, 0, 0, 0, 0]],

  // Vegetables & aromatics
  ['onion_sweet', 'Onion Sweet Shredded', 'Vegetables & Aromatics', 'Sysco', [32, 0.1, 0, 0, 8, 7.6, 0.9, 5, 0.8]],
  ['garlic', 'Garlic, minced', 'Vegetables & Aromatics', 'Sysco', [149, 0.5, 0.1, 0, 17, 33, 2.1, 1, 6.4]],
  ['ginger', 'Ginger, grated', 'Vegetables & Aromatics', 'Sysco', [80, 0.8, 0.2, 0, 13, 18, 2, 1.7, 1.8]],
  ['scallion', 'Scallion', 'Vegetables & Aromatics', 'US Foods', [32, 0.2, 0, 0, 16, 7.3, 2.6, 2.3, 1.8]],
  ['carrot', 'Carrot', 'Vegetables & Aromatics', 'US Foods', [41, 0.2, 0, 0, 69, 9.6, 2.8, 4.7, 0.9]],
  ['cabbage', 'Cabbage', 'Vegetables & Aromatics', 'US Foods', [25, 0.1, 0, 0, 18, 5.8, 2.5, 3.2, 1.3]],
  ['bean_sprouts', 'Bean Sprouts', 'Vegetables & Aromatics', 'US Foods', [30, 0.2, 0, 0, 6, 5.9, 1.8, 4.1, 3]],
  ['shiitake', 'Shiitake Mushroom', 'Vegetables & Aromatics', 'Mutual Trading', [34, 0.5, 0.1, 0, 9, 6.8, 2.5, 2.4, 2.2]],
  ['corn', 'Corn Kernels', 'Vegetables & Aromatics', 'Sysco', [86, 1.4, 0.3, 0, 15, 19, 2, 6.3, 3.3]],
  ['spinach', 'Spinach', 'Vegetables & Aromatics', 'US Foods', [23, 0.4, 0.1, 0, 79, 3.6, 2.2, 0.4, 2.9]],
  ['tomato', 'Tomato', 'Vegetables & Aromatics', 'US Foods', [18, 0.2, 0, 0, 5, 3.9, 1.2, 2.6, 0.9]],
  ['bell_pepper', 'Bell Pepper, red', 'Vegetables & Aromatics', 'US Foods', [31, 0.3, 0, 0, 4, 6, 2.1, 4.2, 1]],
  ['potato', 'Potato', 'Vegetables & Aromatics', 'Sysco', [77, 0.1, 0, 0, 6, 17, 2.2, 0.8, 2]],
  ['fried_shallots', 'Fried Shallots / Onions', 'Vegetables & Aromatics', 'Restaurant Depot', [580, 42, 20, 0, 450, 45, 4, 6, 5]],
  ['nori', 'Nori Sheet', 'Vegetables & Aromatics', 'Mutual Trading', [35, 0.3, 0.1, 0, 48, 5.1, 0.3, 0.5, 5.8]],

  // Proteins
  ['chicken_breast_cooked', 'Chicken Breast, cooked', 'Proteins', 'Sysco', [165, 3.6, 1, 85, 74, 0, 0, 0, 31]],
  ['chicken_thigh', 'Chicken Thigh, raw', 'Proteins', 'Sysco', [121, 4.1, 1, 94, 95, 0, 0, 0, 19.7]],
  ['pork_belly', 'Pork Belly, raw', 'Proteins', 'Restaurant Depot', [518, 53, 19, 72, 32, 0, 0, 0, 9.3]],
  ['ground_pork', 'Ground Pork', 'Proteins', 'Restaurant Depot', [263, 21, 7.9, 72, 56, 0, 0, 0, 17]],
  ['ground_beef', 'Ground Beef 80/20', 'Proteins', 'Sysco', [254, 20, 7.7, 71, 66, 0, 0, 0, 17]],
  ['salmon', 'Salmon Fillet', 'Proteins', 'US Foods', [208, 13, 3.1, 55, 59, 0, 0, 0, 20]],
  ['shrimp', 'Shrimp, raw', 'Proteins', 'US Foods', [85, 0.5, 0.1, 161, 119, 0, 0, 0, 20]],
  ['egg', 'Egg, whole', 'Proteins', 'Sysco', [143, 9.5, 3.1, 372, 142, 0.7, 0, 0.4, 12.6]],
  ['tofu_firm', 'Tofu, firm', 'Proteins', 'Mutual Trading', [144, 8.7, 1.3, 0, 14, 2.8, 2.3, 0.6, 17]],
  ['fish_cake', 'Narutomaki Fish Cake', 'Proteins', 'Mutual Trading', [100, 1, 0.2, 20, 900, 12, 0, 4, 10]],

  // Grains & starches
  ['ramen_noodles', 'Ramen Noodles, fresh', 'Grains & Starches', 'Sun Noodle', [280, 1.5, 0.3, 0, 650, 57, 2.4, 1, 9]],
  ['udon', 'Udon Noodles, frozen', 'Grains & Starches', 'JFC International', [105, 0.4, 0.1, 0, 180, 22, 0.8, 0.2, 2.6]],
  ['jasmine_rice', 'Jasmine Rice, cooked', 'Grains & Starches', 'Sysco', [130, 0.3, 0.1, 0, 1, 28, 0.4, 0, 2.7]],
  ['ap_flour', 'All-Purpose Flour', 'Grains & Starches', 'Sysco', [364, 1, 0.2, 0, 2, 76, 2.7, 0.3, 10]],
  ['cornstarch', 'Cornstarch', 'Grains & Starches', 'Sysco', [381, 0.1, 0, 0, 9, 91, 0.9, 0, 0.3]],
  ['panko', 'Panko Breadcrumbs', 'Grains & Starches', 'US Foods', [395, 5, 1, 0, 300, 72, 4, 5, 13]],
  ['potato_starch', 'Potato Starch', 'Grains & Starches', 'Mutual Trading', [333, 0.1, 0, 0, 55, 83, 0, 0, 0.1]],

  // Dairy
  ['whole_milk', 'Whole Milk', 'Dairy', 'Sysco', [61, 3.3, 1.9, 10, 43, 4.8, 0, 5.1, 3.2]],
  ['heavy_cream', 'Heavy Cream', 'Dairy', 'Sysco', [340, 36, 23, 113, 27, 2.8, 0, 2.9, 2.8]],
  ['parmesan', 'Parmesan, grated', 'Dairy', 'US Foods', [431, 29, 19, 88, 1529, 4, 0, 0.9, 38]],
  ['cheddar', 'Cheddar Cheese', 'Dairy', 'Sysco', [403, 33, 21, 105, 621, 1.3, 0, 0.5, 25]],

  // Additives & preservatives
  ['potassium_sorbate', 'Potassium Sorbate', 'Additives', null, [0, 0, 0, 0, 0, 0, 0, 0, 0]],
  ['citric_acid', 'Citric Acid', 'Additives', null, [0, 0, 0, 0, 0, 0, 0, 0, 0]],
  ['xanthan_gum', 'Xanthan Gum', 'Additives', 'Univar', [333, 0, 0, 0, 3800, 78, 78, 0, 0]],
  ['tapioca_maltodextrin', 'Tapioca Maltodextrin', 'Additives', 'Ingredion', [380, 0, 0, 0, 10, 95, 0, 5, 0]],
  ['sodium_benzoate', 'Sodium Benzoate', 'Additives', null, [0, 0, 0, 0, 16000, 0, 0, 0, 0]],
];

NL.INGREDIENTS = RAW.map(([id, name, cat, vendor, n]) => ({ id, name, cat, vendor, n }));
NL.CATEGORIES = [...new Set(NL.INGREDIENTS.map(i => i.cat))];
NL.CAT_COLORS = {
  'Liquids & Stocks': '#3b82f6',
  'Seasonings & Sauces': '#f59e0b',
  'Oils & Fats': '#eab308',
  'Vegetables & Aromatics': '#22c55e',
  'Proteins': '#ef4444',
  'Grains & Starches': '#a16207',
  'Dairy': '#8b5cf6',
  'Additives': '#64748b',
};

// Sample recipe — mirrors the "Spicy Miso Ramen" structure from the current NutriLabel UI,
// with one extra nesting level (Tare inside Broth) to exercise sub-assemblies.
// Item refs: 'ing:<ingredientId>' or 'asm:<assemblyId>'. Amounts in grams.
NL.SAMPLE = {
  root: 'final',
  asm: {
    final: {
      name: 'Spicy Miso Ramen', kind: 'final', yieldLoss: 0,
      items: [
        { ref: 'asm:broth', amount: 210 },
        { ref: 'asm:pork', amount: 46.5 },
        { ref: 'asm:chicken_roll', amount: 20 },
        { ref: 'ing:ramen_noodles', amount: 140 },
      ],
      steps: ['Portion noodles into tray.', 'Deposit broth, then pork and chicken roll.', 'Seal, blast freeze to -18 °C.'],
      notes: '',
    },
    broth: {
      name: 'Spicy Miso Broth', yieldLoss: 3,
      items: [
        { ref: 'ing:water', amount: 1000 },
        { ref: 'asm:tare', amount: 125 },
        { ref: 'ing:dashi_powder', amount: 2 },
        { ref: 'ing:yeast_extract', amount: 1.56 },
        { ref: 'ing:ajitop', amount: 1.56 },
        { ref: 'ing:onion_sweet', amount: 20 },
      ],
      steps: ['Bring water to a simmer with onion.', 'Whisk in tare and dry seasonings.', 'Simmer 10 min, strain.'],
      notes: 'Target Brix 6.5, salt 1.4%.',
    },
    tare: {
      name: 'Spicy Miso Tare', yieldLoss: 0,
      items: [
        { ref: 'ing:white_miso', amount: 100 },
        { ref: 'ing:ultra_spicy_sauce', amount: 19.5 },
        { ref: 'ing:red_miso_powder', amount: 2.39 },
        { ref: 'ing:garlic', amount: 5 },
        { ref: 'ing:sesame_oil', amount: 5 },
        { ref: 'ing:topping_spicy_miso', amount: 0.5 },
      ],
      steps: ['Blend all ingredients until smooth.'],
      notes: '',
    },
    pork: {
      name: 'Pork Chashu Pouch', yieldLoss: 12,
      items: [
        { ref: 'ing:pork_belly', amount: 40 },
        { ref: 'ing:soy_sauce', amount: 4 },
        { ref: 'ing:mirin', amount: 2 },
        { ref: 'ing:onion_sweet', amount: 5 },
        { ref: 'ing:potassium_sorbate', amount: 0.1 },
      ],
      steps: ['Roll and tie pork belly.', 'Braise in soy + mirin 2 h.', 'Chill, slice 5 mm, pouch.'],
      notes: '',
    },
    chicken_roll: {
      name: 'Chicken Roll', yieldLoss: 0,
      items: [
        { ref: 'ing:chicken_breast_cooked', amount: 15 },
        { ref: 'ing:fried_shallots', amount: 5 },
      ],
      steps: ['Roll chicken with shallots, slice.'],
      notes: '',
    },
  },
};
