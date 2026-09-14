-- =====================================================================
-- 0. DROP (theo thứ tự ngược để tránh lỗi phụ thuộc FK)
-- =====================================================================

DROP TRIGGER IF EXISTS trg_on_insert_bill_check_admin ON bills;
DROP FUNCTION IF EXISTS fn_apply_administrator_free_bill();
ALTER TABLE IF EXISTS booking_tables DROP CONSTRAINT IF EXISTS booking_tables_no_overlap;

DROP TABLE IF EXISTS statistics CASCADE;
DROP TABLE IF EXISTS points CASCADE;
DROP TABLE IF EXISTS stocks CASCADE;
DROP TABLE IF EXISTS sale_off_events CASCADE;
DROP TABLE IF EXISTS bills CASCADE;
DROP TABLE IF EXISTS deliveries CASCADE;
DROP TABLE IF EXISTS booking_tables CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS restaurant_tables CASCADE;
DROP TABLE IF EXISTS table_types CASCADE;
DROP TABLE IF EXISTS favorite_dishes CASCADE;
DROP TABLE IF EXISTS dish_similarities CASCADE;
DROP TABLE IF EXISTS dishes CASCADE;
DROP TABLE IF EXISTS dish_types CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_sessions CASCADE;

-- =====================================================================
-- 1. users
-- =====================================================================
CREATE TABLE users (
    user_id            BIGSERIAL PRIMARY KEY,
    username            VARCHAR(50) NOT NULL,
    password_hash       VARCHAR(255),
    email               VARCHAR(255) NOT NULL UNIQUE,
    tele_number         VARCHAR(20) UNIQUE,
    avatar_url          TEXT,
    role                VARCHAR(20) NOT NULL DEFAULT 'user'
                         CHECK (role IN ('admin', 'staff', 'user')),
    points              INTEGER NOT NULL DEFAULT 0,
    membership          VARCHAR(20) NOT NULL DEFAULT 'bronze'
                         CHECK (membership IN ('bronze','silver','gold','platinum','diamond','administrator')),
    provider            VARCHAR(20),
    provider_id         VARCHAR(100),
    -- --- Thêm cho tính năng AI gợi ý món ---
    recommendation_reset_at        TIMESTAMP,
    skipped_recommendation_modal   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_users_provider UNIQUE (provider, provider_id)
);

-- =====================================================================
-- 2. dish_types
-- =====================================================================
CREATE TABLE dish_types (
    type_id     BIGSERIAL PRIMARY KEY,
    type_name   VARCHAR(100) NOT NULL UNIQUE
);

-- =====================================================================
-- 3. dishes
-- =====================================================================
CREATE TABLE dishes (
    dish_id         BIGSERIAL PRIMARY KEY,
    type_id         BIGINT NOT NULL,
    dish_name       VARCHAR(255) NOT NULL UNIQUE,
    image_url       TEXT NOT NULL,
    price           DECIMAL(10,2) NOT NULL DEFAULT 30000,
    is_bestseller   BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    -- --- Thêm cho tính năng AI gợi ý món ---
    food_com_recipe_id      INTEGER UNIQUE,
    original_name            VARCHAR(255),
    ingredients               TEXT,
    recipe_instructions       TEXT,
    original_rating           DECIMAL(3,2),
    original_review_count     INTEGER
);

-- =====================================================================
-- 3a. dish_similarities  (ma trận tương đồng, tính sẵn offline từ dataset)
-- =====================================================================
CREATE TABLE dish_similarities (
    similarity_id      BIGSERIAL PRIMARY KEY,
    dish_id_1           BIGINT NOT NULL,
    dish_id_2           BIGINT NOT NULL,
    similarity_score    DECIMAL(6,5) NOT NULL,
    created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dish_pair UNIQUE (dish_id_1, dish_id_2),
    CONSTRAINT chk_similarity_score CHECK (similarity_score BETWEEN -1 AND 1),
    CONSTRAINT chk_no_self_pair CHECK (dish_id_1 <> dish_id_2)
);

