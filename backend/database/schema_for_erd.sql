-- HGHRestaurantWeb | PostgreSQL schema for ERD and PowerDesigner
-- Source: all 46 files in backend/database/migrations, verified on PostgreSQL 16.
-- Run the entire script once in a new, empty database with UTF-8 encoding.
-- The executing role needs permission to create objects and install btree_gist.
-- Includes schema only. Laravel creates its own migrations history table.
-- Primary keys, unique constraints, and foreign keys are declared in CREATE TABLE
-- so script-based reverse engineering can read the table relationships.

BEGIN;
SET LOCAL search_path TO public;

-- Laravel infrastructure and user accounts

CREATE TABLE users (
    user_id BIGSERIAL,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    tele_number VARCHAR(20),
    avatar_url TEXT,
    role VARCHAR(255) NOT NULL DEFAULT 'user',
    points INTEGER NOT NULL DEFAULT 0,
    membership VARCHAR(255) NOT NULL DEFAULT 'bronze',
    provider VARCHAR(20),
    provider_id VARCHAR(100),
    preferred_language VARCHAR(2) NOT NULL DEFAULT 'vi',
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    locked_until TIMESTAMP(0) WITHOUT TIME ZONE,
    cancel_attempts_left SMALLINT NOT NULL DEFAULT 2,
    modify_attempts_left SMALLINT NOT NULL DEFAULT 2,
    attempts_week_start DATE,
    refund_pending_order_id VARCHAR(100),
    refund_pending_until TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT users_pkey PRIMARY KEY (user_id),
    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_provider_provider_id_unique UNIQUE (provider, provider_id),
    CONSTRAINT users_tele_number_unique UNIQUE (tele_number),
    CONSTRAINT users_membership_check CHECK (membership IN ('bronze', 'silver', 'gold', 'platinum', 'diamond', 'administrator')),
    CONSTRAINT users_role_check CHECK (role IN ('admin', 'staff', 'user'))
);

CREATE TABLE cache (
    key VARCHAR(255) NOT NULL,
    value TEXT NOT NULL,
    expiration INTEGER NOT NULL,
    CONSTRAINT cache_pkey PRIMARY KEY (key)
);
CREATE INDEX cache_expiration_index ON cache (expiration);

CREATE TABLE jobs (
    id BIGSERIAL,
    queue VARCHAR(255) NOT NULL,
    payload TEXT NOT NULL,
    attempts SMALLINT NOT NULL,
    reserved_at INTEGER,
    available_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    CONSTRAINT jobs_pkey PRIMARY KEY (id)
);
CREATE INDEX jobs_queue_index ON jobs (queue);

CREATE TABLE password_reset_otps (
    id BIGSERIAL,
    email VARCHAR(255) NOT NULL,
    otp_hash VARCHAR(255),
    attempts SMALLINT NOT NULL DEFAULT 0,
    expires_at TIMESTAMP(0) WITHOUT TIME ZONE,
    last_sent_at TIMESTAMP(0) WITHOUT TIME ZONE,
    reset_token_hash VARCHAR(255),
    reset_token_expires_at TIMESTAMP(0) WITHOUT TIME ZONE,
    blocked_until TIMESTAMP(0) WITHOUT TIME ZONE,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT password_reset_otps_pkey PRIMARY KEY (id),
    CONSTRAINT password_reset_otps_email_unique UNIQUE (email)
);

CREATE TABLE sessions (
    id VARCHAR(255) NOT NULL,
    user_id BIGINT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    payload TEXT NOT NULL,
    last_activity INTEGER NOT NULL,
    CONSTRAINT sessions_pkey PRIMARY KEY (id)
);
CREATE INDEX sessions_last_activity_index ON sessions (last_activity);
CREATE INDEX sessions_user_id_index ON sessions (user_id);

CREATE TABLE cache_locks (
    key VARCHAR(255) NOT NULL,
    owner VARCHAR(255) NOT NULL,
    expiration INTEGER NOT NULL,
    CONSTRAINT cache_locks_pkey PRIMARY KEY (key)
);
CREATE INDEX cache_locks_expiration_index ON cache_locks (expiration);

