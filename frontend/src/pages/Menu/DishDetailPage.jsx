import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { dishAPI, dishCustomizationAPI } from '../../services/api';
import { ErrorMessage, Loading, Modal } from '../../components/Shared';
import { useAuthContext } from '../../context/AuthContext';

const recipeTranslations = {
    'Gà Parmesan': 'Đập mỏng thịt gà, nêm muối và tiêu. Nhúng gà qua trứng rồi phủ bột chiên xù. Chiên trong bơ nóng, trở mặt và chiên khoảng 10 phút hoặc đến khi gà chín, sau đó lấy gà ra. Cho sốt mì Ý vào chảo và đun nóng kỹ. Cho gà trở lại chảo, xếp phô mai mozzarella lên trên, rắc phô mai Parmesan, đậy nắp và nấu đến khi phô mai tan. Dùng kèm mì Ý, có thể rắc rau mùi tây băm nhỏ và thêm Parmesan khi dùng.',
    'Hành tây chiên giòn': 'Đánh trứng, dầu và sữa ở tốc độ thấp trong 1 phút. Thêm các nguyên liệu khô và trộn đến khi mịn. Lăn hành qua bột mì rồi nhúng vào hỗn hợp bột. Chiên trong dầu nóng 190°C đến khi đạt độ vàng mong muốn, trở mặt khi một bên đã vàng.',
    'Gà chiên': 'Ngâm gà trong nước muối ít nhất 2 giờ trong tủ lạnh. Trộn sữa lên men, trứng và muối Season-All rồi nhúng từng miếng gà vào hỗn hợp. Cho bột mì, bột ngô, oregano khô và muối Season-All vào túi, lần lượt cho gà vào lắc để phủ bột, rồi đặt lên vỉ nghỉ. Làm nóng lớp dầu nông đến 180°C, cho gà vào chảo nhưng không xếp quá chật. Đậy nắp 5 phút, trở mặt khi gà vàng rồi đậy nắp thêm 5 phút. Mở nắp và chiên thêm khoảng 20 phút, thỉnh thoảng trở mặt đến khi chín kỹ; nếu gà vàng quá nhanh thì hạ lửa.',
    'Fish&Chips': 'Làm nóng mỡ hoặc nồi chiên đến 190°C. Gọt khoai tây, cắt que dày, rửa và lau thật khô. Chiên khoai khoảng 3 phút đến khi mềm nhưng chưa vàng, để ráo rồi xóc nhẹ. Lăn phi lê cá thật kỹ qua bột mì để bột chiên bám chắc. Trộn bột mì, muối nở, muối và tiêu, từ từ thêm bia đến khi có hỗn hợp bột phủ đặc, đánh mịn rồi thêm nước chanh hoặc giấm mạch nha nếu muốn. Hạ nồi chiên xuống 160°C, nhúng từng miếng cá vào bột rồi chiên khoảng 6-10 phút đến khi giòn. Giữ cá nóng, tăng nhiệt lên 190°C và chiên khoai lần hai đến khi vàng giòn. Dùng kèm muối và giấm.',
    'Chả giò Trung Quốc': 'Xào thịt heo với gừng và tỏi rồi để ráo mỡ. Trộn muối, đường, nước tương và dầu mè, cho vào thịt. Trộn hỗn hợp bắp cải, cà rốt và hành lá trong tô lớn, đổ thịt nóng vào rồi đảo đều, để nguội bớt. Đặt vỏ chả giò hình thoi, cho khoảng 3 thìa nhân vào giữa, gấp mép dưới lên, cuộn một vòng rồi gấp hai mép bên. Phết trứng đánh lên mép trên và cuộn kín. Đun dầu sâu khoảng 5-8 cm đến rất nóng 175°C, chiên từng mẻ 2-3 phút mỗi mặt rồi để ráo trên giấy.',
    'Bò hầm Mahogany': 'Đun dầu ô liu trong nồi lớn ở lửa cao. Rắc muối tiêu lên thịt, áp chảo đến khi vàng các mặt khoảng 10 phút rồi dồn thịt sang bên. Hạ lửa vừa, thêm dầu và xào hành đến vàng khoảng 15 phút, trộn thịt với hành. Thêm rượu vang, cà chua, tỏi, thảo mộc, sốt hoisin và lá nguyệt quế, đun sôi rồi hạ lửa nhỏ, đậy nắp hầm 45 phút và thỉnh thoảng đảo. Thêm cà rốt cùng rượu vang còn lại, đậy nắp hầm thêm 30 phút. Mở nắp, tăng lửa và đun đến khi sốt hơi sánh. Thêm hỗn hợp bột bắp, đun khoảng 8 phút đến khi sốt đặc. Bỏ lá nguyệt quế, nêm lại muối tiêu, rắc rau mùi tây và dùng kèm mì trứng với bơ.',
    'Bò kho': 'Trộn sả, nước mắm, ngũ vị hương, gừng, đường nâu và lá nguyệt quế, ướp thịt bò 30 phút. Đun nóng dầu trong nồi đáy dày, áp chảo nhanh thịt bò rồi lấy ra, giữ lại sả và lá nguyệt quế. Hạ lửa vừa, xào hành đến trong khoảng 5 phút, thêm cà chua và đậy nắp nấu 12-15 phút. Nếu sốt quá đặc, thêm một ít nước. Cho thịt bò, sả, lá nguyệt quế và hoa hồi trở lại nồi, nấu mở nắp 5 phút rồi thêm nước. Đun sôi, hạ lửa nhỏ hầm 1 giờ 15 phút. Thêm cà rốt và hầm thêm 45 phút đến khi thịt bò, cà rốt mềm. Trước khi dùng, bỏ lá nguyệt quế, sả và hoa hồi, dùng kèm rau mùi và húng quế Thái với cơm trắng hoặc bánh mì.',
    'Bò hầm cổ điển': 'Cho bột mì, muối và tiêu vào túi kín. Đun dầu ở lửa vừa trong nồi gang, cho thịt vào túi lắc phủ bột rồi rũ bớt bột, áp chảo đến khi hơi vàng. Thêm phần bột còn lại và hành băm, đảo đến khi vàng. Thêm cà rốt, cần tây, nước dùng và cỏ xạ hương. Đậy nắp, nấu lửa nhỏ 1 giờ 30 phút và đảo mỗi 15 phút. Thêm khoai tây, cà rốt và hành thái hạt lựu, nấu thêm 45 phút hoặc đến khi khoai mềm.',
    'Bò hầm cà chua': 'Cho tất cả nguyên liệu trừ bột bắp vào nồi nấu chậm, nấu ở chế độ thấp trong 6-8 giờ. Hòa bột bắp với nước rồi cho vào nồi. Chuyển sang chế độ cao và khuấy đến khi nước sốt sánh lại.',
    'Cà-ri gà hạt điều': 'Đun bơ trong nồi lớn ở lửa vừa nhỏ, xào hành, tỏi và gừng khoảng 5 phút đến khi mềm. Thêm bột cà ri, muối, thì là Ai Cập và ớt cayenne, đảo 2 phút. Cho gà vào đảo phủ gia vị khoảng 3 phút, thêm cà chua và rau mùi rồi đun liu riu. Đậy nắp, hầm nhẹ khoảng 40 phút đến khi gà chín. Xay thật mịn hạt điều, cho cùng sữa chua vào nồi và hầm mở nắp khoảng 5 phút đến khi sốt đặc.',
    'Súp khoai tây phô mai kem': 'Cho nước dùng, khoai tây và gia vị vào nồi, nấu lửa vừa đến khi khoai mềm. Dằm một phần khoai để tinh bột làm súp sánh hơn. Hạ lửa nhỏ, cho phô mai kem vào và khuấy thường xuyên đến khi phô mai tan hoàn toàn.',
    'Súp gà Tortilla': 'Xào cà rốt, hành tây, cần tây cùng dầu ngô, tỏi, muối và tiêu đến khi mềm. Thêm nước dùng gà và đun sôi. Cho cà chua, cà chua ớt, gia vị taco và thịt gà vào. Cắt bánh tortilla thành miếng nhỏ, cho vào nồi và nấu 45 phút, thỉnh thoảng khuấy để bánh không dính. Hạ lửa, thêm phô mai và nấu 10 phút, sau đó thêm sữa và nấu tiếp 10 phút. Nếu muốn súp đặc hơn, thêm bánh tortilla. Dùng kèm phô mai bào và bánh tortilla vụn.',
    'Súp Taco': 'Nấu thịt rồi để ráo mỡ, xé nhỏ nếu cần. Cho tất cả nguyên liệu vào nồi nấu chậm, không đổ bỏ nước trong hộp đồ hộp, rồi khuấy đều. Nấu lửa cao 2 giờ hoặc lửa thấp 4 giờ, giữ lửa thấp đến khi dùng. Có thể dùng kèm kem chua, phô mai bào, hành lá hoặc bánh tortilla.',
    'Hoành thánh': 'Trộn kỹ các nguyên liệu làm nhân. Phủ khăn ẩm lên vỏ hoành thánh, lấy từng ít một để gói. Làm ẩm mép vỏ, cho 1 thìa cà phê nhân vào giữa, gấp thành hình tam giác và miết kín. Gấp hai đầu dài ra phía sau rồi dán lại bằng một ít nước. Đun sôi 2 lít nước, cho hoành thánh vào, khuấy, đậy nắp và đun sôi lại. Thêm 1 cốc nước lạnh rồi đun sôi lần nữa. Đun sôi nước dùng riêng, cho nước tương và hoành thánh đã luộc vào, cuối cùng rắc hành lá.',
    'Súp hạt đậu xanh và giăm bông': 'Rửa kỹ đậu Hà Lan khô bằng nước lạnh rồi cho vào nồi lớn với 8 cốc nước. Đun sôi, tắt bếp, đậy nắp và để 1 giờ. Đun sôi lại, thêm xương giăm bông, cà rốt, hành, cần tây, lá nguyệt quế, hạt nêm bò, muối, tiêu và cỏ xạ hương. Hạ lửa, đậy nắp hầm 1-1 giờ 30 phút, thỉnh thoảng khuấy. Lấy xương ra, gỡ phần thịt còn lại, cắt miếng vừa ăn và cho lại vào súp. Bỏ lá nguyệt quế, nêm lại gia vị; nếu súp đặc có thể thêm nước.',
    'Cơm dừa Thái': 'Cho tất cả nguyên liệu trừ gừng kết tinh và hạnh nhân lát vào nồi, khuấy đều. Nấu lửa vừa cao đến khi sôi nhẹ rồi lập tức hạ lửa nhỏ. Đậy nắp nấu khoảng 18 phút. Xới cơm bằng nĩa, đậy lại và để thêm 5 phút. Trang trí cơm bằng gừng kết tinh và hạnh nhân lát.',
    'Cơm trộn bông cải bỏ lò': 'Xào hành với bơ trong chảo lớn đến khi mềm. Trộn hành với cơm và các nguyên liệu còn lại, cho vào khuôn nướng 2 lít. Nướng không đậy nắp ở 175°C trong 1 giờ. Nếu muốn cấp đông, trộn khi cơm đã nấu chín, chia vào khuôn nhỏ, đậy kín và ghi nhãn; rã đông qua đêm rồi nướng 1 giờ, hoặc nướng khi còn đông thêm khoảng 10 phút và kiểm tra độ chín.',
    'Cơm rang Benihana': 'Nấu cơm theo hướng dẫn gói, sau đó cho ra tô và làm nguội trong tủ lạnh. Tráng trứng trong chảo nhỏ ở lửa vừa, chia trứng thành các miếng nhỏ cỡ hạt đậu. Khi cơm gần bằng nhiệt độ phòng, trộn cơm với đậu Hà Lan, cà rốt bào, trứng và hành thái hạt lựu. Đun chảy bơ trong chảo lớn ở lửa vừa cao, cho hỗn hợp cơm vào, thêm nước tương, muối và tiêu. Đảo thường xuyên trong 6-8 phút.',
    'Cơm rang Indo': 'Luộc gạo trong nhiều nước muối đến khi chín, xả, để ráo và trải ra cho nguội, tốt nhất để trong tủ lạnh qua đêm. Trộn trứng với dầu mè và muối. Làm nóng chảo thật nóng, cho dầu rồi xào hành, gừng, mắm tôm, tỏi và tiêu 2 phút. Thêm thịt gà và tôm, xào thêm 2 phút. Cho cơm vào đảo 3 phút, thêm tương ớt đậu hoặc sambal, dầu hào, kecap manis hoặc nước tương đen và đảo 2 phút. Cuối cùng cho trứng vào đảo 1 phút, có thể dùng trứng tráng thái sợi để trang trí cùng hành lá và rau mùi.',
    'Cơm rang gà': 'Nấu cơm trong nồi với các nguyên liệu phù hợp, đun sôi rồi hạ lửa nhỏ nấu 20 phút có đậy nắp, sau đó để nguội. Đánh trứng với nước, tráng thành một lớp mỏng trong chảo ở lửa vừa nhỏ, lấy ra cuộn và thái sợi. Xào hành, ớt chuông và củ năng đến khi mềm. Thêm cơm, thịt gà, nước tương và tiêu, đảo nóng rồi trộn trứng thái sợi vào.',
    'Mì Ý gà sốt Cajun': 'Trộn thịt gà với gia vị Cajun. Áp chảo gà trong bơ hoặc bơ thực vật ở lửa vừa đến khi mềm, khoảng 5-7 phút. Hạ lửa, thêm hành lá, kem tươi, cà chua, húng quế, muối, bột tỏi và tiêu, đun nóng kỹ. Rưới sốt lên mì linguine nóng và trộn cùng phô mai Parmesan.',
    'Mì gà': 'Đun chảy bơ trong nồi lớn, xào cần tây, cà rốt và hành từ 5-10 phút. Thêm cỏ xạ hương, gia vị gia cầm, nước dùng gà và hạt nêm gà, đun sôi. Cho mì và thịt gà vào, nấu lửa nhỏ 20 phút. Rắc rau mùi tây trước khi dùng.',
    'Pasta Fagioli': 'Xào thịt bò đến khi chín vàng rồi để ráo mỡ. Cho thịt vào nồi nấu chậm cùng mọi nguyên liệu trừ mì. Nấu lửa thấp 7-8 giờ hoặc lửa cao 4-5 giờ. Trong 30 phút cuối ở lửa cao hoặc 1 giờ cuối ở lửa thấp, thêm mì và nấu đến khi mì chín.',
    'Mì xào bò': 'Đun dầu ở lửa cao trong chảo lớn, xào hành đến trong. Thêm thịt bò và đảo lửa lớn đến khi vàng các mặt khoảng 3-5 phút. Thêm nước, nước tương và sốt Worcestershire, nêm tỏi, muối và tiêu. Đun sôi rồi hạ lửa, đậy nắp hầm 1 giờ 30 phút đến 2 giờ. Hòa hỗn hợp làm sốt với nước, cho vào chảo và khuấy đến khi hơi sánh. Dùng với mì trứng.',
    'Mì xào Lo Mein': 'Đun nóng dầu ô liu trong chảo hoặc wok. Xào thịt heo, hành, tỏi và ớt nghiền đến khi thịt không còn hồng, lấy ra giữ ấm. Thêm dầu nếu cần, xào bắp cải, cải thìa, cà rốt và ớt chuông đến vừa mềm giòn. Cho mì spaghetti đã nấu vào cùng rau, thêm nước tương, cho thịt trở lại chảo và nấu 5 phút đến khi nóng đều.',
    'Bún bò Huế': 'Đun sôi 2,5 lít nước, cho giò heo và sả vào, liên tục hớt bọt trong 10 phút rồi đậy nắp, hạ lửa và hầm 1,5-2 giờ. Lọc lấy nước dùng, giữ lại giò heo nếu muốn. Hòa mắm tôm với 1/4 cốc nước lạnh và để 10 phút. Cho nước mắm, hỗn hợp mắm tôm, đường, muối, tiêu, thịt bò và thăn heo vào nước dùng, hầm 10-15 phút đến khi thịt chín mềm rồi lấy thịt ra. Thái mỏng thịt. Khi dùng, cho bún vào tô, xếp giá đỗ, thịt và giò heo lên trên, chan nước dùng, thêm rau thơm, tương ớt, ớt và nước cốt chanh tùy thích.',
    'Phở bò': 'Đun sôi nước dùng, cho gừng, quế, hạt mùi và hoa hồi vào, hầm 15 phút. Thêm đường, muối, tiêu và nước mắm rồi lọc nước dùng, giữ nóng ở lửa nhỏ. Luộc bánh phở đến vừa chín. Khi cho bánh phở vào nước, cho thịt bò thái mỏng vào nước dùng nóng để thịt chín bằng nhiệt của nước. Chia bánh phở vào tô, thêm giá đỗ, hành tím và thịt bò, chan nước dùng nóng. Dùng kèm tương hoisin, tương ớt, chanh, ớt tươi và húng quế Thái.',
};