-- =====================================================================
-- 3b. favorite_dishes  (danh sách đề xuất mỗi user, tối đa 8 món)
-- =====================================================================
CREATE TABLE favorite_dishes (
    favorite_id       BIGSERIAL PRIMARY KEY,
    user_id            BIGINT NOT NULL,
    dish_id            BIGINT NOT NULL,
    rating_snapshot     SMALLINT,
    pick_order          SMALLINT ,
    updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_favorite_dish UNIQUE (user_id, dish_id),
    CONSTRAINT chk_rating_snapshot CHECK (rating_snapshot IS NULL OR rating_snapshot BETWEEN 1 AND 5),
    CONSTRAINT chk_pick_order CHECK (pick_order BETWEEN 1 AND 8)
);

-- =====================================================================
-- 4. table_types
-- =====================================================================
CREATE TABLE table_types (
    table_type_id     BIGSERIAL PRIMARY KEY,
    table_type_name   VARCHAR(50) NOT NULL UNIQUE,
    capacity          INTEGER NOT NULL UNIQUE
);

-- =====================================================================
-- 5. restaurant_tables
-- =====================================================================
CREATE TABLE restaurant_tables (
    table_number    INTEGER PRIMARY KEY,
    table_type_id   BIGINT NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed data (giống migration gốc)
INSERT INTO table_types(table_type_name, capacity)
VALUES
('Loại 1', 5),
('Loại 2', 10),
('Loại 3', 15);

INSERT INTO restaurant_tables(table_number, table_type_id)
SELECT generate_series(1,25),
       (SELECT table_type_id FROM table_types WHERE capacity = 5);

INSERT INTO restaurant_tables(table_number, table_type_id)
SELECT generate_series(26,45),
       (SELECT table_type_id FROM table_types WHERE capacity = 10);

INSERT INTO restaurant_tables(table_number, table_type_id)
SELECT generate_series(46,50),
       (SELECT table_type_id FROM table_types WHERE capacity = 15);

-- =====================================================================
-- 6. orders
-- =====================================================================
CREATE TABLE orders (
    order_id                       VARCHAR(20) PRIMARY KEY,
    order_stt                      VARCHAR(3),
    user_id                        BIGINT NOT NULL,
    order_type                     VARCHAR(20) NOT NULL
                                    CHECK (order_type IN ('booking_table', 'delivery')),
    subtotal_price                 DECIMAL(12,2) NOT NULL DEFAULT 0,
    pending_sale_off_percentage    DECIMAL(5,2),
    created_at                     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- 7. order_items
-- =====================================================================
CREATE TABLE order_items (
    order_item_id   BIGSERIAL PRIMARY KEY,
    order_id        VARCHAR(20) NOT NULL,
    dish_id         BIGINT NOT NULL,
    quantity        INTEGER NOT NULL,
    unit_price      DECIMAL(10,2) NOT NULL DEFAULT 30000,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_order_dish UNIQUE (order_id, dish_id)
);

-- =====================================================================
-- 7a. reviews  (đánh giá thật từ khách, gắn với 1 lần đặt món cụ thể)
-- =====================================================================
CREATE TABLE reviews (
    review_id       BIGSERIAL PRIMARY KEY,
    dish_id          BIGINT NOT NULL,
    user_id          BIGINT NOT NULL,
    order_item_id     BIGINT NOT NULL,
    rating            SMALLINT NOT NULL,
    comment           TEXT,
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_review_per_order_item UNIQUE (order_item_id),
    CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5)
);

-- =====================================================================
-- 8. booking_tables
-- =====================================================================
CREATE TABLE booking_tables (
    booking_id          VARCHAR(20) PRIMARY KEY,
    booking_stt         VARCHAR(20),
    order_id            VARCHAR(20) NOT NULL,
    table_number        INTEGER NOT NULL,
    booking_date        DATE NOT NULL,
    start_time          TIME NOT NULL,
    end_time            TIME NOT NULL,
    "B_payment_status"  VARCHAR(20) NOT NULL DEFAULT 'unpaid'
                         CHECK ("B_payment_status" IN ('unpaid','paid')),
    booking_status      VARCHAR(30) NOT NULL DEFAULT 'waiting_info'
                         CHECK (booking_status IN ('waiting_info','waiting_confirmation','waiting_payment','completed','cancelled')),
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_booking_tables_table_number ON booking_tables(table_number);
CREATE INDEX idx_booking_tables_booking_date ON booking_tables(booking_date);

-- Bắt buộc cho EXCLUDE constraint dùng GiST với kiểu integer (table_number)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Chặn 2 booking cùng bàn, cùng ngày, khung giờ chồng lấn — ở tầng DB.
-- Booking đã 'cancelled' không tính là chiếm chỗ.
ALTER TABLE booking_tables
ADD CONSTRAINT booking_tables_no_overlap
EXCLUDE USING gist (
    table_number WITH =,
    tsrange(booking_date + start_time, booking_date + end_time) WITH &&
)
WHERE (booking_status <> 'cancelled');

-- =====================================================================
-- 9. deliveries  (ĐÃ CẬP NHẬT theo migration 2026_06_13_000007)
-- =====================================================================
CREATE TABLE deliveries (
    delivery_id                  VARCHAR(20) PRIMARY KEY,
    order_id                     VARCHAR(20) NOT NULL UNIQUE,
    address                      TEXT NOT NULL,
    distance_km                  DECIMAL(8,2),
    estimated_duration_minutes   INTEGER,
    shipping_fee                 INTEGER,
    destination_lat              DECIMAL(10,7),
    destination_lng              DECIMAL(10,7),
    "D_payment_status"           VARCHAR(20) NOT NULL DEFAULT 'unpaid'
                                  CHECK ("D_payment_status" IN ('unpaid','paid','refunded')),
    delivery_status               VARCHAR(30) NOT NULL DEFAULT 'waiting_info'
                                  CHECK (delivery_status IN ('waiting_info','waiting_confirmation','waiting_payment','waiting_approval','shipping','completed','cancelled')),
    approved_at                   TIMESTAMP,
    delivery_started_at           TIMESTAMP,
    estimated_completion_at       TIMESTAMP,
    delivered_at                  TIMESTAMP,
    created_at                    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- 10. bills
-- =====================================================================
CREATE TABLE bills (
    bill_id                 VARCHAR(20) PRIMARY KEY,
    order_id                VARCHAR(20) NOT NULL UNIQUE,
    total_price              DECIMAL(12,2) NOT NULL,
    sale_off_percentage      DECIMAL(5,2),
    sale_off_total_price     DECIMAL(12,2),
    user_id                  BIGINT,
    vnp_txn_ref               VARCHAR(50),
    payment_method            VARCHAR(50),
    created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Trigger: nếu membership của user là 'administrator' thì bill miễn phí (test)
CREATE OR REPLACE FUNCTION fn_apply_administrator_free_bill()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_on_insert_bill_check_admin
BEFORE INSERT ON bills
FOR EACH ROW
EXECUTE FUNCTION fn_apply_administrator_free_bill();

-- =====================================================================
-- 11. sale_off_events
-- =====================================================================
CREATE TABLE sale_off_events (
    sale_off_id           BIGSERIAL PRIMARY KEY,
    name                  VARCHAR(100) NOT NULL,
    sale_off_percentage   DECIMAL(5,2) NOT NULL,
    start_time            TIMESTAMP NOT NULL,
    end_time              TIMESTAMP NOT NULL,
    created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- 12. stocks
-- =====================================================================
CREATE TABLE stocks (
    stock_id         VARCHAR(9) PRIMARY KEY,
    dish_id          BIGINT NOT NULL,
    quantity_start   INTEGER NOT NULL DEFAULT 50,
    quantity_left    INTEGER NOT NULL DEFAULT 50,
    refill_count     INTEGER NOT NULL DEFAULT 0,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- 13. points
-- =====================================================================
CREATE TABLE points (
    point_id                BIGSERIAL PRIMARY KEY,
    user_id                 BIGINT NOT NULL,
    bill_id                 VARCHAR(20) NOT NULL,
    points_earned            INTEGER NOT NULL DEFAULT 0,
    booking_total_price      DECIMAL(12,2) NOT NULL DEFAULT 0,
    delivery_total_price     DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- 14. statistics
-- =====================================================================
CREATE TABLE statistics (
    statistic_id      BIGSERIAL PRIMARY KEY,
    user_id           BIGINT NOT NULL UNIQUE,
    total_orders      INTEGER NOT NULL DEFAULT 0,
    booking_orders    INTEGER NOT NULL DEFAULT 0,
    delivery_orders   INTEGER NOT NULL DEFAULT 0,
    total_spent       DECIMAL(14,2) NOT NULL DEFAULT 0,
    total_points      INTEGER NOT NULL DEFAULT 0,
    updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- 15. chat_sessions
-- =====================================================================

CREATE TABLE chat_sessions (
    session_id      BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    current_node_id VARCHAR(255) NOT NULL DEFAULT 'root',
    context_data    JSONB,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- 16. chat_messages
-- =====================================================================
CREATE TABLE chat_messages (
    message_id   BIGSERIAL PRIMARY KEY,
    session_id   BIGINT NOT NULL,
    sender       VARCHAR(10) NOT NULL CHECK (sender IN ('user', 'bot')),
    content      TEXT NOT NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at);

-- =====================================================================
-- End. FOREIGN KEY CONSTRAINTS (tường minh, để PowerDesigner reverse-engineer
--     nhận diện được quan hệ và vẽ đường nối trên CDM/PDM)
-- =====================================================================

ALTER TABLE dishes
    ADD CONSTRAINT fk_dishes_type_id
    FOREIGN KEY (type_id) REFERENCES dish_types(type_id);

ALTER TABLE dish_similarities
    ADD CONSTRAINT fk_dish_similarities_dish_id_1
    FOREIGN KEY (dish_id_1) REFERENCES dishes(dish_id) ON DELETE CASCADE;

ALTER TABLE dish_similarities
    ADD CONSTRAINT fk_dish_similarities_dish_id_2
    FOREIGN KEY (dish_id_2) REFERENCES dishes(dish_id) ON DELETE CASCADE;

ALTER TABLE favorite_dishes
    ADD CONSTRAINT fk_favorite_dishes_user_id
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

ALTER TABLE favorite_dishes
    ADD CONSTRAINT fk_favorite_dishes_dish_id
    FOREIGN KEY (dish_id) REFERENCES dishes(dish_id) ON DELETE CASCADE;

ALTER TABLE restaurant_tables
    ADD CONSTRAINT fk_tables_table_type_id
    FOREIGN KEY (table_type_id) REFERENCES table_types(table_type_id);

ALTER TABLE orders
    ADD CONSTRAINT fk_orders_user_id
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

ALTER TABLE order_items
    ADD CONSTRAINT fk_order_items_order_id
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE;

ALTER TABLE order_items
    ADD CONSTRAINT fk_order_items_dish_id
    FOREIGN KEY (dish_id) REFERENCES dishes(dish_id);

ALTER TABLE reviews
    ADD CONSTRAINT fk_reviews_dish_id
    FOREIGN KEY (dish_id) REFERENCES dishes(dish_id) ON DELETE CASCADE;

ALTER TABLE reviews
    ADD CONSTRAINT fk_reviews_user_id
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

ALTER TABLE reviews
    ADD CONSTRAINT fk_reviews_order_item_id
    FOREIGN KEY (order_item_id) REFERENCES order_items(order_item_id) ON DELETE CASCADE;

ALTER TABLE booking_tables
    ADD CONSTRAINT fk_booking_tables_order_id
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE;

ALTER TABLE booking_tables
    ADD CONSTRAINT fk_booking_tables_table_number
    FOREIGN KEY (table_number) REFERENCES restaurant_tables(table_number);

ALTER TABLE deliveries
    ADD CONSTRAINT fk_deliveries_order_id
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE;

ALTER TABLE bills
    ADD CONSTRAINT fk_bills_order_id
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE;

ALTER TABLE bills
    ADD CONSTRAINT fk_bills_user_id
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL;

ALTER TABLE stocks
    ADD CONSTRAINT fk_stocks_dish_id
    FOREIGN KEY (dish_id) REFERENCES dishes(dish_id);

ALTER TABLE points
    ADD CONSTRAINT fk_points_user_id
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

ALTER TABLE points
    ADD CONSTRAINT fk_points_bill_id
    FOREIGN KEY (bill_id) REFERENCES bills(bill_id) ON DELETE CASCADE;

ALTER TABLE statistics
    ADD CONSTRAINT fk_statistics_user_id
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

ALTER TABLE chat_sessions
    ADD CONSTRAINT fk_chat_sessions_user_id
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

ALTER TABLE chat_messages
    ADD CONSTRAINT fk_chat_messages_session_id
    FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE;


SELECT * FROM favorite_dishes;
SELECT COUNT(*) FROM dish_similarities;