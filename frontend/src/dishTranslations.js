import i18n from './i18n';

const englishDishNamesById = {
    19135: 'Chicken parmesan',
    16887: 'Onion rings',
    39618: 'Fried chicken',
    183399: 'Fish and chips',
    134053: 'Chinese egg rolls',
    80536: 'Mahogany beef stew',
    108893: 'Beef stew',
    36984: 'Classic beef stew',
    25806: 'Tomato beef stew',
    120810: 'Cashew chicken curry',
    150863: 'Creamy potato soup',
    4627: 'Chicken tortilla soup',
    40022: 'Taco soup',
    143985: 'Wonton soup',
    79563: 'Split pea and ham soup',
    63446: 'Thai coconut rice',
    105080: 'Broccoli rice casserole',
    71472: 'Japanese fried rice',
    61614: 'Indonesian fried rice',
    58122: 'Chicken fried rice',
    39087: 'Cajun chicken pasta',
    20755: 'Chicken noodle soup',
    31717: 'Pasta e fagioli',
    17990: 'Beef tips',
    58428: 'Pork lo mein',
    113776: 'Bun bo Hue',
    115147: 'Pho bo',
};

const englishDishNamesByVietnameseName = {
    'Gà Parmesan': 'Chicken parmesan',
    'Hành tây chiên giòn': 'Onion rings',
    'Gà chiên': 'Fried chicken',
    'Fish&Chips': 'Fish and chips',
    'Chả giò Trung Quốc': 'Chinese egg rolls',
    'Bò hầm Mahogany': 'Mahogany beef stew',
    'Bò kho': 'Beef stew',
    'Bò hầm cổ điển': 'Classic beef stew',
    'Bò hầm cà chua': 'Tomato beef stew',
    'Cà-ri gà hạt điều': 'Cashew chicken curry',
    'Súp khoai tây phô mai kem': 'Creamy potato soup',
    'Súp gà Tortilla': 'Chicken tortilla soup',
    'Súp Taco': 'Taco soup',
    'Hoành thánh': 'Wonton soup',
    'Súp hạt đậu xanh và giăm bông': 'Split pea and ham soup',
    'Cơm dừa Thái': 'Thai coconut rice',
    'Cơm trộn bông cải bỏ lò': 'Broccoli rice casserole',
    'Cơm rang Benihana': 'Japanese fried rice',
    'Cơm rang Indo': 'Indonesian fried rice',
    'Cơm rang gà': 'Chicken fried rice',
    'Mì Ý gà sốt Cajun': 'Cajun chicken pasta',
    'Mì gà': 'Chicken noodle soup',
    'Pasta Fagioli': 'Pasta e fagioli',
    'Mì xào bò': 'Beef tips',
    'Mì xào Lo Mein': 'Pork lo mein',
    'Bún bò Huế': 'Bun bo Hue',
    'Phở bò': 'Pho bo',
};

export const translateDishName = (dishOrName) => {
    if (!i18n.resolvedLanguage?.startsWith('en')) {
        return typeof dishOrName === 'string'
            ? dishOrName
            : dishOrName?.dish_name || dishOrName?.name || '';
    }

    if (typeof dishOrName === 'string') {
        const translatedName = englishDishNamesByVietnameseName[dishOrName];
        if (translatedName) return translatedName;

        const customRecipeSuffix = dishOrName.match(/^(.*?)(\s+\(.+\))$/);
        if (customRecipeSuffix) {
            const translatedDish = englishDishNamesByVietnameseName[customRecipeSuffix[1]];
            if (translatedDish) return `${translatedDish}${customRecipeSuffix[2]}`;
        }

        return dishOrName;
    }

    if (!dishOrName) return '';

    const recipeId = Number(dishOrName.food_com_recipe_id);
    return englishDishNamesById[recipeId]
        || englishDishNamesByVietnameseName[dishOrName.dish_name || dishOrName.name]
        || dishOrName.original_name
        || dishOrName.dish_name
        || dishOrName.name
        || '';
};
