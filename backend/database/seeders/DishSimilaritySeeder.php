<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DishSimilaritySeeder extends Seeder
{
    /**
     * Dữ liệu độ tương đồng giữa các món, tính sẵn (offline) bằng adjusted
     * cosine similarity trên rating thật từ dataset Food.com Recipes and
     * Reviews. Chỉ chứa các cặp có ít nhất 1 user chấm cả 2 món (254/351 cặp
     * khả dĩ) - cặp không có dữ liệu chung thì KHÔNG được insert, để phía
     * ứng dụng tự biết fallback sang gợi ý khác (VD cùng nhóm chế biến,
     * bestseller) thay vì hiểu nhầm "không có dữ liệu" thành "trung lập = 0".
     *
     * Khóa: recipe_id_1 / recipe_id_2 là food_com_recipe_id (ID gốc bên
     * Food.com), KHÔNG phải dish_id thật trong DB - seeder này tự tra cứu
     * dish_id tương ứng qua cột dishes.food_com_recipe_id trước khi insert.
     */
    public function run(): void
    {
        $pairs = [
            ['recipe_id_1' => 39087, 'recipe_id_2' => 150863, 'similarity_score' => -0.00582],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 39087, 'similarity_score' => 0.16031],
            ['recipe_id_1' => 19135, 'recipe_id_2' => 39087, 'similarity_score' => 0.51030],
            ['recipe_id_1' => 20755, 'recipe_id_2' => 39087, 'similarity_score' => 0.04199],
            ['recipe_id_1' => 39087, 'recipe_id_2' => 80536, 'similarity_score' => -0.00342],
            ['recipe_id_1' => 39087, 'recipe_id_2' => 40022, 'similarity_score' => -0.14569],
            ['recipe_id_1' => 20755, 'recipe_id_2' => 150863, 'similarity_score' => 0.47527],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 150863, 'similarity_score' => -0.13271],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 20755, 'similarity_score' => -0.31761],
            ['recipe_id_1' => 31717, 'recipe_id_2' => 39087, 'similarity_score' => -0.23383],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 19135, 'similarity_score' => 0.17322],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 40022, 'similarity_score' => -0.26086],
            ['recipe_id_1' => 17990, 'recipe_id_2' => 39087, 'similarity_score' => -0.02788],
            ['recipe_id_1' => 19135, 'recipe_id_2' => 20755, 'similarity_score' => 0.28644],
            ['recipe_id_1' => 40022, 'recipe_id_2' => 150863, 'similarity_score' => 0.51064],
            ['recipe_id_1' => 19135, 'recipe_id_2' => 150863, 'similarity_score' => -0.01342],
            ['recipe_id_1' => 31717, 'recipe_id_2' => 40022, 'similarity_score' => 0.07287],
            ['recipe_id_1' => 36984, 'recipe_id_2' => 39087, 'similarity_score' => -0.02701],
            ['recipe_id_1' => 20755, 'recipe_id_2' => 40022, 'similarity_score' => 0.00201],
            ['recipe_id_1' => 17990, 'recipe_id_2' => 19135, 'similarity_score' => -0.20530],
            ['recipe_id_1' => 39087, 'recipe_id_2' => 79563, 'similarity_score' => -0.61445],
            ['recipe_id_1' => 20755, 'recipe_id_2' => 80536, 'similarity_score' => -0.38867],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 80536, 'similarity_score' => -0.29421],
            ['recipe_id_1' => 19135, 'recipe_id_2' => 40022, 'similarity_score' => 0.40031],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 31717, 'similarity_score' => -0.02131],
            ['recipe_id_1' => 31717, 'recipe_id_2' => 150863, 'similarity_score' => -0.23548],
            ['recipe_id_1' => 16887, 'recipe_id_2' => 39087, 'similarity_score' => -0.00288],
            ['recipe_id_1' => 19135, 'recipe_id_2' => 31717, 'similarity_score' => 0.01965],
            ['recipe_id_1' => 17990, 'recipe_id_2' => 40022, 'similarity_score' => -0.52869],
            ['recipe_id_1' => 17990, 'recipe_id_2' => 80536, 'similarity_score' => -0.10458],
            ['recipe_id_1' => 80536, 'recipe_id_2' => 150863, 'similarity_score' => -0.11738],
            ['recipe_id_1' => 17990, 'recipe_id_2' => 150863, 'similarity_score' => 0.47860],
            ['recipe_id_1' => 79563, 'recipe_id_2' => 150863, 'similarity_score' => -0.28551],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 17990, 'similarity_score' => -0.53007],
            ['recipe_id_1' => 79563, 'recipe_id_2' => 80536, 'similarity_score' => 0.59357],
            ['recipe_id_1' => 39087, 'recipe_id_2' => 58428, 'similarity_score' => 0.34249],
            ['recipe_id_1' => 40022, 'recipe_id_2' => 80536, 'similarity_score' => -0.00493],
            ['recipe_id_1' => 20755, 'recipe_id_2' => 31717, 'similarity_score' => 0.16304],
            ['recipe_id_1' => 19135, 'recipe_id_2' => 80536, 'similarity_score' => -0.21486],
            ['recipe_id_1' => 39087, 'recipe_id_2' => 71472, 'similarity_score' => -0.79549],
            ['recipe_id_1' => 36984, 'recipe_id_2' => 80536, 'similarity_score' => 0.48700],
            ['recipe_id_1' => 39087, 'recipe_id_2' => 134053, 'similarity_score' => 0.62903],
            ['recipe_id_1' => 20755, 'recipe_id_2' => 79563, 'similarity_score' => 0.69997],
            ['recipe_id_1' => 25806, 'recipe_id_2' => 39087, 'similarity_score' => 0.43920],
            ['recipe_id_1' => 17990, 'recipe_id_2' => 20755, 'similarity_score' => 0.63295],
            ['recipe_id_1' => 39087, 'recipe_id_2' => 63446, 'similarity_score' => 0.18797],
            ['recipe_id_1' => 39087, 'recipe_id_2' => 105080, 'similarity_score' => -0.12925],
            ['recipe_id_1' => 31717, 'recipe_id_2' => 36984, 'similarity_score' => -0.10050],
            ['recipe_id_1' => 25806, 'recipe_id_2' => 40022, 'similarity_score' => -0.18535],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 79563, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 31717, 'recipe_id_2' => 80536, 'similarity_score' => -0.21743],
            ['recipe_id_1' => 16887, 'recipe_id_2' => 150863, 'similarity_score' => 0.41169],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 58428, 'similarity_score' => 0.33439],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 36984, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 36984, 'recipe_id_2' => 150863, 'similarity_score' => 0.13688],
            ['recipe_id_1' => 39087, 'recipe_id_2' => 120810, 'similarity_score' => -0.77492],
            ['recipe_id_1' => 17990, 'recipe_id_2' => 58428, 'similarity_score' => 0.30285],
            ['recipe_id_1' => 19135, 'recipe_id_2' => 39618, 'similarity_score' => -0.15650],
            ['recipe_id_1' => 20755, 'recipe_id_2' => 25806, 'similarity_score' => -0.36090],
            ['recipe_id_1' => 20755, 'recipe_id_2' => 36984, 'similarity_score' => 0.47402],
            ['recipe_id_1' => 25806, 'recipe_id_2' => 31717, 'similarity_score' => 0.54046],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 39618, 'similarity_score' => 0.00025],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 134053, 'similarity_score' => -0.27576],
            ['recipe_id_1' => 39087, 'recipe_id_2' => 39618, 'similarity_score' => -0.21111],
            ['recipe_id_1' => 39618, 'recipe_id_2' => 150863, 'similarity_score' => -0.13960],
            ['recipe_id_1' => 58428, 'recipe_id_2' => 134053, 'similarity_score' => -0.18616],
            ['recipe_id_1' => 17990, 'recipe_id_2' => 79563, 'similarity_score' => 0.71425],
            ['recipe_id_1' => 19135, 'recipe_id_2' => 79563, 'similarity_score' => -0.01763],
            ['recipe_id_1' => 19135, 'recipe_id_2' => 25806, 'similarity_score' => 0.24301],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 71472, 'similarity_score' => 0.78961],
            ['recipe_id_1' => 39087, 'recipe_id_2' => 183399, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 16887, 'recipe_id_2' => 20755, 'similarity_score' => -0.07921],
            ['recipe_id_1' => 17990, 'recipe_id_2' => 36984, 'similarity_score' => 0.06827],
            ['recipe_id_1' => 17990, 'recipe_id_2' => 31717, 'similarity_score' => -0.08132],
            ['recipe_id_1' => 19135, 'recipe_id_2' => 36984, 'similarity_score' => -0.34482],
            ['recipe_id_1' => 134053, 'recipe_id_2' => 150863, 'similarity_score' => 0.49421],
            ['recipe_id_1' => 31717, 'recipe_id_2' => 134053, 'similarity_score' => -0.37826],
            ['recipe_id_1' => 31717, 'recipe_id_2' => 79563, 'similarity_score' => -0.12338],
            ['recipe_id_1' => 19135, 'recipe_id_2' => 105080, 'similarity_score' => -0.06625],
            ['recipe_id_1' => 25806, 'recipe_id_2' => 150863, 'similarity_score' => -0.34589],
            ['recipe_id_1' => 20755, 'recipe_id_2' => 39618, 'similarity_score' => 0.73025],
            ['recipe_id_1' => 19135, 'recipe_id_2' => 134053, 'similarity_score' => -0.10049],
            ['recipe_id_1' => 39087, 'recipe_id_2' => 61614, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 40022, 'recipe_id_2' => 79563, 'similarity_score' => 0.48851],
            ['recipe_id_1' => 39618, 'recipe_id_2' => 40022, 'similarity_score' => -0.23335],
            ['recipe_id_1' => 39618, 'recipe_id_2' => 80536, 'similarity_score' => -0.34356],
            ['recipe_id_1' => 17990, 'recipe_id_2' => 134053, 'similarity_score' => 0.80567],
            ['recipe_id_1' => 16887, 'recipe_id_2' => 39618, 'similarity_score' => -0.09875],
            ['recipe_id_1' => 17990, 'recipe_id_2' => 39618, 'similarity_score' => -0.41547],
            ['recipe_id_1' => 20755, 'recipe_id_2' => 63446, 'similarity_score' => -0.07567],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 25806, 'similarity_score' => 0.23143],
            ['recipe_id_1' => 16887, 'recipe_id_2' => 19135, 'similarity_score' => 0.12396],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 183399, 'similarity_score' => -0.68563],
            ['recipe_id_1' => 105080, 'recipe_id_2' => 150863, 'similarity_score' => 0.69021],
            ['recipe_id_1' => 40022, 'recipe_id_2' => 58428, 'similarity_score' => 0.06310],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 63446, 'similarity_score' => 0.72884],
            ['recipe_id_1' => 19135, 'recipe_id_2' => 63446, 'similarity_score' => 0.49617],
            ['recipe_id_1' => 20755, 'recipe_id_2' => 134053, 'similarity_score' => 0.87570],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 105080, 'similarity_score' => 0.67642],
            ['recipe_id_1' => 31717, 'recipe_id_2' => 58428, 'similarity_score' => 0.74522],
            ['recipe_id_1' => 31717, 'recipe_id_2' => 39618, 'similarity_score' => 0.46722],
            ['recipe_id_1' => 17990, 'recipe_id_2' => 25806, 'similarity_score' => -0.58313],
            ['recipe_id_1' => 150863, 'recipe_id_2' => 183399, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 80536, 'recipe_id_2' => 134053, 'similarity_score' => -0.11712],
            ['recipe_id_1' => 120810, 'recipe_id_2' => 150863, 'similarity_score' => 0.06874],
            ['recipe_id_1' => 58428, 'recipe_id_2' => 80536, 'similarity_score' => -0.60726],
            ['recipe_id_1' => 39618, 'recipe_id_2' => 79563, 'similarity_score' => -0.87987],
            ['recipe_id_1' => 36984, 'recipe_id_2' => 79563, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 58428, 'recipe_id_2' => 79563, 'similarity_score' => -0.30052],
            ['recipe_id_1' => 36984, 'recipe_id_2' => 40022, 'similarity_score' => -0.29124],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 120810, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 17990, 'recipe_id_2' => 71472, 'similarity_score' => 0.06426],
            ['recipe_id_1' => 36984, 'recipe_id_2' => 63446, 'similarity_score' => 0.55103],
            ['recipe_id_1' => 40022, 'recipe_id_2' => 105080, 'similarity_score' => 0.58792],
            ['recipe_id_1' => 63446, 'recipe_id_2' => 150863, 'similarity_score' => -0.27019],
            ['recipe_id_1' => 80536, 'recipe_id_2' => 120810, 'similarity_score' => -0.20559],
            ['recipe_id_1' => 80536, 'recipe_id_2' => 105080, 'similarity_score' => 0.21174],
            ['recipe_id_1' => 19135, 'recipe_id_2' => 71472, 'similarity_score' => 0.32607],
            ['recipe_id_1' => 20755, 'recipe_id_2' => 58428, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 16887, 'recipe_id_2' => 80536, 'similarity_score' => 0.30003],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 16887, 'similarity_score' => -0.17368],
            ['recipe_id_1' => 25806, 'recipe_id_2' => 105080, 'similarity_score' => -0.54662],
            ['recipe_id_1' => 31717, 'recipe_id_2' => 63446, 'similarity_score' => -0.39699],
            ['recipe_id_1' => 25806, 'recipe_id_2' => 79563, 'similarity_score' => 0.52205],
            ['recipe_id_1' => 20755, 'recipe_id_2' => 71472, 'similarity_score' => 0.35851],
            ['recipe_id_1' => 20755, 'recipe_id_2' => 105080, 'similarity_score' => 0.17540],
            ['recipe_id_1' => 79563, 'recipe_id_2' => 134053, 'similarity_score' => 0.49002],
            ['recipe_id_1' => 31717, 'recipe_id_2' => 183399, 'similarity_score' => 0.56277],
            ['recipe_id_1' => 39618, 'recipe_id_2' => 183399, 'similarity_score' => 0.33600],
            ['recipe_id_1' => 71472, 'recipe_id_2' => 150863, 'similarity_score' => 0.14653],
            ['recipe_id_1' => 36984, 'recipe_id_2' => 58428, 'similarity_score' => -0.75633],
            ['recipe_id_1' => 36984, 'recipe_id_2' => 39618, 'similarity_score' => -0.65594],
            ['recipe_id_1' => 40022, 'recipe_id_2' => 134053, 'similarity_score' => -0.81303],
            ['recipe_id_1' => 40022, 'recipe_id_2' => 71472, 'similarity_score' => -0.64726],
            ['recipe_id_1' => 25806, 'recipe_id_2' => 80536, 'similarity_score' => 0.31403],
            ['recipe_id_1' => 16887, 'recipe_id_2' => 40022, 'similarity_score' => -0.73319],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 108893, 'similarity_score' => -0.97267],
            ['recipe_id_1' => 17990, 'recipe_id_2' => 63446, 'similarity_score' => 0.84194],
            ['recipe_id_1' => 19135, 'recipe_id_2' => 58428, 'similarity_score' => 0.01506],
            ['recipe_id_1' => 25806, 'recipe_id_2' => 36984, 'similarity_score' => -0.52734],
            ['recipe_id_1' => 40022, 'recipe_id_2' => 63446, 'similarity_score' => -0.94826],
            ['recipe_id_1' => 19135, 'recipe_id_2' => 120810, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 31717, 'recipe_id_2' => 105080, 'similarity_score' => 0.92160],
            ['recipe_id_1' => 61614, 'recipe_id_2' => 80536, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 58428, 'recipe_id_2' => 150863, 'similarity_score' => 0.06217],
            ['recipe_id_1' => 63446, 'recipe_id_2' => 80536, 'similarity_score' => 0.69401],
            ['recipe_id_1' => 58428, 'recipe_id_2' => 63446, 'similarity_score' => -0.64711],
            ['recipe_id_1' => 71472, 'recipe_id_2' => 79563, 'similarity_score' => 0.81446],
            ['recipe_id_1' => 63446, 'recipe_id_2' => 134053, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 39618, 'recipe_id_2' => 134053, 'similarity_score' => -0.37421],
            ['recipe_id_1' => 39618, 'recipe_id_2' => 58428, 'similarity_score' => 0.07998],
            ['recipe_id_1' => 80536, 'recipe_id_2' => 183399, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 79563, 'recipe_id_2' => 143985, 'similarity_score' => -0.01482],
            ['recipe_id_1' => 134053, 'recipe_id_2' => 183399, 'similarity_score' => -0.29795],
            ['recipe_id_1' => 36984, 'recipe_id_2' => 134053, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 36984, 'recipe_id_2' => 71472, 'similarity_score' => 0.67716],
            ['recipe_id_1' => 39087, 'recipe_id_2' => 58122, 'similarity_score' => -0.41854],
            ['recipe_id_1' => 39618, 'recipe_id_2' => 63446, 'similarity_score' => 0.08475],
            ['recipe_id_1' => 16887, 'recipe_id_2' => 134053, 'similarity_score' => 0.30306],
            ['recipe_id_1' => 16887, 'recipe_id_2' => 183399, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 16887, 'recipe_id_2' => 120810, 'similarity_score' => -0.88492],
            ['recipe_id_1' => 16887, 'recipe_id_2' => 105080, 'similarity_score' => -0.98395],
            ['recipe_id_1' => 16887, 'recipe_id_2' => 31717, 'similarity_score' => 0.10308],
            ['recipe_id_1' => 16887, 'recipe_id_2' => 17990, 'similarity_score' => -0.07706],
            ['recipe_id_1' => 16887, 'recipe_id_2' => 79563, 'similarity_score' => -0.00628],
            ['recipe_id_1' => 79563, 'recipe_id_2' => 183399, 'similarity_score' => -0.49558],
            ['recipe_id_1' => 79563, 'recipe_id_2' => 120810, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 80536, 'recipe_id_2' => 108893, 'similarity_score' => -0.98610],
            ['recipe_id_1' => 58428, 'recipe_id_2' => 71472, 'similarity_score' => -0.38063],
            ['recipe_id_1' => 63446, 'recipe_id_2' => 120810, 'similarity_score' => -0.39531],
            ['recipe_id_1' => 71472, 'recipe_id_2' => 80536, 'similarity_score' => 0.54139],
            ['recipe_id_1' => 63446, 'recipe_id_2' => 79563, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 61614, 'recipe_id_2' => 79563, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 25806, 'recipe_id_2' => 183399, 'similarity_score' => 0.90468],
            ['recipe_id_1' => 17990, 'recipe_id_2' => 183399, 'similarity_score' => -0.34502],
            ['recipe_id_1' => 20755, 'recipe_id_2' => 58122, 'similarity_score' => 0.48017],
            ['recipe_id_1' => 20755, 'recipe_id_2' => 120810, 'similarity_score' => -0.29352],
            ['recipe_id_1' => 19135, 'recipe_id_2' => 183399, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 16887, 'recipe_id_2' => 63446, 'similarity_score' => -0.17105],
            ['recipe_id_1' => 16887, 'recipe_id_2' => 58428, 'similarity_score' => -0.97943],
            ['recipe_id_1' => 25806, 'recipe_id_2' => 120810, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 16887, 'recipe_id_2' => 71472, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 20755, 'recipe_id_2' => 61614, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 25806, 'recipe_id_2' => 58428, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 31717, 'recipe_id_2' => 61614, 'similarity_score' => -0.29728],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 61614, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 17990, 'recipe_id_2' => 61614, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 16887, 'recipe_id_2' => 36984, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 4627, 'recipe_id_2' => 58122, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 25806, 'recipe_id_2' => 39618, 'similarity_score' => -0.92850],
            ['recipe_id_1' => 143985, 'recipe_id_2' => 150863, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 61614, 'recipe_id_2' => 134053, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 63446, 'recipe_id_2' => 108893, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 61614, 'recipe_id_2' => 120810, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 71472, 'recipe_id_2' => 134053, 'similarity_score' => -0.44233],
            ['recipe_id_1' => 71472, 'recipe_id_2' => 183399, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 79563, 'recipe_id_2' => 108893, 'similarity_score' => 0.16205],
            ['recipe_id_1' => 105080, 'recipe_id_2' => 134053, 'similarity_score' => -0.49736],
            ['recipe_id_1' => 40022, 'recipe_id_2' => 183399, 'similarity_score' => -0.94826],
            ['recipe_id_1' => 58428, 'recipe_id_2' => 105080, 'similarity_score' => 0.75644],
            ['recipe_id_1' => 58428, 'recipe_id_2' => 183399, 'similarity_score' => -0.34028],
            ['recipe_id_1' => 71472, 'recipe_id_2' => 105080, 'similarity_score' => -0.78114],
            ['recipe_id_1' => 63446, 'recipe_id_2' => 105080, 'similarity_score' => -0.14919],
            ['recipe_id_1' => 39618, 'recipe_id_2' => 71472, 'similarity_score' => 0.28500],
            ['recipe_id_1' => 39618, 'recipe_id_2' => 105080, 'similarity_score' => -0.33609],
            ['recipe_id_1' => 120810, 'recipe_id_2' => 134053, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 36984, 'recipe_id_2' => 105080, 'similarity_score' => -0.41396],
            ['recipe_id_1' => 31717, 'recipe_id_2' => 120810, 'similarity_score' => -0.22861],
            ['recipe_id_1' => 39087, 'recipe_id_2' => 108893, 'similarity_score' => -0.66812],
            ['recipe_id_1' => 79563, 'recipe_id_2' => 105080, 'similarity_score' => -0.44061],
            ['recipe_id_1' => 40022, 'recipe_id_2' => 61614, 'similarity_score' => -0.49306],
            ['recipe_id_1' => 20755, 'recipe_id_2' => 183399, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 19135, 'recipe_id_2' => 58122, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 20755, 'recipe_id_2' => 108893, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 19135, 'recipe_id_2' => 61614, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 17990, 'recipe_id_2' => 105080, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 16887, 'recipe_id_2' => 25806, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 16887, 'recipe_id_2' => 61614, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 16887, 'recipe_id_2' => 108893, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 17990, 'recipe_id_2' => 120810, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 17990, 'recipe_id_2' => 108893, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 19135, 'recipe_id_2' => 108893, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 31717, 'recipe_id_2' => 71472, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 31717, 'recipe_id_2' => 58122, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 25806, 'recipe_id_2' => 134053, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 25806, 'recipe_id_2' => 63446, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 39618, 'recipe_id_2' => 120810, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 40022, 'recipe_id_2' => 120810, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 40022, 'recipe_id_2' => 108893, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 40022, 'recipe_id_2' => 58122, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 36984, 'recipe_id_2' => 61614, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 36984, 'recipe_id_2' => 183399, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 31717, 'recipe_id_2' => 108893, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 36984, 'recipe_id_2' => 58122, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 36984, 'recipe_id_2' => 108893, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 39618, 'recipe_id_2' => 108893, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 39618, 'recipe_id_2' => 61614, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 36984, 'recipe_id_2' => 120810, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 40022, 'recipe_id_2' => 143985, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 63446, 'recipe_id_2' => 71472, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 61614, 'recipe_id_2' => 108893, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 58122, 'recipe_id_2' => 63446, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 58122, 'recipe_id_2' => 105080, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 58122, 'recipe_id_2' => 134053, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 58122, 'recipe_id_2' => 61614, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 61614, 'recipe_id_2' => 63446, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 63446, 'recipe_id_2' => 183399, 'similarity_score' => 1.00000],
            ['recipe_id_1' => 79563, 'recipe_id_2' => 115147, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 105080, 'recipe_id_2' => 183399, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 80536, 'recipe_id_2' => 143985, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 108893, 'recipe_id_2' => 134053, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 108893, 'recipe_id_2' => 120810, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 134053, 'recipe_id_2' => 143985, 'similarity_score' => -1.00000],
            ['recipe_id_1' => 115147, 'recipe_id_2' => 150863, 'similarity_score' => 1.00000],
        ];

        // Tra cứu food_com_recipe_id -> dish_id thật trong DB
        $recipeIdToDishId = DB::table('dishes')
            ->whereNotNull('food_com_recipe_id')
            ->pluck('dish_id', 'food_com_recipe_id');

        $rows = [];
        $skipped = 0;

        foreach ($pairs as $pair) {
            $dishId1 = $recipeIdToDishId[$pair['recipe_id_1']] ?? null;
            $dishId2 = $recipeIdToDishId[$pair['recipe_id_2']] ?? null;

            if (!$dishId1 || !$dishId2) {
                // Món tương ứng chưa tồn tại trong bảng dishes (VD đã đổi món khác)
                $skipped++;
                continue;
            }

            // Đảm bảo dish_id_1 < dish_id_2 để khớp UNIQUE constraint,
            // tránh insert trùng cả 2 chiều (A,B) và (B,A)
            $sorted = $dishId1 < $dishId2 ? [$dishId1, $dishId2] : [$dishId2, $dishId1];

            $rows[] = [
                'dish_id_1' => $sorted[0],
                'dish_id_2' => $sorted[1],
                'similarity_score' => $pair['similarity_score'],
                'created_at' => now(),
            ];
        }

        if (count($rows) > 0) {
            // Chia batch 500 dòng/lần để tránh vượt giới hạn placeholder của PostgreSQL
            foreach (array_chunk($rows, 500) as $batch) {
                DB::table('dish_similarities')->insert($batch);
            }
        }

        $this->command->info("✅ Đã seed {$this->pluralCount($rows)} cặp độ tương đồng"
            . ($skipped > 0 ? ", bỏ qua {$skipped} cặp do món không còn tồn tại." : "."));
    }

    private function pluralCount(array $rows): int
    {
        return count($rows);
    }
}