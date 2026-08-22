<?php

return [
    'tmn_code'    => env('VNPAY_TMN_CODE'),
    'hash_secret' => env('VNPAY_HASH_SECRET'),
    'url'         => env('VNPAY_URL', 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'),
    'return_url'  => env('VNPAY_RETURN_URL'),
    'api_url'     => env('VNPAY_API_URL', 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction'),
    'version'     => '2.1.0',
    'locale'      => 'vn',
    'curr_code'   => 'VND',
];