const ingredientTranslations = {
    'boneless skinless chicken breast halves': 'ức gà bỏ xương, bỏ da',
    'ground pork': 'thịt heo xay',
    'fresh ginger': 'gừng tươi',
    'cabbage and carrot coleslaw mix': 'hỗn hợp bắp cải và cà rốt bào sợi',
    'green onions': 'hành lá',
    'green onion': 'hành lá',
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
    'potato': 'khoai tây',
    'tomato': 'cà chua',
    'diced tomato': 'cà chua thái hạt lựu',
    'fresh tomato': 'cà chua tươi',
    'crushed tomato': 'cà chua nghiền',
    'whole tomato': 'cà chua nguyên quả',
    'spring onion': 'hành lá',
    'sweet onion': 'hành tây ngọt',
    'cashew': 'hạt điều',
    'pinto bean': 'đậu pinto',
    'white bean': 'đậu trắng',
    'kidney bean': 'đậu thận đỏ',
    'diced green chili': 'ớt xanh thái hạt lựu',
    'wonton wrapper': 'vỏ hoành thánh',
    'celery rib': 'cọng cần tây',
    'beef bouillon cube': 'viên gia vị bò',
    'red kidney bean': 'đậu thận đỏ',
    'white kidney bean': 'đậu trắng',
    'crushed red pepper flake': 'ớt đỏ nghiền',
    'sweet bell pepper': 'ớt chuông ngọt',
    'bean sprout': 'giá đỗ',
    'shallot': 'hành tím',
    'red chili': 'ớt đỏ',
    'black peppercorn': 'hạt tiêu đen',
    'boneless skinless chicken thigh': 'đùi gà bỏ xương, bỏ da',
    'corn tortilla chip': 'bánh tortilla ngô chiên giòn',
    'dried parsley flake': 'rau mùi tây khô (dạng vụn)',
    'fresh cilantro leaf': 'lá rau mùi tươi',
    'ground pepper': 'tiêu xay',
    'sun-dried tomato': 'cà chua phơi khô',
    'water chestnut': 'củ năng',
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
    'bread crumbs': 'bột chiên xù',
    'spaghetti sauce': 'sốt mì Ý',
    'oil': 'dầu ăn',
    'sesame oil': 'dầu mè',
    'egg noodles': 'mì trứng',
    'diced potatoes': 'khoai tây thái hạt lựu',
    'tomato juice': 'nước ép cà chua',
    'corn oil': 'dầu ngô',
    'taco seasoning': 'gia vị taco',
    'masa harina': 'bột masa',
    'shredded cheese': 'phô mai bào',
    'chopped green onions': 'hành lá thái nhỏ',
    'tortilla chips': 'bánh tortilla chiên giòn',
    'green split peas': 'đậu Hà Lan khô tách đôi',
    'sliced almonds': 'hạnh nhân lát',
    'broccoli': 'bông cải xanh',
    'peas': 'đậu Hà Lan',
    'noodles': 'mì',
    'gravy mix': 'hỗn hợp làm sốt',
    'rice noodles': 'bún',
    'beef sirloin': 'thăn bò',
    'chilies': 'ớt',
    'stock': 'nước dùng',
    'coriander seeds': 'hạt mùi',
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

const splitIngredients = (value = '') => value.split(',').map((item) => item.trim()).filter(Boolean);

const splitInstructions = (instructions = '') => instructions
    .split(/(?<=[.!?])\s+/)
    .map((step) => step.trim().replace(/[.]$/, ''))
    .filter(Boolean);

const ingredientPattern = (ingredient) => {
    const escaped = ingredient.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?:s)?(?![\\p{L}\\p{N}])`, 'iu');
};

const ingredientLabelVariants = (ingredient) => {
    const labels = new Set();
    const addLabel = (label) => {
        const normalized = label.trim();
        if (normalized) labels.add(normalized);
    };

    addLabel(ingredient);
    addLabel(translateIngredients(ingredient));

    // Recipes often omit descriptive words from the ingredient list:
    // "fresh ginger" appears as just "ginger", and "gừng tươi" as "gừng".
    const englishBase = ingredient
        .replace(/^(?:fresh|dried|ground|chopped|sliced|diced|crushed|cooked|raw|boneless|skinless|plain|whole|long|green|white|black|sweet|red|heavy|hot|cold)\s+/gi, '')
        .replace(/\s+(?:halves?|fillets?|leaves?|cloves?|ribs?|pieces?)$/i, '')
        .trim();
    addLabel(englishBase);

    const vietnameseLabel = translateIngredients(ingredient);
    const vietnameseBase = vietnameseLabel
        .replace(/^(?:hỗn hợp|miếng|tép|cọng|lá|hạt)\s+/iu, '')
        .replace(/\s+(?:tươi|khô|xay|băm|thái nhỏ|thái hạt lựu|đã nấu|đã nấu chín)$/iu, '')
        .trim();
    addLabel(vietnameseBase);

    return [...labels].sort((left, right) => right.length - left.length);
};

const removeIngredientFromInstructions = (instructions = '', removedIngredients = []) => {
    const labels = removedIngredients
        .flatMap(ingredientLabelVariants)
        .flatMap((ingredient) => [
            ingredient,
            ingredient.replace(/\s+cheese$/i, ''),
            ingredient.replace(/^phô mai\s+/i, ''),
        ])
        .filter(Boolean)
        .sort((left, right) => right.length - left.length);
    const removedCheeseTypes = labels.filter((label) => /(?:mozzarella|parmesan|phô mai)/i.test(label));
    const allKnownCheeseRemoved = removedCheeseTypes.some((label) => /mozzarella/i.test(label))
        && removedCheeseTypes.some((label) => /parmesan/i.test(label));

    return splitInstructions(instructions)
        .map((step) => {
            let clauses = step.split(/\s*;\s*|\s*,\s*/);
            let changed = false;
            labels.forEach((label) => {
                const pattern = ingredientPattern(label);
                clauses = clauses
                    .map((clause) => {
                        if (!pattern.test(clause)) {
                            return clause;
                        }

                        changed = true;

                        const escaped = label.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        return clause
                            .replace(new RegExp(`(?:in|with|together with|trong|với|cùng|add|cho|thêm|xếp|rắc)\\s+${escaped}`, 'iu'), '')
                            .replace(pattern, '')
                            .replace(/\s{2,}/g, ' ')
                            .trim();
                    })
                    .filter(Boolean);
            });
            return clauses
                .map((clause) => clause.trim())
                .filter((clause) => !/^(?:put|place|add|cho|xếp|rắc)\s+(?:in|into|on|vào|lên|trên)\s*(?:the\s+)?(?:pan|chảo|top|trên)?\b.*$/i.test(clause))
                .join(', ')
                .replace(allKnownCheeseRemoved ? /\s*(?:and|và)?\s*cook(?:ing)?\s+until\s+the\s+cheese\s+melted?/gi : /(?!)/, '')
                .replace(allKnownCheeseRemoved ? /\s*(?:và\s+)?nấu đến khi phô mai tan/gi : /(?!)/, '')
                .replace(changed ? /\s+(?:and|then|rồi|và)\s+/gi : /(?!)/, ' ')
                .replace(/\s+(?:and|then|rồi|và)\s*(?=,|$)/gi, '')
                .replace(/,\s*(?:and|then|rồi|và)\s+/gi, ', ')
                .replace(/\b(?:in|with|and|then|rồi|và)\s+(?=,|$)/gi, '')
                .replace(/\s+,/g, ',')
                .replace(/,\s*,/g, ',')
                .replace(/\s{2,}/g, ' ')
                .trim();
        })
        .filter(Boolean)
        .join('. ');
};

const DishDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { isAuthenticated } = useAuthContext();
    const [dishes, setDishes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [quantity, setQuantity] = useState(1);
    const [orderType, setOrderType] = useState('mang-ve');
    const [recipeModalOpen, setRecipeModalOpen] = useState(false);
    const [recipeModalView, setRecipeModalView] = useState('list');
    const [selectedRecipe, setSelectedRecipe] = useState(null);
    const [recipeName, setRecipeName] = useState('');
    const [selectedIngredients, setSelectedIngredients] = useState([]);
    const [draftRecipe, setDraftRecipe] = useState(null);
    const [savingRecipe, setSavingRecipe] = useState(false);
    const [selectedCustomization, setSelectedCustomization] = useState(null);

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
    }, [id]);

    const selectedDish = dishes.find((dish) => String(dish.dish_id) === String(id)) || dishes[0];

    const openOrderModal = (type) => {
        if (!isAuthenticated) {
            alert('Vui lòng đăng nhập để thực hiện thao tác này');
            navigate('/login?tab=register');
            return;
        }
        setQuantity(1);
        setOrderType(type);
        setSelectedCustomization(null);
        setIsModalOpen(true);
    };

    const recipeInstructionsInVietnamese = (recipe) => {
        const baseInstructions = recipeTranslations[selectedDish.dish_name] || '';
        return recipe.removed_ingredients?.length
            ? removeIngredientFromInstructions(baseInstructions, recipe.removed_ingredients.map(translateIngredients))
            : baseInstructions;
    };

    const handleDecreaseQty = () => {
        setQuantity((previous) => Math.max(1, (parseInt(previous, 10) || 1) - 1));
    };

    const handleIncreaseQty = () => {
        const max = selectedDish?.quantity_left ?? 10;
        setQuantity((previous) => Math.min(max, (parseInt(previous, 10) || 1) + 1));
    };

    const handleDecrease10Qty = () => {
        setQuantity((previous) => Math.max(1, (parseInt(previous, 10) || 1) - 10));
    };

    const handleIncrease10Qty = () => {
        const max = selectedDish?.quantity_left ?? 10;
        setQuantity((previous) => Math.min(max, (parseInt(previous, 10) || 1) + 10));
    };

    const handleSetMinQty = () => setQuantity(1);
    const handleSetMaxQty = () => setQuantity(selectedDish?.quantity_left ?? 10);

    const confirmAddToCart = () => {
        const qty = parseInt(quantity, 10);
        const maxQty = selectedDish?.quantity_left ?? 10;

        if (Number.isNaN(qty) || qty < 1) {
            alert('Vui lòng nhập số lượng hợp lệ!');
            return;
        }

        if (qty > maxQty) {
            alert('Đặt hàng quá số lượng còn lại');
            return;
        }

        const cartKey = orderType === 'mang-ve' ? 'delivery_cart' : 'booking_cart';
        const cart = JSON.parse(localStorage.getItem(cartKey) || '[]');
        const selectedRecipeId = selectedCustomization?.dish_customization_id ?? null;
        const existing = cart.find((item) => item.dish_id === selectedDish.dish_id && (item.customization_id ?? null) === selectedRecipeId);
        if (existing) existing.quantity += qty;
        else cart.push({
            dish_id: selectedDish.dish_id,
            name: selectedCustomization ? `${selectedDish.dish_name} (${selectedCustomization.recipe_name})` : selectedDish.dish_name,
            price: selectedDish.price,
            quantity: qty,
            image_url: selectedDish.image_url,
            customization_id: selectedCustomization?.dish_customization_id ?? null,
            customization_name: selectedCustomization?.recipe_name ?? null,
            ingredients: selectedCustomization?.ingredients ?? null,
            removed_ingredients: selectedCustomization?.removed_ingredients ?? [],
        });
        localStorage.setItem(cartKey, JSON.stringify(cart));
        setIsModalOpen(false);
        alert(`Thành công! Đã thêm ${qty} ${selectedDish.dish_name} vào giỏ hàng ${orderType === 'mang-ve' ? 'giao hàng' : 'đặt bàn'}.`);
    };

    const customRecipes = selectedDish?.custom_recipes || [];
    const originalIngredients = splitIngredients(selectedDish?.ingredients);

    const openRecipeModal = () => {
        setRecipeModalView('list');
        setSelectedRecipe(null);
        setRecipeModalOpen(true);
    };

    const startCreateRecipe = () => {
        setRecipeName('');
        setSelectedIngredients([...originalIngredients]);
        setDraftRecipe(null);
        setRecipeModalView('ingredients');
    };

    const startEditRecipe = (recipe) => {
        setSelectedRecipe(recipe);
        setRecipeName(recipe.recipe_name);
        setSelectedIngredients(splitIngredients(recipe.ingredients));
        setDraftRecipe(recipe);
        setRecipeModalView('ingredients');
    };

    const toggleRecipeIngredient = (ingredient) => {
        setSelectedIngredients((current) => current.includes(ingredient)
            ? current.filter((item) => item !== ingredient)
            : [...current, ingredient]);
    };

    const confirmRecipeIngredients = () => {
        const removed = originalIngredients.filter((ingredient) => !selectedIngredients.includes(ingredient));
        const baseInstructions = selectedDish.recipe_instructions || '';
        const englishInstructions = removeIngredientFromInstructions(baseInstructions, removed);
        const vietnameseInstructions = removeIngredientFromInstructions(
            recipeTranslations[selectedDish.dish_name] || '',
            removed.map(translateIngredients),
        );
        setDraftRecipe({
            ...(draftRecipe || {}),
            ingredients: selectedIngredients.join(', '),
            recipe_instructions: englishInstructions,
            removed_ingredients: removed,
            previewInstructions: vietnameseInstructions,
        });
        setRecipeModalView('preview');
    };

    const handleRecipeBack = () => {
        if (recipeModalView === 'ingredients') {
            setRecipeModalView('list');
            return;
        }
        setRecipeModalView('ingredients');
    };

    const saveRecipe = async () => {
        const removed = originalIngredients.filter((ingredient) => !selectedIngredients.includes(ingredient));
        const baseInstructions = selectedDish.recipe_instructions || '';
        const englishInstructions = removeIngredientFromInstructions(baseInstructions, removed);
        if (!recipeName.trim() || selectedIngredients.length === originalIngredients.length) {
            alert('Vui lòng nhập tên và bỏ ít nhất một nguyên liệu.');
            return;
        }

        setSavingRecipe(true);
        try {
            const response = await dishCustomizationAPI.save(selectedDish.dish_id, {
                customization_id: draftRecipe?.dish_customization_id,
                recipe_name: recipeName.trim(),
                ingredients: selectedIngredients.join(', '),
                recipe_instructions: englishInstructions,
                removed_ingredients: removed,
                replacements: [],
            });
            const saved = response.data.custom_recipe;
            setDishes((current) => current.map((dish) => String(dish.dish_id) === String(selectedDish.dish_id)
                ? { ...dish, custom_recipes: [...(dish.custom_recipes || []).filter((item) => item.dish_customization_id !== saved.dish_customization_id), saved] }
                : dish));
            setRecipeModalView('list');
            setSelectedRecipe(null);
            setDraftRecipe(null);
        } catch (saveError) {
            alert('Không thể lưu công thức thay thế. Vui lòng thử lại.');
        } finally {
            setSavingRecipe(false);
        }
    };

    if (loading) return <Loading />;
    if (error) return <div className="max-w-5xl mx-auto px-4 py-8"><ErrorMessage message={error} /></div>;
    if (!selectedDish) return null;

    const displayedIngredients = selectedDish.ingredients;
    const displayedInstructions = recipeTranslations[selectedDish.dish_name] || selectedDish.recipe_instructions;
    const steps = splitInstructions(displayedInstructions);

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
                            <p className="text-gray-700 leading-7">{translateIngredients(displayedIngredients)}</p>
                            <div className="grid grid-cols-2 gap-3 mt-6">
                                <button onClick={() => openOrderModal('mang-ve')} className="py-2 px-3 rounded border border-red-600 text-red-600 font-semibold hover:bg-red-600 hover:text-white transition">Đặt Ship</button>
                                <button onClick={() => openOrderModal('dat-ban')} className="py-2 px-3 rounded border border-gray-800 text-gray-800 font-semibold hover:bg-gray-800 hover:text-white transition">Đặt Bàn</button>
                            </div>
                        </div>
                    </div>
                    <section className="mt-8 border-t pt-6">
                        <h3 className="text-xl font-bold text-red-600 mb-4">Công thức nấu</h3>
                        <ol className="list-decimal list-inside space-y-3 text-gray-700 leading-7">
                            {steps.map((step, index) => <li key={`${selectedDish.dish_id}-${index}`}>{step.trim().replace(/[.]$/, '')}.</li>)}
                        </ol>
                        <button onClick={openRecipeModal} className="mt-5 rounded border border-amber-600 px-4 py-2 font-semibold text-amber-700 hover:bg-amber-50">
                            Xem công thức thay thế
                        </button>
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
            <Modal
                isOpen={isModalOpen}
                title={`Đặt món: ${selectedDish.dish_name}`}
                onClose={() => setIsModalOpen(false)}
                onConfirm={confirmAddToCart}
                confirmText="Xác nhận thêm vào giỏ hàng"
            >
                <div className="flex flex-col gap-4">
                    {selectedDish.quantity_left !== undefined && (
                        <div>
                            <span className={`text-sm font-semibold ${selectedDish.quantity_left <= 15 ? 'text-red-600' : 'text-green-700'}`}>
                                Còn lại {selectedDish.quantity_left} phần
                            </span>
                        </div>
                    )}

                    <div>
                        <label className="block font-semibold mb-2 text-gray-700">Chọn công thức thay thế</label>
                        <div className="flex flex-col items-start gap-2">
                            <button
                                type="button"
                                onClick={() => setSelectedCustomization(null)}
                                className={`rounded border px-3 py-2 text-left ${!selectedCustomization ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-300 bg-white text-gray-700'}`}
                            >
                                Món gốc
                            </button>

                            {(selectedDish?.custom_recipes || []).length === 0 ? (
                                <p className="text-sm text-gray-500">Bạn chưa lưu công thức thay thế nào cho món này.</p>
                            ) : (selectedDish?.custom_recipes || []).map((recipe) => (
                                <button
                                    key={recipe.dish_customization_id}
                                    type="button"
                                    onClick={() => setSelectedCustomization(recipe)}
                                    className={`rounded border px-3 py-2 text-left ${selectedCustomization?.dish_customization_id === recipe.dish_customization_id ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-300 bg-white text-gray-700'}`}
                                >
                                    {recipe.recipe_name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block font-semibold mb-1 text-gray-700">Nhập số lượng</label>
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={handleDecrease10Qty} className="px-2 h-9 flex-shrink-0 border border-gray-300 rounded text-xs font-semibold hover:bg-gray-100">−10</button>
                            <button type="button" onClick={handleDecreaseQty} className="w-9 h-9 flex-shrink-0 flex items-center justify-center border border-gray-300 rounded font-bold text-lg hover:bg-gray-100">−</button>
                            <button type="button" onClick={handleSetMinQty} className="px-3 h-9 flex-shrink-0 border border-gray-300 rounded text-sm font-semibold hover:bg-gray-100">Min</button>
                            <input
                                type="number"
                                value={quantity}
                                onChange={(event) => setQuantity(event.target.value)}
                                className="flex-1 min-w-0 border border-gray-300 rounded px-3 py-2 text-center focus:outline-none focus:border-red-600"
                            />
                            <button type="button" onClick={handleSetMaxQty} className="px-3 h-9 flex-shrink-0 border border-gray-300 rounded text-sm font-semibold hover:bg-gray-100">Max</button>
                            <button type="button" onClick={handleIncreaseQty} className="w-9 h-9 flex-shrink-0 flex items-center justify-center border border-gray-300 rounded font-bold text-lg hover:bg-gray-100">+</button>
                            <button type="button" onClick={handleIncrease10Qty} className="px-2 h-9 flex-shrink-0 border border-gray-300 rounded text-xs font-semibold hover:bg-gray-100">+10</button>
                        </div>
                    </div>
                </div>
            </Modal>
            <Modal
                isOpen={recipeModalOpen}
                className="max-w-3xl max-h-[90vh] overflow-y-auto"
                title={recipeModalView === 'list' ? 'Công thức thay thế' : recipeModalView === 'detail' ? selectedRecipe?.recipe_name : recipeModalView === 'preview' ? 'Công thức mới' : draftRecipe ? 'Chỉnh sửa công thức' : 'Tạo công thức'}
                onClose={() => setRecipeModalOpen(false)}
                onSecondary={recipeModalView === 'detail' ? () => startEditRecipe(selectedRecipe) : recipeModalView === 'ingredients' || recipeModalView === 'preview' ? handleRecipeBack : undefined}
                secondaryText="Quay lại"
                secondaryClassName={recipeModalView === 'detail' ? 'font-semibold !border-amber-600 !text-amber-700 hover:!bg-amber-50' : ''}
                onTertiary={recipeModalView === 'detail' ? () => setRecipeModalView('list') : undefined}
                tertiaryText="Quay lại"
                onConfirm={recipeModalView === 'preview' && draftRecipe ? saveRecipe : undefined}
                confirmText={savingRecipe ? 'Đang lưu...' : 'Lưu công thức'}
            >
                {recipeModalView === 'list' && (
                    <div className="flex flex-col gap-3">
                        {customRecipes.length === 0 ? (
                            <p className="text-gray-600">Món ăn này chưa có công thức thay thế.</p>
                        ) : customRecipes.map((recipe) => (
                            <button key={recipe.dish_customization_id} onClick={() => { setSelectedRecipe(recipe); setRecipeModalView('detail'); }} className="self-start rounded border border-gray-300 px-4 py-3 text-left font-semibold hover:border-amber-600 hover:bg-amber-50">
                                {recipe.recipe_name}
                            </button>
                        ))}
                        <button onClick={startCreateRecipe} className="self-start rounded bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-700">
                            Tạo công thức mới
                        </button>
                    </div>
                )}

                {recipeModalView === 'detail' && selectedRecipe && (
                    <div className="flex flex-col gap-4">
                        <div className="border-b border-gray-200 pb-4">
                            <h4 className="font-semibold text-red-600">Nguyên liệu đã bỏ</h4>
                            <p className="mt-1 text-gray-700">{selectedRecipe.removed_ingredients?.length ? translateIngredients(selectedRecipe.removed_ingredients.join(', ')) : 'Không có'}</p>
                        </div>
                        <div className="border-b border-gray-200 pb-4">
                            <h4 className="font-semibold text-red-600">Nguyên liệu còn lại</h4>
                            <p className="mt-1 text-gray-700">{translateIngredients(selectedRecipe.ingredients)}</p>
                        </div>
                        <div>
                            <h4 className="font-semibold text-red-600">Công thức nấu</h4>
                            <ol className="mt-1 list-decimal list-inside space-y-1 text-gray-700">
                                {splitInstructions(recipeInstructionsInVietnamese(selectedRecipe)).map((step, index) => <li key={index}>{step}.</li>)}
                            </ol>
                        </div>
                    </div>
                )}

                {recipeModalView === 'ingredients' && (
                    <div className="flex flex-col gap-4">
                        <div>
                            <label className="mb-1 block font-semibold text-red-600">Tên công thức</label>
                            <input value={recipeName} onChange={(event) => setRecipeName(event.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 focus:border-amber-600 focus:outline-none" placeholder="Ví dụ: Bò kho không rau mùi" />
                        </div>
                        <div>
                            <p className="mb-2 font-semibold text-red-600">Nguyên liệu</p>
                            <div className="flex flex-wrap gap-2">
                                {originalIngredients.map((ingredient) => {
                                    const selected = selectedIngredients.includes(ingredient);
                                    return <button type="button" key={ingredient} onClick={() => toggleRecipeIngredient(ingredient)} className={`rounded border px-3 py-2 text-left text-sm ${selected ? 'border-red-600 bg-red-600 text-white' : 'border-gray-300 bg-gray-100 text-gray-500 line-through'}`}>{translateIngredients(ingredient)}</button>;
                                })}
                            </div>
                            <p className="mt-3 text-sm text-gray-600">Quý khách vui lòng nhấn chọn nguyên liệu muốn bỏ ra</p>
                        </div>
                        <button type="button" onClick={confirmRecipeIngredients} className="rounded bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700">
                            Xác nhận nguyên liệu
                        </button>
                    </div>
                )}

                {recipeModalView === 'preview' && draftRecipe && (
                    <div>
                        <p className="mb-3 text-gray-700">Công thức sau khi bỏ nguyên liệu:</p>
                        <ol className="list-decimal list-inside space-y-2 text-gray-700 leading-7">
                            {splitInstructions(draftRecipe.previewInstructions).map((step, index) => <li key={index}>{step}.</li>)}
                        </ol>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export { translateIngredients };
export default DishDetailPage;