CREATE TABLE job_batches (
    id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    total_jobs INTEGER NOT NULL,
    pending_jobs INTEGER NOT NULL,
    failed_jobs INTEGER NOT NULL,
    failed_job_ids TEXT NOT NULL,
    options TEXT,
    cancelled_at INTEGER,
    created_at INTEGER NOT NULL,
    finished_at INTEGER,
    CONSTRAINT job_batches_pkey PRIMARY KEY (id)
);

CREATE TABLE failed_jobs (
    id BIGSERIAL,
    uuid VARCHAR(255) NOT NULL,
    connection TEXT NOT NULL,
    queue TEXT NOT NULL,
    payload TEXT NOT NULL,
    exception TEXT NOT NULL,
    failed_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT failed_jobs_pkey PRIMARY KEY (id),
    CONSTRAINT failed_jobs_uuid_unique UNIQUE (uuid)
);

-- Menu, restaurant tables, orders, and billing

CREATE TABLE dish_types (
    type_id BIGSERIAL,
    type_name VARCHAR(100) NOT NULL,
    supports_tiered_portions BOOLEAN NOT NULL DEFAULT TRUE,
    allows_customer_recipe_customization BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT dish_types_pkey PRIMARY KEY (type_id),
    CONSTRAINT dish_types_type_name_unique UNIQUE (type_name)
);

CREATE TABLE dishes (
    dish_id BIGSERIAL,
    type_id BIGINT NOT NULL,
    dish_name VARCHAR(255),
    dish_name_en VARCHAR(255),
    image_url TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL DEFAULT 30000,
    is_bestseller BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ingredients TEXT,
    ingredients_en TEXT,
    recipe_instructions TEXT,
    recipe_instructions_en TEXT,
    CONSTRAINT dishes_pkey PRIMARY KEY (dish_id),
    CONSTRAINT dishes_type_id_foreign FOREIGN KEY (type_id) REFERENCES dish_types(type_id)
);
CREATE INDEX dishes_dish_name_index ON dishes (dish_name);

CREATE TABLE dish_price_profiles (
    id BIGSERIAL,
    dish_id BIGINT NOT NULL,
    price_group VARCHAR(16) NOT NULL,
    price_low INTEGER NOT NULL,
    price_standard INTEGER NOT NULL,
    price_high INTEGER NOT NULL,
    minimum_gross_margin_percent NUMERIC(5,2) NOT NULL DEFAULT 10,
    tax_percent_included NUMERIC(5,2) NOT NULL DEFAULT 0,
    fixed_cost_per_serving NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT dish_price_profiles_pkey PRIMARY KEY (id),
    CONSTRAINT dish_price_profiles_dish_id_unique UNIQUE (dish_id),
    CONSTRAINT dish_price_profiles_dish_id_foreign FOREIGN KEY (dish_id) REFERENCES dishes(dish_id) ON DELETE CASCADE
);

CREATE TABLE table_types (
    table_type_id BIGSERIAL,
    table_type_name VARCHAR(50) NOT NULL,
    capacity INTEGER NOT NULL,
    CONSTRAINT table_types_pkey PRIMARY KEY (table_type_id),
    CONSTRAINT table_types_capacity_unique UNIQUE (capacity),
    CONSTRAINT table_types_table_type_name_unique UNIQUE (table_type_name)
);

CREATE TABLE restaurant_tables (
    table_number INTEGER NOT NULL,
    table_type_id BIGINT NOT NULL,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT restaurant_tables_pkey PRIMARY KEY (table_number),
    CONSTRAINT restaurant_tables_table_type_id_foreign FOREIGN KEY (table_type_id) REFERENCES table_types(table_type_id)
);

CREATE TABLE orders (
    order_id VARCHAR(20) NOT NULL,
    order_stt VARCHAR(3),
    user_id BIGINT NOT NULL,
    order_type VARCHAR(255) NOT NULL,
    subtotal_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    pending_sale_off_percentage NUMERIC(5,2),
    stock_deducted_at TIMESTAMP(0) WITHOUT TIME ZONE,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT orders_pkey PRIMARY KEY (order_id),
    CONSTRAINT orders_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT orders_order_type_check CHECK (order_type IN ('booking_table', 'delivery'))
);

