-- PostgreSQL schema snapshot for HGHRestaurantWeb, based on all migrations.
-- Intended for an EMPTY database / pgAdmin ERD reverse engineering.
-- Generated from backend/database/migrations; no seed data included.
-- Requires permission to install btree_gist for booking overlap exclusion.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Laravel framework tables
CREATE TABLE users (
    user_id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255),
    email VARCHAR(255) NOT NULL UNIQUE,
    tele_number VARCHAR(20) UNIQUE,
    avatar_url TEXT,
    role VARCHAR(255) NOT NULL DEFAULT 'user' CHECK (role IN ('admin','staff','user')),
    points INTEGER NOT NULL DEFAULT 0,
    membership VARCHAR(255) NOT NULL DEFAULT 'bronze' CHECK (membership IN ('bronze','silver','gold','platinum','diamond','administrator')),
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
    CONSTRAINT users_provider_provider_id_unique UNIQUE (provider, provider_id)
);

CREATE TABLE cache (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    expiration INTEGER NOT NULL
);
CREATE INDEX cache_expiration_index ON cache (expiration);

CREATE TABLE cache_locks (
    key VARCHAR(255) PRIMARY KEY,
    owner VARCHAR(255) NOT NULL,
    expiration INTEGER NOT NULL
);
CREATE INDEX cache_locks_expiration_index ON cache_locks (expiration);

