import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { dishAPI } from '../../services/api';
import { ErrorMessage, Loading } from '../../components/Shared';
import { useAuthContext } from '../../context/AuthContext';

const recipeTranslations = {
    'Gà Parmesan': 'Đập mỏng thịt gà rồi nêm muối, tiêu. Nhúng gà qua trứng và bột chiên xù, sau đó chiên vàng. Đun sốt cà chua, cho gà vào, phủ phô mai mozzarella và Parmesan rồi đậy nắp đến khi phô mai tan. Dùng kèm mì Ý và rau mùi tây.',
    'Hành tây chiên giòn': 'Trộn trứng, sữa và các nguyên liệu khô thành bột sánh. Lăn từng khoanh hành qua bột mì rồi nhúng vào bột. Chiên trong dầu nóng đến khi vàng giòn và để ráo dầu.',
    'Gà chiên': 'Ướp gà với nước muối, sau đó nhúng qua hỗn hợp sữa và trứng. Trộn bột mì với bột ngô cùng gia vị rồi lắc đều gà trong bột. Chiên vàng, trở mặt đến khi gà chín kỹ.',
    'Fish&Chips': 'Lăn cá qua bột mì. Pha bột chiên với bia, muối và tiêu rồi nhúng cá vào. Chiên cá đến khi giòn vàng, sau đó chiên khoai tây đến khi chín giòn và dùng kèm giấm.',
    'Chả giò Trung Quốc': 'Xào thịt heo với gừng và tỏi. Trộn thịt với rau củ, nước tương và dầu mè. Cuốn nhân vào bánh tráng, phết trứng lên mép rồi chiên vàng hai mặt.',
    'Bò hầm Mahogany': 'Áp chảo thịt bò cho vàng các mặt. Xào hành, cho rượu vang, cà chua, tỏi và thảo mộc vào rồi hầm nhỏ lửa. Thêm cà rốt, nấu đến khi thịt mềm và làm sánh phần sốt trước khi dùng.',
    'Bò kho': 'Ướp thịt bò với sả, nước mắm, ngũ vị hương, gừng và đường. Áp chảo thịt, xào cà chua và hành rồi cho thịt cùng gia vị vào nồi. Hầm nhỏ lửa, thêm cà rốt và nấu đến khi mềm.',
    'Bò hầm cổ điển': 'Áo thịt bò bằng bột mì, muối và tiêu rồi áp chảo cho vàng. Thêm hành, cà rốt, cần tây, nước dùng và thảo mộc. Đậy nắp hầm nhỏ lửa, sau đó cho khoai tây vào nấu đến khi mềm.',
    'Bò hầm cà chua': 'Cho thịt bò, khoai tây, cà rốt, cần tây, cà chua và tỏi vào nồi hầm. Nấu lửa nhỏ đến khi thịt và rau củ mềm. Hòa bột bắp với nước rồi cho vào để làm sánh nước sốt.',
    'Cà-ri gà hạt điều': 'Xào hành, tỏi và gừng với bơ. Thêm bột cà ri và gia vị, đảo cùng thịt gà. Cho cà chua vào hầm đến khi gà chín, cuối cùng thêm hạt điều xay và sữa chua để làm đặc sốt.',
    'Súp khoai tây phô mai kem': 'Nấu khoai tây trong nước dùng cùng gia vị đến khi mềm. Dằm nhẹ một phần khoai để tạo độ sánh. Hạ lửa, thêm phô mai kem và khuấy đến khi tan hoàn toàn.',
    'Súp gà Tortilla': 'Xào cà rốt, hành tây và cần tây. Thêm nước dùng, cà chua và thịt gà rồi đun sôi. Cho bánh tortilla và phô mai vào, nấu thêm rồi thêm sữa, dùng kèm phô mai bào.',
    'Súp Taco': 'Xào thịt rồi để ráo dầu. Cho thịt và các loại đậu, bắp, cà chua vào nồi. Nấu lửa nhỏ đến khi thấm vị, dùng kèm kem chua, phô mai hoặc hành lá.',
    'Hoành thánh': 'Trộn thịt heo với cần tây, hành lá, trứng và gia vị. Cho nhân vào vỏ hoành thánh, gấp và miết kín mép. Luộc hoành thánh, sau đó cho vào nước dùng nóng và rắc hành lá.',
    'Súp hạt đậu xanh và giăm bông': 'Rửa sạch đậu, ngâm trong nước nóng rồi đun sôi. Thêm xương giăm bông, cà rốt, hành, cần tây và gia vị. Hầm đến khi đậu mềm, lấy xương ra và nêm lại.',
    'Cơm dừa Thái': 'Cho gạo, nước cốt dừa, nước và gia vị vào nồi. Đun đến khi sôi nhẹ, hạ lửa và đậy nắp nấu khoảng 18 phút. Xới tơi cơm rồi rắc gừng lên trên.',
    'Cơm trộn bông cải bỏ lò': 'Xào hành với bơ cho mềm. Trộn hành với cơm và các nguyên liệu còn lại, cho vào khuôn. Nướng đến khi món nóng đều và mặt trên vàng nhẹ.',
    'Cơm rang Benihana': 'Nấu cơm rồi để nguội. Tráng trứng mỏng và cắt sợi. Xào rau củ với bơ, cho cơm, nước tương và gia vị vào đảo đều, cuối cùng trộn trứng vào.',
    'Cơm rang Indo': 'Nấu cơm, để nguội rồi tách hạt. Xào hành, tỏi, gia vị cùng thịt gà và tôm. Cho cơm vào đảo với các loại sốt, thêm trứng và trang trí bằng hành lá, rau mùi.',
    'Cơm rang gà': 'Nấu cơm rồi để nguội. Tráng trứng mỏng và cắt sợi. Xào hành, ớt chuông và hạt dẻ nước, thêm cơm, gà, nước tương và trứng rồi đảo nóng.',
    'Mì Ý gà sốt Cajun': 'Trộn gà với gia vị Cajun rồi áp chảo trong bơ. Thêm hành lá, kem tươi, cà chua và gia vị, nấu nóng. Rưới sốt lên mì Ý và rắc phô mai Parmesan.',
    'Mì gà': 'Đun chảy bơ rồi xào cần tây, cà rốt và hành. Thêm nước dùng, gia vị và đun sôi. Cho mì cùng thịt gà vào nấu đến khi chín, rắc rau mùi tây trước khi dùng.',
    'Pasta Fagioli': 'Xào thịt bò rồi để ráo dầu. Cho thịt cùng rau củ, cà chua và các loại đậu vào nồi hầm. Thêm mì vào giai đoạn cuối và nấu đến khi mì vừa chín.',
    'Mì xào bò': 'Xào hành rồi cho thịt bò vào đảo nhanh trên lửa lớn. Thêm nước, nước tương, dầu hào và gia vị, hầm đến khi thịt mềm. Dùng kèm mì trứng.',
    'Mì xào Lo Mein': 'Xào thịt heo với hành, tỏi và ớt. Xào riêng rau củ đến khi vừa chín tới. Trộn mì đã luộc với rau, nước tương và thịt rồi đảo nóng.',
    'Bún bò Huế': 'Ninh giò heo với sả rồi lọc lấy nước dùng. Nêm nước mắm, mắm ruốc, đường và tiêu. Cho bún vào tô, xếp thịt và rau lên trên rồi chan nước dùng nóng.',
    'Phở bò': 'Nấu nước dùng với gừng, quế và hoa hồi rồi lọc trong. Luộc bánh phở. Xếp bánh phở và thịt bò thái mỏng vào tô, chan nước dùng nóng và dùng kèm rau thơm.',
};