CREATE TABLE dish_customizations (
    dish_customization_id BIGSERIAL,
    user_id BIGINT NOT NULL,
    dish_id BIGINT NOT NULL,
    recipe_name VARCHAR(255) NOT NULL DEFAULT 'Công thức thay thế 1',
    recipe_name_en VARCHAR(255),
    seed_key VARCHAR(255),
    ingredients TEXT NOT NULL,
    recipe_instructions TEXT NOT NULL,
    recipe_instructions_en TEXT,
    removed_ingredients JSON,
    replacements JSON,
    add_on_ingredients JSON,
    selection JSON,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT dish_customizations_pkey PRIMARY KEY (dish_customization_id),
    CONSTRAINT dish_customizations_seed_key_unique UNIQUE (seed_key),
    CONSTRAINT uq_dish_customization_user_dish_name UNIQUE (user_id, dish_id, recipe_name),
    CONSTRAINT dish_customizations_dish_id_foreign FOREIGN KEY (dish_id) REFERENCES dishes(dish_id) ON DELETE CASCADE,
    CONSTRAINT dish_customizations_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE order_items (
    order_item_id BIGSERIAL,
    order_id VARCHAR(20) NOT NULL,
    dish_id BIGINT NOT NULL,
    customization_id BIGINT,
    customization_name VARCHAR(255),
    ingredients TEXT,
    removed_ingredients JSON,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL DEFAULT 30000,
    price_tier VARCHAR(16) NOT NULL DEFAULT 'standard',
    ingredient_quantities_snapshot JSON,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT order_items_pkey PRIMARY KEY (order_item_id),
    CONSTRAINT uq_order_dish_price_variant UNIQUE (order_id, dish_id, customization_id, price_tier),
    CONSTRAINT order_items_customization_id_foreign FOREIGN KEY (customization_id) REFERENCES dish_customizations(dish_customization_id) ON DELETE SET NULL,
    CONSTRAINT order_items_dish_id_foreign FOREIGN KEY (dish_id) REFERENCES dishes(dish_id),
    CONSTRAINT order_items_order_id_foreign FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
);

CREATE TABLE booking_tables (
    booking_id VARCHAR(20) NOT NULL,
    booking_stt VARCHAR(20),
    order_id VARCHAR(20) NOT NULL,
    table_number INTEGER NOT NULL,
    booking_date DATE NOT NULL,
    start_time TIME(0) WITHOUT TIME ZONE NOT NULL,
    end_time TIME(0) WITHOUT TIME ZONE NOT NULL,
    "B_payment_status" VARCHAR(255) NOT NULL DEFAULT 'unpaid',
    booking_status VARCHAR(255) NOT NULL DEFAULT 'waiting_info',
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT booking_tables_pkey PRIMARY KEY (booking_id),
    CONSTRAINT booking_tables_order_id_foreign FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    CONSTRAINT booking_tables_table_number_foreign FOREIGN KEY (table_number) REFERENCES restaurant_tables(table_number),
    CONSTRAINT "booking_tables_B_payment_status_check" CHECK ("B_payment_status" IN ('unpaid', 'paid', 'refunded')),
    CONSTRAINT booking_tables_booking_status_check CHECK (booking_status IN ('waiting_info', 'waiting_confirmation', 'waiting_payment', 'scheduled', 'preparing', 'completed', 'cancelled'))
);
CREATE INDEX booking_tables_booking_date_index ON booking_tables (booking_date);
CREATE INDEX booking_tables_table_number_index ON booking_tables (table_number);

CREATE TABLE deliveries (
    delivery_id VARCHAR(20) NOT NULL,
    order_id VARCHAR(20) NOT NULL,
    address TEXT NOT NULL,
    distance_km NUMERIC(8,2),
    estimated_duration_minutes INTEGER,
    preferred_delivery_time TIME(0) WITHOUT TIME ZONE,
    shipping_fee INTEGER,
    destination_lat NUMERIC(10,7),
    destination_lng NUMERIC(10,7),
    "D_payment_status" VARCHAR(255) NOT NULL DEFAULT 'unpaid',
    delivery_status VARCHAR(255) NOT NULL DEFAULT 'waiting_payment',
    paid_at TIMESTAMP(0) WITHOUT TIME ZONE,
    cooking_at TIMESTAMP(0) WITHOUT TIME ZONE,
    ship_at TIMESTAMP(0) WITHOUT TIME ZONE,
    delivery_started_at TIMESTAMP(0) WITHOUT TIME ZONE,
    estimated_completion_at TIMESTAMP(0) WITHOUT TIME ZONE,
    delivered_at TIMESTAMP(0) WITHOUT TIME ZONE,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT deliveries_pkey PRIMARY KEY (delivery_id),
    CONSTRAINT deliveries_order_id_unique UNIQUE (order_id),
    CONSTRAINT deliveries_order_id_foreign FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    CONSTRAINT "deliveries_D_payment_status_check" CHECK ("D_payment_status" IN ('unpaid', 'paid', 'refunded')),
    CONSTRAINT deliveries_delivery_status_check CHECK (delivery_status IN ('waiting_payment', 'scheduled', 'preparing', 'shipping', 'completed', 'cancelled'))
);

CREATE TABLE bills (
    bill_id VARCHAR(20) NOT NULL,
    order_id VARCHAR(20) NOT NULL,
    total_price NUMERIC(12,2) NOT NULL,
    sale_off_percentage NUMERIC(5,2),
    sale_off_total_price NUMERIC(12,2),
    user_id BIGINT,
    vnp_txn_ref VARCHAR(50),
    payment_method VARCHAR(50),
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT bills_pkey PRIMARY KEY (bill_id),
    CONSTRAINT bills_order_id_unique UNIQUE (order_id),
    CONSTRAINT bills_order_id_foreign FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    CONSTRAINT bills_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE sale_off_events (
    sale_off_id BIGSERIAL,
    name VARCHAR(100) NOT NULL,
    sale_off_percentage NUMERIC(5,2) NOT NULL,
    start_time TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
    end_time TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT sale_off_events_pkey PRIMARY KEY (sale_off_id)
);

-- API tokens

CREATE TABLE personal_access_tokens (
    id BIGSERIAL,
    tokenable_type VARCHAR(255) NOT NULL,
    tokenable_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    token VARCHAR(64) NOT NULL,
    abilities TEXT,
    last_used_at TIMESTAMP(0) WITHOUT TIME ZONE,
    expires_at TIMESTAMP(0) WITHOUT TIME ZONE,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT personal_access_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT personal_access_tokens_token_unique UNIQUE (token)
);
CREATE INDEX personal_access_tokens_expires_at_index ON personal_access_tokens (expires_at);
CREATE INDEX personal_access_tokens_tokenable_type_tokenable_id_index ON personal_access_tokens (tokenable_type, tokenable_id);

-- Loyalty points and user statistics

CREATE TABLE points (
    point_id BIGSERIAL,
    user_id BIGINT NOT NULL,
    bill_id VARCHAR(255) NOT NULL,
    points_earned INTEGER NOT NULL DEFAULT 0,
    points_redeemed INTEGER NOT NULL DEFAULT 0,
    booking_total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    delivery_total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT points_pkey PRIMARY KEY (point_id),
    CONSTRAINT points_bill_id_foreign FOREIGN KEY (bill_id) REFERENCES bills(bill_id) ON DELETE CASCADE,
    CONSTRAINT points_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE statistics (
    statistic_id BIGSERIAL,
    user_id BIGINT NOT NULL,
    total_orders INTEGER NOT NULL DEFAULT 0,
    booking_orders INTEGER NOT NULL DEFAULT 0,
    delivery_orders INTEGER NOT NULL DEFAULT 0,
    total_spent NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_points INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT statistics_pkey PRIMARY KEY (statistic_id),
    CONSTRAINT statistics_user_id_unique UNIQUE (user_id),
    CONSTRAINT statistics_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Chatbot sessions, messages, and dish reviews

CREATE TABLE chat_sessions (
    session_id BIGSERIAL,
    user_id BIGINT NOT NULL,
    current_node_id VARCHAR(255) NOT NULL DEFAULT 'root',
    context_data JSON,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT chat_sessions_pkey PRIMARY KEY (session_id),
    CONSTRAINT chat_sessions_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE chat_messages (
    message_id BIGSERIAL,
    session_id BIGINT NOT NULL,
    sender VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    image_path VARCHAR(255),
    invoice_bill_id VARCHAR(40),
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chat_messages_pkey PRIMARY KEY (message_id),
    CONSTRAINT chat_messages_session_id_foreign FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
    CONSTRAINT chat_messages_sender_check CHECK (sender IN ('user', 'bot'))
);
CREATE INDEX chat_messages_invoice_bill_id_index ON chat_messages (invoice_bill_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages (created_at);

CREATE TABLE reviews (
    review_id BIGSERIAL,
    dish_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    order_item_id BIGINT,
    direct_review SMALLINT,
    rating SMALLINT NOT NULL,
    comment TEXT,
    ai_response TEXT,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT reviews_pkey PRIMARY KEY (review_id),
    CONSTRAINT uq_direct_dish_review UNIQUE (user_id, dish_id, direct_review),
    CONSTRAINT uq_review_per_order_item UNIQUE (order_item_id),
    CONSTRAINT reviews_dish_id_foreign FOREIGN KEY (dish_id) REFERENCES dishes(dish_id) ON DELETE CASCADE,
    CONSTRAINT reviews_order_item_id_foreign FOREIGN KEY (order_item_id) REFERENCES order_items(order_item_id) ON DELETE CASCADE,
    CONSTRAINT reviews_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5)
);

-- Recipes and ingredient inventory

CREATE TABLE ingredients (
    ingredient_id BIGSERIAL,
    ingredient_key VARCHAR(255) NOT NULL,
    ingredient_name VARCHAR(255),
    ingredient_group VARCHAR(80) NOT NULL DEFAULT 'other',
    ingredient_name_vi VARCHAR(255),
    aliases JSON,
    is_add_on BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    quantity_category VARCHAR(24) NOT NULL DEFAULT 'fixed',
    quantity_unit VARCHAR(12),
    cost_per_unit NUMERIC(12,4),
    quantity_step NUMERIC(10,2),
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT ingredients_pkey PRIMARY KEY (ingredient_id),
    CONSTRAINT ingredients_ingredient_key_unique UNIQUE (ingredient_key)
);
CREATE INDEX ingredients_ingredient_group_index ON ingredients (ingredient_group);
CREATE INDEX ingredients_is_active_index ON ingredients (is_active);
CREATE INDEX ingredients_is_add_on_index ON ingredients (is_add_on);
CREATE INDEX ingredients_quantity_category_index ON ingredients (quantity_category);

CREATE TABLE dish_recipe_measurements (
    id BIGSERIAL,
    dish_id BIGINT NOT NULL,
    ingredient_id BIGINT NOT NULL,
    quantity_unit VARCHAR(12) NOT NULL,
    quantity_low NUMERIC(10,2),
    quantity_standard NUMERIC(10,2),
    quantity_high NUMERIC(10,2),
    minimum_quantity NUMERIC(10,2),
    maximum_quantity NUMERIC(10,2),
    unit_cost_snapshot NUMERIC(12,4),
    unit_cost_unit VARCHAR(12),
    is_variable BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT dish_recipe_measurements_pkey PRIMARY KEY (id),
    CONSTRAINT dish_recipe_measurements_dish_id_ingredient_id_unique UNIQUE (dish_id, ingredient_id),
    CONSTRAINT dish_recipe_measurements_dish_id_foreign FOREIGN KEY (dish_id) REFERENCES dishes(dish_id) ON DELETE CASCADE,
    CONSTRAINT dish_recipe_measurements_ingredient_id_foreign FOREIGN KEY (ingredient_id) REFERENCES ingredients(ingredient_id) ON DELETE CASCADE
);

CREATE TABLE ingredient_stocks (
    ingredient_stock_id BIGSERIAL,
    ingredient_id BIGINT NOT NULL,
    unit_code VARCHAR(12) NOT NULL DEFAULT 'portion',
    ingredient_key VARCHAR(255) NOT NULL,
    ingredient_name VARCHAR(255),
    stock_date DATE NOT NULL,
    quantity_start INTEGER NOT NULL DEFAULT 50,
    quantity_left INTEGER NOT NULL DEFAULT 50,
    refill_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT ingredient_stocks_pkey PRIMARY KEY (ingredient_stock_id),
    CONSTRAINT uq_ingredient_stock_date_unit UNIQUE (ingredient_id, stock_date, unit_code),
    CONSTRAINT ingredient_stocks_ingredient_id_foreign FOREIGN KEY (ingredient_id) REFERENCES ingredients(ingredient_id) ON DELETE CASCADE
);

CREATE TABLE ingredient_stock_transactions (
    ingredient_transaction_id BIGSERIAL,
    order_id VARCHAR(20) NOT NULL,
    ingredient_stock_id BIGINT NOT NULL,
    ingredient_name VARCHAR(255),
    quantity_before INTEGER NOT NULL,
    quantity_deducted INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT ingredient_stock_transactions_pkey PRIMARY KEY (ingredient_transaction_id),
    CONSTRAINT ingredient_stock_transactions_ingredient_stock_id_foreign FOREIGN KEY (ingredient_stock_id) REFERENCES ingredient_stocks(ingredient_stock_id) ON DELETE CASCADE,
    CONSTRAINT ingredient_stock_transactions_order_id_foreign FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
);

CREATE TABLE ingredient_stock_reservations (
    reservation_id BIGSERIAL,
    order_id VARCHAR(20) NOT NULL,
    ingredient_id BIGINT NOT NULL,
    unit_code VARCHAR(12) NOT NULL DEFAULT 'portion',
    stock_date DATE NOT NULL,
    quantity INTEGER NOT NULL,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT ingredient_stock_reservations_pkey PRIMARY KEY (reservation_id),
    CONSTRAINT uq_reservation_order_ingredient_unit UNIQUE (order_id, ingredient_id, unit_code),
    CONSTRAINT ingredient_stock_reservations_ingredient_id_foreign FOREIGN KEY (ingredient_id) REFERENCES ingredients(ingredient_id) ON DELETE CASCADE,
    CONSTRAINT ingredient_stock_reservations_order_id_foreign FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
);
CREATE INDEX idx_reservation_ingredient_date ON ingredient_stock_reservations (ingredient_id, stock_date);

CREATE TABLE dish_ingredient_rules (
    id BIGSERIAL,
    dish_id BIGINT NOT NULL,
    ingredient_id BIGINT NOT NULL,
    role VARCHAR(20) NOT NULL,
    slot_key VARCHAR(80),
    sort_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT dish_ingredient_rules_pkey PRIMARY KEY (id),
    CONSTRAINT dish_ingredient_rules_dish_id_ingredient_id_unique UNIQUE (dish_id, ingredient_id),
    CONSTRAINT dish_ingredient_rules_dish_id_foreign FOREIGN KEY (dish_id) REFERENCES dishes(dish_id) ON DELETE CASCADE,
    CONSTRAINT dish_ingredient_rules_ingredient_id_foreign FOREIGN KEY (ingredient_id) REFERENCES ingredients(ingredient_id) ON DELETE CASCADE
);
CREATE INDEX dish_ingredient_rules_dish_id_role_slot_key_index ON dish_ingredient_rules (dish_id, role, slot_key);

-- Recommendation exclusions and content moderation

CREATE TABLE recommendation_exclusions (
    exclusion_id BIGSERIAL,
    user_id BIGINT NOT NULL,
    dish_id BIGINT NOT NULL,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT recommendation_exclusions_pkey PRIMARY KEY (exclusion_id),
    CONSTRAINT uq_recommendation_exclusion UNIQUE (user_id, dish_id),
    CONSTRAINT recommendation_exclusions_dish_id_foreign FOREIGN KEY (dish_id) REFERENCES dishes(dish_id) ON DELETE CASCADE,
    CONSTRAINT recommendation_exclusions_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE content_moderation_warnings (
    warning_id BIGSERIAL,
    user_id BIGINT NOT NULL,
    source VARCHAR(255) NOT NULL,
    warning_date DATE NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT content_moderation_warnings_pkey PRIMARY KEY (warning_id),
    CONSTRAINT content_moderation_warnings_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT content_moderation_warnings_source_check CHECK (source IN ('chatbot', 'rating'))
);
CREATE INDEX content_moderation_warnings_user_id_warning_date_index ON content_moderation_warnings (user_id, warning_date);

-- Notifications

CREATE TABLE user_notifications (
    id BIGSERIAL,
    user_id BIGINT NOT NULL,
    type VARCHAR(64) NOT NULL,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    event_key VARCHAR(191) NOT NULL,
    read_at TIMESTAMP(0) WITHOUT TIME ZONE,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT user_notifications_pkey PRIMARY KEY (id),
    CONSTRAINT user_notifications_event_key_unique UNIQUE (event_key),
    CONSTRAINT user_notifications_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
CREATE INDEX user_notifications_user_id_read_at_created_at_index ON user_notifications (user_id, read_at, created_at);

CREATE TABLE user_notification_preferences (
    id BIGSERIAL,
    user_id BIGINT NOT NULL,
    type VARCHAR(64) NOT NULL,
    in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT user_notification_preferences_pkey PRIMARY KEY (id),
    CONSTRAINT user_notification_preferences_user_id_type_unique UNIQUE (user_id, type),
    CONSTRAINT user_notification_preferences_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Community recipes

CREATE TABLE community_recipes (
    id BIGSERIAL,
    dish_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    recipe JSON NOT NULL,
    seed_key VARCHAR(255),
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT community_recipes_pkey PRIMARY KEY (id),
    CONSTRAINT community_recipes_seed_key_unique UNIQUE (seed_key),
    CONSTRAINT community_recipes_dish_id_foreign FOREIGN KEY (dish_id) REFERENCES dishes(dish_id) ON DELETE CASCADE,
    CONSTRAINT community_recipes_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE community_recipe_likes (
    recipe_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    CONSTRAINT community_recipe_likes_pkey PRIMARY KEY (recipe_id, user_id),
    CONSTRAINT community_recipe_likes_recipe_id_foreign FOREIGN KEY (recipe_id) REFERENCES community_recipes(id) ON DELETE CASCADE,
    CONSTRAINT community_recipe_likes_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE community_recipe_comments (
    id BIGSERIAL,
    recipe_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    comment TEXT NOT NULL,
    comment_en TEXT,
    seed_key VARCHAR(255),
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT community_recipe_comments_pkey PRIMARY KEY (id),
    CONSTRAINT community_recipe_comments_seed_key_unique UNIQUE (seed_key),
    CONSTRAINT community_recipe_comments_recipe_id_foreign FOREIGN KEY (recipe_id) REFERENCES community_recipes(id) ON DELETE CASCADE,
    CONSTRAINT community_recipe_comments_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Dish proposals, voting, and administrative review

CREATE TABLE dish_proposals (
    id BIGSERIAL,
    cycle_key VARCHAR(7) NOT NULL,
    user_id BIGINT NOT NULL,
    type_id BIGINT NOT NULL,
    language VARCHAR(2) NOT NULL DEFAULT 'vi',
    dish_name VARCHAR(255) NOT NULL,
    dish_name_en VARCHAR(255),
    image_url TEXT NOT NULL,
    image_hash CHAR(64),
    ingredients TEXT NOT NULL,
    ingredients_en TEXT,
    recipe_instructions TEXT NOT NULL,
    recipe_instructions_en TEXT,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT dish_proposals_pkey PRIMARY KEY (id),
    CONSTRAINT dish_proposals_cycle_key_user_id_unique UNIQUE (cycle_key, user_id),
    CONSTRAINT dish_proposals_type_id_foreign FOREIGN KEY (type_id) REFERENCES dish_types(type_id),
    CONSTRAINT dish_proposals_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
CREATE INDEX dish_proposals_cycle_key_id_index ON dish_proposals (cycle_key, id);

CREATE TABLE dish_proposal_votes (
    id BIGSERIAL,
    proposal_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    phone VARCHAR(20) NOT NULL,
    vote_date DATE NOT NULL,
    quantity SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT dish_proposal_votes_pkey PRIMARY KEY (id),
    CONSTRAINT dish_proposal_votes_proposal_id_foreign FOREIGN KEY (proposal_id) REFERENCES dish_proposals(id) ON DELETE CASCADE,
    CONSTRAINT dish_proposal_votes_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
CREATE INDEX dish_proposal_votes_proposal_id_phone_index ON dish_proposal_votes (proposal_id, phone);
CREATE INDEX dish_proposal_votes_user_id_vote_date_index ON dish_proposal_votes (user_id, vote_date);

CREATE TABLE dish_proposal_daily_claims (
    id BIGSERIAL,
    user_id BIGINT NOT NULL,
    claim_date DATE NOT NULL,
    cycle_key VARCHAR(7) NOT NULL,
    CONSTRAINT dish_proposal_daily_claims_pkey PRIMARY KEY (id),
    CONSTRAINT dish_proposal_daily_claims_user_id_claim_date_unique UNIQUE (user_id, claim_date),
    CONSTRAINT dish_proposal_daily_claims_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE dish_proposal_phone_bindings (
    id BIGSERIAL,
    cycle_key VARCHAR(7) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    user_id BIGINT NOT NULL,
    CONSTRAINT dish_proposal_phone_bindings_pkey PRIMARY KEY (id),
    CONSTRAINT dish_proposal_phone_bindings_cycle_key_phone_unique UNIQUE (cycle_key, phone),
    CONSTRAINT dish_proposal_phone_bindings_cycle_key_user_id_unique UNIQUE (cycle_key, user_id),
    CONSTRAINT dish_proposal_phone_bindings_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE admin_dish_suggestions (
    id BIGSERIAL,
    source_proposal_id BIGINT,
    proposer_user_id BIGINT,
    type_id BIGINT,
    language VARCHAR(2) NOT NULL DEFAULT 'vi',
    cycle_key VARCHAR(7) NOT NULL,
    dish_name VARCHAR(255) NOT NULL,
    dish_name_en VARCHAR(255),
    image_url TEXT NOT NULL,
    ingredients TEXT NOT NULL,
    ingredients_en TEXT,
    recipe_instructions TEXT NOT NULL,
    recipe_instructions_en TEXT,
    vote_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    image_hash CHAR(64),
    dish_id BIGINT,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP(0) WITHOUT TIME ZONE,
    award_paid_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT admin_dish_suggestions_pkey PRIMARY KEY (id),
    CONSTRAINT admin_dish_suggestions_cycle_key_unique UNIQUE (cycle_key),
    CONSTRAINT admin_dish_suggestions_dish_id_foreign FOREIGN KEY (dish_id) REFERENCES dishes(dish_id) ON DELETE SET NULL,
    CONSTRAINT admin_dish_suggestions_proposer_user_id_foreign FOREIGN KEY (proposer_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    CONSTRAINT admin_dish_suggestions_source_proposal_id_foreign FOREIGN KEY (source_proposal_id) REFERENCES dish_proposals(id) ON DELETE SET NULL,
    CONSTRAINT admin_dish_suggestions_type_id_foreign FOREIGN KEY (type_id) REFERENCES dish_types(type_id) ON DELETE SET NULL
);

CREATE TABLE dish_proposal_cycles (
    cycle_key VARCHAR(7) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'open',
    winner_proposal_id BIGINT,
    top_vote_count INTEGER NOT NULL DEFAULT 0,
    top_results JSON,
    winner_dish_name VARCHAR(255),
    winner_username VARCHAR(255),
    finalized_at TIMESTAMP(0) WITHOUT TIME ZONE,
    announced_at TIMESTAMP(0) WITHOUT TIME ZONE,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT dish_proposal_cycles_pkey PRIMARY KEY (cycle_key),
    CONSTRAINT dish_proposal_cycles_winner_proposal_id_foreign FOREIGN KEY (winner_proposal_id) REFERENCES dish_proposals(id) ON DELETE SET NULL
);

CREATE TABLE chatbot_dish_vote_limits (
    user_id BIGINT NOT NULL,
    ballot_last_requested_at TIMESTAMP(0) WITHOUT TIME ZONE,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT chatbot_dish_vote_limits_pkey PRIMARY KEY (user_id),
    CONSTRAINT chatbot_dish_vote_limits_user_id_foreign FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- PostgreSQL-specific rules. These do not add ERD relationships.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;

-- Prevent overlapping bookings for the same table, excluding cancelled bookings.
ALTER TABLE booking_tables
    ADD CONSTRAINT booking_tables_no_overlap EXCLUDE USING gist (
        table_number WITH =,
        tsrange(booking_date + start_time, booking_date + end_time) WITH &&
    ) WHERE (booking_status <> 'cancelled');

-- Administrator orders receive a zero-price bill.
CREATE FUNCTION fn_apply_administrator_free_bill()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_membership VARCHAR(20);
BEGIN
    SELECT u.membership
    INTO v_membership
    FROM orders o
    JOIN users u ON u.user_id = o.user_id
    WHERE o.order_id = NEW.order_id;

    IF v_membership = 'administrator' THEN
        NEW.total_price := 0.00;
        NEW.payment_method := 'ADMIN_TEST_FREE';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_insert_bill_check_admin
BEFORE INSERT ON bills
FOR EACH ROW
EXECUTE FUNCTION fn_apply_administrator_free_bill();

COMMIT;