CREATE TABLE jobs (
    id BIGSERIAL PRIMARY KEY,
    queue VARCHAR(255) NOT NULL,
    payload TEXT NOT NULL,
    attempts SMALLINT NOT NULL,
    reserved_at INTEGER,
    available_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE INDEX jobs_queue_index ON jobs (queue);

CREATE TABLE job_batches (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    total_jobs INTEGER NOT NULL,
    pending_jobs INTEGER NOT NULL,
    failed_jobs INTEGER NOT NULL,
    failed_job_ids TEXT NOT NULL,
    options TEXT,
    cancelled_at INTEGER,
    created_at INTEGER NOT NULL,
    finished_at INTEGER
);

CREATE TABLE failed_jobs (
    id BIGSERIAL PRIMARY KEY,
    uuid VARCHAR(255) NOT NULL UNIQUE,
    connection TEXT NOT NULL,
    queue TEXT NOT NULL,
    payload TEXT NOT NULL,
    exception TEXT NOT NULL,
    failed_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE password_reset_otps (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    otp_hash VARCHAR(255),
    attempts SMALLINT NOT NULL DEFAULT 0,
    expires_at TIMESTAMP(0) WITHOUT TIME ZONE,
    last_sent_at TIMESTAMP(0) WITHOUT TIME ZONE,
    reset_token_hash VARCHAR(255),
    reset_token_expires_at TIMESTAMP(0) WITHOUT TIME ZONE,
    blocked_until TIMESTAMP(0) WITHOUT TIME ZONE,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE
);

CREATE TABLE sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id BIGINT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    payload TEXT NOT NULL,
    last_activity INTEGER NOT NULL
);
CREATE INDEX sessions_user_id_index ON sessions (user_id);
CREATE INDEX sessions_last_activity_index ON sessions (last_activity);

CREATE TABLE personal_access_tokens (
    id BIGSERIAL PRIMARY KEY,
    tokenable_type VARCHAR(255) NOT NULL,
    tokenable_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    abilities TEXT,
    last_used_at TIMESTAMP(0) WITHOUT TIME ZONE,
    expires_at TIMESTAMP(0) WITHOUT TIME ZONE,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE
);
CREATE INDEX personal_access_tokens_tokenable_type_tokenable_id_index ON personal_access_tokens (tokenable_type, tokenable_id);
CREATE INDEX personal_access_tokens_expires_at_index ON personal_access_tokens (expires_at);

-- Restaurant domain tables. Order follows dependencies; deferred constraints added after table creation where useful.
CREATE TABLE dish_types (
    type_id BIGSERIAL PRIMARY KEY,
    type_name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE table_types (
    table_type_id BIGSERIAL PRIMARY KEY,
    table_type_name VARCHAR(50) NOT NULL UNIQUE,
    capacity INTEGER NOT NULL UNIQUE
);

CREATE TABLE dishes (
    dish_id BIGSERIAL PRIMARY KEY,
    type_id BIGINT NOT NULL REFERENCES dish_types(type_id),
    dish_name VARCHAR(255) UNIQUE,
    dish_name_en VARCHAR(255),
    image_url TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL DEFAULT 30000,
    is_bestseller BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ingredients TEXT,
    ingredients_en TEXT,
    recipe_instructions TEXT,
    recipe_instructions_en TEXT
);

CREATE TABLE dish_price_profiles (
    id BIGSERIAL PRIMARY KEY,
    dish_id BIGINT NOT NULL UNIQUE REFERENCES dishes(dish_id) ON DELETE CASCADE,
    price_group VARCHAR(16) NOT NULL,
    price_low INTEGER NOT NULL,
    price_standard INTEGER NOT NULL,
    price_high INTEGER NOT NULL,
    minimum_gross_margin_percent NUMERIC(5,2) NOT NULL DEFAULT 10,
    tax_percent_included NUMERIC(5,2) NOT NULL DEFAULT 0,
    fixed_cost_per_serving NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE
);

CREATE TABLE restaurant_tables (
    table_number INTEGER PRIMARY KEY,
    table_type_id BIGINT NOT NULL REFERENCES table_types(table_type_id),
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
    order_id VARCHAR(20) PRIMARY KEY,
    order_stt VARCHAR(3),
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    order_type VARCHAR(255) NOT NULL CHECK (order_type IN ('booking_table','delivery')),
    subtotal_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    pending_sale_off_percentage NUMERIC(5,2),
    stock_deducted_at TIMESTAMP(0) WITHOUT TIME ZONE,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dish_customizations (
    dish_customization_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    dish_id BIGINT NOT NULL REFERENCES dishes(dish_id) ON DELETE CASCADE,
    recipe_name VARCHAR(255) NOT NULL DEFAULT 'Công thức thay thế 1',
    recipe_name_en VARCHAR(255),
    seed_key VARCHAR(255) UNIQUE,
    ingredients TEXT NOT NULL,
    recipe_instructions TEXT NOT NULL,
    recipe_instructions_en TEXT,
    removed_ingredients JSON,
    replacements JSON,
    add_on_ingredients JSON,
    selection JSON,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT uq_dish_customization_user_dish_name UNIQUE (user_id, dish_id, recipe_name)
);

CREATE TABLE order_items (
    order_item_id BIGSERIAL PRIMARY KEY,
    order_id VARCHAR(20) NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    dish_id BIGINT NOT NULL REFERENCES dishes(dish_id),
    customization_id BIGINT REFERENCES dish_customizations(dish_customization_id) ON DELETE SET NULL,
    customization_name VARCHAR(255),
    ingredients TEXT,
    removed_ingredients JSON,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL DEFAULT 30000,
    price_tier VARCHAR(16) NOT NULL DEFAULT 'standard',
    ingredient_quantities_snapshot JSON,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_order_dish_price_variant UNIQUE (order_id, dish_id, customization_id, price_tier)
);

CREATE TABLE booking_tables (
    booking_id VARCHAR(20) PRIMARY KEY,
    booking_stt VARCHAR(20),
    order_id VARCHAR(20) NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    table_number INTEGER NOT NULL REFERENCES restaurant_tables(table_number),
    booking_date DATE NOT NULL,
    start_time TIME(0) WITHOUT TIME ZONE NOT NULL,
    end_time TIME(0) WITHOUT TIME ZONE NOT NULL,
    B_payment_status VARCHAR(255) NOT NULL DEFAULT 'unpaid' CHECK (B_payment_status IN ('unpaid','paid','refunded')),
    booking_status VARCHAR(255) NOT NULL DEFAULT 'waiting_info' CHECK (booking_status IN ('waiting_info','waiting_confirmation','waiting_payment','scheduled','preparing','completed','cancelled')),
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT booking_tables_no_overlap EXCLUDE USING gist (
       table_number WITH =,
       tsrange(booking_date + start_time, booking_date + end_time) WITH &&
    ) WHERE (booking_status <> 'cancelled')
);
CREATE INDEX booking_tables_table_number_index ON booking_tables (table_number);
CREATE INDEX booking_tables_booking_date_index ON booking_tables (booking_date);

CREATE TABLE deliveries (
    delivery_id VARCHAR(20) PRIMARY KEY,
    order_id VARCHAR(20) NOT NULL UNIQUE REFERENCES orders(order_id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    distance_km NUMERIC(8,2),
    estimated_duration_minutes INTEGER,
    preferred_delivery_time TIME(0) WITHOUT TIME ZONE,
    shipping_fee INTEGER,
    destination_lat NUMERIC(10,7),
    destination_lng NUMERIC(10,7),
    D_payment_status VARCHAR(255) NOT NULL DEFAULT 'unpaid' CHECK (D_payment_status IN ('unpaid','paid','refunded')),
    delivery_status VARCHAR(255) NOT NULL DEFAULT 'waiting_payment' CHECK (delivery_status IN ('waiting_payment','scheduled','preparing','shipping','completed','cancelled')),
    paid_at TIMESTAMP(0) WITHOUT TIME ZONE,
    cooking_at TIMESTAMP(0) WITHOUT TIME ZONE,
    ship_at TIMESTAMP(0) WITHOUT TIME ZONE,
    delivery_started_at TIMESTAMP(0) WITHOUT TIME ZONE,
    estimated_completion_at TIMESTAMP(0) WITHOUT TIME ZONE,
    delivered_at TIMESTAMP(0) WITHOUT TIME ZONE,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bills (
    bill_id VARCHAR(20) PRIMARY KEY,
    order_id VARCHAR(20) NOT NULL UNIQUE REFERENCES orders(order_id) ON DELETE CASCADE,
    total_price NUMERIC(12,2) NOT NULL,
    sale_off_percentage NUMERIC(5,2),
    sale_off_total_price NUMERIC(12,2),
    user_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    vnp_txn_ref VARCHAR(50),
    payment_method VARCHAR(50),
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION fn_apply_administrator_free_bill()
RETURNS TRIGGER AS $$
DECLARE v_membership VARCHAR(20);
BEGIN
    SELECT u.membership INTO v_membership
    FROM orders o JOIN users u ON u.user_id = o.user_id
    WHERE o.order_id = NEW.order_id;
    IF v_membership = 'administrator' THEN
        NEW.total_price := 0.00;
        NEW.payment_method := 'ADMIN_TEST_FREE';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_on_insert_bill_check_admin
BEFORE INSERT ON bills FOR EACH ROW EXECUTE FUNCTION fn_apply_administrator_free_bill();

CREATE TABLE sale_off_events (
    sale_off_id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    sale_off_percentage NUMERIC(5,2) NOT NULL,
    start_time TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
    end_time TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE points (
    point_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    bill_id VARCHAR(255) NOT NULL REFERENCES bills(bill_id) ON DELETE CASCADE,
    points_earned INTEGER NOT NULL DEFAULT 0,
    points_redeemed INTEGER NOT NULL DEFAULT 0,
    booking_total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    delivery_total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE statistics (
    statistic_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    total_orders INTEGER NOT NULL DEFAULT 0,
    booking_orders INTEGER NOT NULL DEFAULT 0,
    delivery_orders INTEGER NOT NULL DEFAULT 0,
    total_spent NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_points INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chat_sessions (
    session_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    current_node_id VARCHAR(255) NOT NULL DEFAULT 'root',
    context_data JSON,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE
);

CREATE TABLE chat_messages (
    message_id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
    sender VARCHAR(255) NOT NULL CHECK (sender IN ('user','bot')),
    content TEXT NOT NULL,
    image_path VARCHAR(255),
    invoice_bill_id VARCHAR(40),
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX chat_messages_invoice_bill_id_index ON chat_messages (invoice_bill_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages (created_at);

CREATE TABLE reviews (
    review_id BIGSERIAL PRIMARY KEY,
    dish_id BIGINT NOT NULL REFERENCES dishes(dish_id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    order_item_id BIGINT REFERENCES order_items(order_item_id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL,
    comment TEXT,
    ai_response TEXT,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    direct_review SMALLINT,
    CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT uq_review_per_order_item UNIQUE (order_item_id),
    CONSTRAINT uq_direct_dish_review UNIQUE (user_id, dish_id, direct_review)
);

CREATE TABLE ingredients (
    ingredient_id BIGSERIAL PRIMARY KEY,
    ingredient_key VARCHAR(255) NOT NULL UNIQUE,
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
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE
);
CREATE INDEX ingredients_ingredient_group_index ON ingredients (ingredient_group);
CREATE INDEX ingredients_is_add_on_index ON ingredients (is_add_on);
CREATE INDEX ingredients_is_active_index ON ingredients (is_active);
CREATE INDEX ingredients_quantity_category_index ON ingredients (quantity_category);

CREATE TABLE dish_recipe_measurements (
    id BIGSERIAL PRIMARY KEY,
    dish_id BIGINT NOT NULL REFERENCES dishes(dish_id) ON DELETE CASCADE,
    ingredient_id BIGINT NOT NULL REFERENCES ingredients(ingredient_id) ON DELETE CASCADE,
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
    CONSTRAINT dish_recipe_measurements_dish_id_ingredient_id_unique UNIQUE (dish_id, ingredient_id)
);

CREATE TABLE ingredient_stocks (
    ingredient_stock_id BIGSERIAL PRIMARY KEY,
    ingredient_id BIGINT NOT NULL REFERENCES ingredients(ingredient_id) ON DELETE CASCADE,
    unit_code VARCHAR(12) NOT NULL DEFAULT 'portion',
    ingredient_key VARCHAR(255) NOT NULL,
    ingredient_name VARCHAR(255),
    stock_date DATE NOT NULL,
    quantity_start INTEGER NOT NULL DEFAULT 50,
    quantity_left INTEGER NOT NULL DEFAULT 50,
    refill_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT uq_ingredient_stock_date_unit UNIQUE (ingredient_id, stock_date, unit_code)
);

CREATE TABLE ingredient_stock_transactions (
    ingredient_transaction_id BIGSERIAL PRIMARY KEY,
    order_id VARCHAR(20) NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    ingredient_stock_id BIGINT NOT NULL REFERENCES ingredient_stocks(ingredient_stock_id) ON DELETE CASCADE,
    ingredient_name VARCHAR(255),
    quantity_before INTEGER NOT NULL,
    quantity_deducted INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE
);

CREATE TABLE ingredient_stock_reservations (
    reservation_id BIGSERIAL PRIMARY KEY,
    order_id VARCHAR(20) NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    ingredient_id BIGINT NOT NULL REFERENCES ingredients(ingredient_id) ON DELETE CASCADE,
    unit_code VARCHAR(12) NOT NULL DEFAULT 'portion',
    stock_date DATE NOT NULL,
    quantity INTEGER NOT NULL,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT uq_reservation_order_ingredient_unit UNIQUE (order_id, ingredient_id, unit_code)
);
CREATE INDEX idx_reservation_ingredient_date ON ingredient_stock_reservations (ingredient_id, stock_date);

CREATE TABLE dish_ingredient_rules (
    id BIGSERIAL PRIMARY KEY,
    dish_id BIGINT NOT NULL REFERENCES dishes(dish_id) ON DELETE CASCADE,
    ingredient_id BIGINT NOT NULL REFERENCES ingredients(ingredient_id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    slot_key VARCHAR(80),
    sort_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT dish_ingredient_rules_dish_id_ingredient_id_unique UNIQUE (dish_id, ingredient_id)
);
CREATE INDEX dish_ingredient_rules_dish_id_role_slot_key_index ON dish_ingredient_rules (dish_id, role, slot_key);

CREATE TABLE recommendation_exclusions (
    exclusion_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    dish_id BIGINT NOT NULL REFERENCES dishes(dish_id) ON DELETE CASCADE,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_recommendation_exclusion UNIQUE (user_id, dish_id)
);

CREATE TABLE content_moderation_warnings (
    warning_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    source VARCHAR(255) NOT NULL CHECK (source IN ('chatbot','rating')),
    warning_date DATE NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX content_moderation_warnings_user_id_warning_date_index ON content_moderation_warnings (user_id, warning_date);

CREATE TABLE user_notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    type VARCHAR(64) NOT NULL,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    event_key VARCHAR(191) NOT NULL UNIQUE,
    read_at TIMESTAMP(0) WITHOUT TIME ZONE,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE
);
CREATE INDEX user_notifications_user_id_read_at_created_at_index ON user_notifications (user_id, read_at, created_at);

CREATE TABLE user_notification_preferences (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    type VARCHAR(64) NOT NULL,
    in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE,
    CONSTRAINT user_notification_preferences_user_id_type_unique UNIQUE (user_id, type)
);

CREATE TABLE community_recipes (
    id BIGSERIAL PRIMARY KEY,
    dish_id BIGINT NOT NULL REFERENCES dishes(dish_id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    recipe JSON NOT NULL,
    seed_key VARCHAR(255) UNIQUE,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE
);

CREATE TABLE community_recipe_likes (
    recipe_id BIGINT NOT NULL REFERENCES community_recipes(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    PRIMARY KEY (recipe_id, user_id)
);

CREATE TABLE community_recipe_comments (
    id BIGSERIAL PRIMARY KEY,
    recipe_id BIGINT NOT NULL REFERENCES community_recipes(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    comment_en TEXT,
    seed_key VARCHAR(255) UNIQUE,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