const ingredientTranslations = {
    'boneless skinless chicken breast halves': 'ức gà bỏ xương, bỏ da',
    'ground pork': 'thịt heo xay',
    'fresh ginger': 'gừng tươi',
    'cabbage and carrot coleslaw mix': 'hỗn hợp bắp cải và cà rốt bào sợi',
    'green onions': 'hành lá',
    'cod fish fillets': 'phi lê cá tuyết',
    'haddock fillets': 'phi lê cá tuyết chấm đen',
    'plain flour': 'bột mì đa dụng',
    'bicarbonate of soda': 'muối nở',
    'olive oil': 'dầu ô liu',
    'boneless beef chuck roast': 'nạc vai bò không xương',
    'boneless beef chuck': 'nạc vai bò không xương',
    'red wine': 'rượu vang đỏ',
    'diced tomatoes': 'cà chua thái hạt lựu',
    'dried oregano': 'lá oregano khô',
    'dried basil': 'húng quế khô',
    'hoisin sauce': 'tương hoisin',
    'bay leaves': 'lá nguyệt quế',
    'garlic clove': 'tép tỏi',
    'cornstarch': 'bột bắp',
    'lemongrass': 'sả',
    'fish sauce': 'nước mắm',
    'Chinese five spice powder': 'ngũ vị hương',
    'brown sugar': 'đường nâu',
    'bay leaf': 'lá nguyệt quế',
    'fresh tomatoes': 'cà chua tươi',
    'crushed tomatoes': 'cà chua nghiền',
    'star anise': 'hoa hồi',
    'Thai basil': 'húng quế Thái',
    'cilantro': 'rau mùi',
    'beef stew meat': 'thịt bò hầm',
    'thyme': 'cỏ xạ hương',
    'beef broth': 'nước dùng bò',
    'whole tomatoes': 'cà chua nguyên quả',
    'unsalted butter': 'bơ không muối',
    'curry powder': 'bột cà ri',
    'ground cumin': 'bột thì là Ai Cập',
    'cayenne': 'ớt cayenne',
    'fresh cilantro': 'rau mùi tươi',
    'cashews': 'hạt điều',
    'plain yogurt': 'sữa chua không đường',
    'cooked basmati rice': 'cơm gạo basmati đã nấu',
    'chicken broth': 'nước dùng gà',
    'seasoning salt': 'muối nêm',
    'white pepper': 'tiêu trắng',
    'cream cheese': 'phô mai kem',
    'garlic powder': 'bột tỏi',
    'Rotel tomatoes & chilies': 'cà chua và ớt xanh Rotel',
    'corn': 'bắp',
    'chicken meat': 'thịt gà',
    'sour cream': 'kem chua',
    'monterey jack cheese': 'phô mai Monterey Jack',
    'corn tortilla chips': 'bánh tortilla ngô chiên giòn',
    'pinto beans': 'đậu pinto',
    'white beans': 'đậu trắng',
    'kidney beans': 'đậu thận đỏ',
    'diced green chilies': 'ớt xanh thái hạt lựu',
    'wonton wrappers': 'vỏ hoành thánh',
    'white wine': 'rượu vang trắng',
    'scallion': 'hành lá',
    'ham bone': 'xương giăm bông',
    'beef bouillon cubes': 'viên gia vị bò',
    'black peppercorns': 'hạt tiêu đen',
    'black pepper': 'tiêu đen',
    'coconut milk': 'nước cốt dừa',
    'long grain rice': 'gạo hạt dài',
    'crushed red pepper flakes': 'ớt đỏ nghiền',
    'crystallized ginger': 'gừng tẩm đường kết tinh',
    'green bell peppers': 'ớt chuông xanh',
    'green bell pepper': 'ớt chuông xanh',
    'spaghetti': 'mì Ý',
    'parsley': 'rau mùi tây',
    'mozzarella cheese': 'phô mai mozzarella',
    'parmesan cheese': 'phô mai Parmesan',
    'beer': 'bia',
    'potatoes': 'khoai tây',
    'chicken': 'thịt gà', 'beef': 'thịt bò', 'pork': 'thịt heo',
    'onion': 'hành tây', 'onions': 'hành tây', 'garlic': 'tỏi', 'garlic cloves': 'tép tỏi', 'carrot': 'cà rốt', 'carrots': 'cà rốt',
    'celery': 'cần tây', 'celery ribs': 'cọng cần tây', 'rice': 'gạo/cơm', 'eggs': 'trứng', 'egg': 'trứng', 'flour': 'bột mì',
    'butter': 'bơ', 'milk': 'sữa', 'water': 'nước', 'salt': 'muối', 'pepper': 'tiêu', 'sugar': 'đường', 'tomatoes': 'cà chua',
    'dried thyme': 'cỏ xạ hương khô', 'cheese': 'phô mai',
    'baking powder': 'bột nở',
    'sweet onions': 'hành tây ngọt',
    'buttermilk': 'sữa tươi lên men',
    'season-all salt': 'muối (hiệu Season-All)',
    'cornmeal': 'bột ngô',
    'shortening': 'mỡ thực vật',
    'soy sauce': 'nước tương',
    'fresh parsley': 'rau mùi tây tươi',
    'ginger': 'gừng',
    'dried parsley': 'rau mùi tây khô',
    'beef bouillon granules': 'hạt nêm bò',
    'cold water': 'nước lạnh',
    'turmeric': 'nghệ',
    'cooked rice': 'cơm đã nấu',
    'long-grain white rice': 'gạo trắng hạt dài',
    'boneless skinless chicken thighs': 'đùi gà bỏ xương, bỏ da',
    'raw shrimp': 'tôm sống',
    'dried shrimp paste': 'mắm tôm khô',
    'fresh ground black pepper': 'tiêu đen xay tươi',
    'chili bean sauce': 'tương ớt đậu',
    'sambal oelek': 'tương ớt Sambal Oelek',
    'oyster sauce': 'dầu hào',
    'ketjap manis': 'nước tương ngọt Ketjap Manis',
    'dark soy sauce': 'nước tương đen',
    'spring onions': 'hành lá',
    'fresh cilantro leaves': 'lá rau mùi tươi',
    'margarine': 'bơ thực vật',
    'water chestnuts': 'củ năng',
    'dried parsley flakes': 'rau mùi tây khô (dạng vụn)',
    'linguine': 'mì linguine',
    'Cajun Seasoning Mix': 'hỗn hợp gia vị Cajun',
    'green onion': 'hành lá',
    'heavy whipping cream': 'kem sữa tươi béo',
    'sun-dried tomatoes': 'cà chua phơi khô',
    'ground black pepper': 'tiêu đen xay',
    'poultry seasoning': 'gia vị ướp gia cầm',
    'chicken bouillon': 'hạt nêm gà',
    'ground beef': 'thịt bò xay',
    'oregano': 'lá oregano',
    'Tabasco sauce': 'tương ớt Tabasco',
    'pasta': 'mì pasta',
    'Worcestershire': 'sốt Worcestershire',
    'Worcestershire sauce': 'sốt Worcestershire',
    'cabbage': 'bắp cải',
    'bok choy': 'cải thìa',
    'sweet bell peppers': 'ớt chuông ngọt',
    'ham hock': 'giò heo',
    'nuoc nam': 'nước mắm',
    'sea salt': 'muối biển',
    'shrimp paste': 'mắm tôm',
    'boneless pork loin': 'thăn heo bỏ xương',
    'bean sprouts': 'giá đỗ',
    'of fresh mint': 'bạc hà tươi',
    'hot chili sauce': 'tương ớt cay',
    'lime': 'chanh xanh',
    'limes': 'chanh xanh',
    'shallots': 'hành tím',
    'filet of beef': 'thăn bò phi lê',
    'cinnamon bark': 'vỏ quế',
    'caster sugar': 'đường caster',
    'chili sauce': 'tương ớt',
    'red chilies': 'ớt đỏ',
};

const translateIngredients = (value = '') => value.split(',').map((item) => {
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    const translated = ingredientTranslations[key]
        || ingredientTranslations[trimmed]
        || Object.entries(ingredientTranslations).find(([ingredient]) => ingredient.toLowerCase() === key)?.[1]
        || trimmed;
    return translated.charAt(0).toUpperCase() + translated.slice(1);
}).join(', ');

const getDishData = (response) => response.data?.data || response.data || [];

const DishDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { isAuthenticated } = useAuthContext();
    const [dishes, setDishes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const loadDishes = async () => {
            try {
                const listResponse = await dishAPI.getAll();
                const availableDishes = getDishData(listResponse);
                if (id) {
                    const detailResponse = await dishAPI.getDetail(id);
                    const detail = getDishData(detailResponse);
                    setDishes(availableDishes.map((dish) => (
                        String(dish.dish_id) === String(id) ? detail : dish
                    )));
                } else {
                    setDishes(availableDishes);
                }
            } catch (loadError) {
                setError('Không thể tải thông tin món ăn.');
            } finally {
                setLoading(false);
            }
        };
        loadDishes();
    }, []);

    const selectedDish = dishes.find((dish) => String(dish.dish_id) === String(id)) || dishes[0];

    const addToCart = (orderType) => {
        if (!isAuthenticated) {
            alert('Vui lòng đăng nhập để thực hiện thao tác này');
            navigate('/login?tab=register');
            return;
        }
        const cartKey = orderType === 'mang-ve' ? 'delivery_cart' : 'booking_cart';
        const cart = JSON.parse(localStorage.getItem(cartKey) || '[]');
        const existing = cart.find((item) => item.dish_id === selectedDish.dish_id);
        if (existing) existing.quantity += 1;
        else cart.push({ dish_id: selectedDish.dish_id, name: selectedDish.dish_name, price: selectedDish.price, quantity: 1, image_url: selectedDish.image_url });
        localStorage.setItem(cartKey, JSON.stringify(cart));
        alert(`Đã thêm ${selectedDish.dish_name} vào giỏ hàng.`);
    };

    if (loading) return <Loading />;
    if (error) return <div className="max-w-5xl mx-auto px-4 py-8"><ErrorMessage message={error} /></div>;
    if (!selectedDish) return null;

    const steps = recipeTranslations[selectedDish.dish_name]?.split('. ').filter(Boolean) || [selectedDish.recipe_instructions];

    return (
        <div className="min-h-screen bg-gray-50 px-4 py-8">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-4xl font-bold text-red-600 mb-8">Chi tiết món ăn</h1>
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="grid md:grid-cols-2 gap-8 items-start">
                        <img src={selectedDish.image_url} alt={selectedDish.dish_name} className="w-full max-w-lg mx-auto h-72 object-cover rounded-lg" />
                        <div>
                            <h2 className="text-3xl font-bold text-gray-900 mb-4">{selectedDish.dish_name}</h2>
                            <p className="text-red-600 text-2xl font-bold mb-5">{Number(selectedDish.price).toLocaleString('vi-VN')}đ</p>
                            <h3 className="font-semibold text-lg mb-2">Nguyên liệu nấu</h3>
                            <p className="text-gray-700 leading-7">{translateIngredients(selectedDish.ingredients)}</p>
                            <div className="grid grid-cols-2 gap-3 mt-6">
                                <button onClick={() => addToCart('mang-ve')} className="py-2 px-3 rounded border border-red-600 text-red-600 font-semibold hover:bg-red-600 hover:text-white transition">Đặt Ship</button>
                                <button onClick={() => addToCart('dat-ban')} className="py-2 px-3 rounded border border-gray-800 text-gray-800 font-semibold hover:bg-gray-800 hover:text-white transition">Đặt Bàn</button>
                            </div>
                        </div>
                    </div>
                    <section className="mt-8 border-t pt-6">
                        <h3 className="text-xl font-bold text-red-600 mb-4">Công thức nấu</h3>
                        <ol className="list-decimal list-inside space-y-3 text-gray-700 leading-7">
                            {steps.map((step, index) => <li key={`${selectedDish.dish_id}-${index}`}>{step.trim().replace(/[.]$/, '')}.</li>)}
                        </ol>
                    </section>
                    <section className="mt-8 border-t pt-6">
                        <h3 className="text-xl font-bold text-red-600 mb-3">Đánh giá</h3>
                        <p className="text-gray-700">{selectedDish.original_rating ?? 0}/5 sao từ {Number(selectedDish.original_review_count ?? 0).toLocaleString('vi-VN')} lượt đánh giá</p>
                    </section>
                    <div className="mt-8 border-t pt-6">
                        <h3 className="text-xl font-bold text-red-600 mb-4">Chọn món khác</h3>
                        <div className="flex flex-wrap gap-2">
                            {dishes.map((dish) => (
                                <button key={dish.dish_id} onClick={() => navigate(`/dish-details/${dish.dish_id}`)} className={`px-3 py-2 rounded border text-sm ${dish.dish_id === selectedDish.dish_id ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 hover:border-red-600 hover:text-red-600'}`}>
                                    {dish.dish_name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DishDetailPage;
