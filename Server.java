// ---------------------------------------------------------------------------
//  RentMate Web  -  Java backend (no frameworks needed)
//
//  Compile : javac -cp ".;mysql-connector-j-26.7.0.jar" Server.java
//  Run     : java  -cp ".;mysql-connector-j-26.7.0.jar" Server
//  Open    : http://localhost:8080
//
//  (On Mac/Linux use ":" instead of ";" in the classpath.)
//  Uses only the JDK's built-in com.sun.net.httpserver + your MySQL connector.
// ---------------------------------------------------------------------------
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.io.UnsupportedEncodingException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.sql.Types;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;

public class Server {

    // ----------------------------- configuration -----------------------------
    static final String DB_NAME = "rentmate";
    static final String HOST_URL = "jdbc:mysql://localhost:3306/";
    static final String URL = HOST_URL + DB_NAME + "?useUnicode=true&characterEncoding=UTF-8";
    static final String DB_USER = "root";
    static final String DB_PASS = "";
    static final int PORT = 8081;
    static final Path WEB_ROOT = Paths.get("public").toAbsolutePath().normalize();

    // ------------------------------- plumbing --------------------------------
    static class Session {
        final int id;
        final String name;
        final String role; // ADMIN or CUSTOMER

        Session(int id, String name, String role) {
            this.id = id;
            this.name = name;
            this.role = role;
        }
    }

    static class ApiException extends RuntimeException {
        final int status;

        ApiException(int status, String message) {
            super(message);
            this.status = status;
        }
    }

    static final Map<String, Session> sessions = new ConcurrentHashMap<String, Session>();
    static final SecureRandom RNG = new SecureRandom();

    public static void main(String[] args) throws Exception {
        try {
            Class.forName("com.mysql.cj.jdbc.Driver");
        } catch (ClassNotFoundException e) {
            System.out.println("MySQL driver not found. Run with: java -cp \".;mysql-connector-j-26.7.0.jar\" Server");
            return;
        }
        setupDatabase();
        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);
        server.createContext("/", Server::handle);
        server.setExecutor(Executors.newFixedThreadPool(16));
        server.start();
        System.out.println("RentMate is running  ->  http://localhost:" + PORT);
        System.out.println("Serving web files from: " + WEB_ROOT);
    }

    static Connection db() {
        try {
            return DriverManager.getConnection(URL, DB_USER, DB_PASS);
        } catch (SQLException e) {
            throw new ApiException(503, "Database not connected. Start MySQL in XAMPP and try again.");
        }
    }

    // ------------------------ database bootstrap (safe) ----------------------
    // Creates anything that is missing and never touches your existing data.
    static void setupDatabase() {
        try (Connection c = DriverManager.getConnection(HOST_URL, DB_USER, DB_PASS);
             Statement st = c.createStatement()) {
            st.execute("CREATE DATABASE IF NOT EXISTS " + DB_NAME + " CHARACTER SET utf8mb4");
        } catch (SQLException e) {
            System.out.println("WARNING: cannot reach MySQL. Start MySQL in XAMPP. (" + e.getMessage() + ")");
            return;
        }
        try (Connection c = db(); Statement st = c.createStatement()) {
            st.execute("CREATE TABLE IF NOT EXISTS admins (id INT AUTO_INCREMENT PRIMARY KEY, "
                    + "username VARCHAR(100) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL)");
            st.execute("CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, "
                    + "name VARCHAR(120) NOT NULL, email VARCHAR(150) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, "
                    + "phone VARCHAR(30), wallet DECIMAL(12,2) NOT NULL DEFAULT 5000)");
            st.execute("CREATE TABLE IF NOT EXISTS products (id INT AUTO_INCREMENT PRIMARY KEY, "
                    + "name VARCHAR(150) NOT NULL, category VARCHAR(60) NOT NULL, price DECIMAL(10,2) NOT NULL, "
                    + "seller_id INT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'PENDING', "
                    + "available TINYINT(1) NOT NULL DEFAULT 0)");
            st.execute("CREATE TABLE IF NOT EXISTS rentals (id INT AUTO_INCREMENT PRIMARY KEY, "
                    + "product_id INT NOT NULL, customer_id INT NOT NULL, seller_id INT NOT NULL, "
                    + "start_date DATE, due_date DATE, return_date DATE NULL, amount DECIMAL(12,2) NOT NULL, "
                    + "status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE')");
            st.execute("CREATE TABLE IF NOT EXISTS transactions (id INT AUTO_INCREMENT PRIMARY KEY, "
                    + "user_id INT NOT NULL, amount DECIMAL(12,2) NOT NULL, type VARCHAR(30) NOT NULL, "
                    + "transaction_date DATETIME)");

            // new optional columns used by the web version (description + product photo)
            addColumnIfMissing(c, "products", "description", "TEXT NULL");
            addColumnIfMissing(c, "products", "image_url", "VARCHAR(500) NULL");

            // the web version also records TOPUP and EARNING transactions
            List<Map<String, Object>> t = query(c,
                    "SELECT DATA_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='transactions' AND COLUMN_NAME='type'",
                    DB_NAME);
            if (!t.isEmpty() && "enum".equalsIgnoreCase(String.valueOf(t.get(0).get("t")))) {
                st.execute("ALTER TABLE transactions MODIFY COLUMN type VARCHAR(30) NOT NULL");
            }

            setupExtras(c);
            if (count(c, "SELECT COUNT(*) FROM admins") == 0) {
                exec(c, "INSERT INTO admins(username,password) VALUES('admin','admin123')");
                System.out.println("Created first admin account  ->  username: admin   password: admin123  (change it!)");
            }
            System.out.println("Database ready.");
        } catch (Exception e) {
            System.out.println("WARNING: database setup problem: " + e.getMessage());
        }
    }

    static void addColumnIfMissing(Connection c, String table, String column, String ddl) throws SQLException {
        long n = count(c, "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?",
                DB_NAME, table, column);
        if (n == 0) {
            try (Statement st = c.createStatement()) {
                st.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + ddl);
            }
        }
    }

    // --------------------------------- HTTP ----------------------------------
    static void handle(HttpExchange ex) throws IOException {
        try {
            String path = ex.getRequestURI().getPath();
            if (path.startsWith("/api/")) api(ex, path);
            else serveStatic(ex, path);
        } catch (Throwable t) {
            t.printStackTrace();
            try {
                send(ex, 500, "{\"error\":\"Server error\"}", "application/json; charset=utf-8");
            } catch (Exception ignore) {
            }
        } finally {
            ex.close();
        }
    }

    static void api(HttpExchange ex, String path) throws IOException {
        Object result;
        int status = 200;
        try {
            Map<String, String> p = params(ex);
            try (Connection c = db()) {
                result = route(c, ex, path, p);
            }
        } catch (ApiException e) {
            status = e.status;
            result = map("error", e.getMessage());
        } catch (SQLException e) {
            e.printStackTrace();
            status = 500;
            result = map("error", "Database error: " + e.getMessage());
        } catch (Exception e) {
            e.printStackTrace();
            status = 500;
            result = map("error", "Server error: " + e.getMessage());
        }
        send(ex, status, json(result), "application/json; charset=utf-8");
    }

    static void serveStatic(HttpExchange ex, String path) throws IOException {
        if (path.equals("/")) path = "/index.html";
        Path f = WEB_ROOT.resolve(path.substring(1)).normalize();
        if (path.startsWith("/images/") && f.startsWith(WEB_ROOT) && !Files.isRegularFile(f)) {
            String base = f.toString();
            int dot = base.lastIndexOf('.');
            if (dot > 0) for (String e : new String[]{".png", ".jpeg", ".webp", ".jpg", ".jfif", ".gif"}) {
                Path alt = Paths.get(base.substring(0, dot) + e);
                if (Files.isRegularFile(alt)) { f = alt; break; }
            }
        }
        if (!f.startsWith(WEB_ROOT) || !Files.isRegularFile(f)) {
            send(ex, 404, "404 - Not found", "text/plain; charset=utf-8");
            return;
        }
        byte[] data = Files.readAllBytes(f);
        ex.getResponseHeaders().set("Content-Type", mime(f.toString()));
        ex.getResponseHeaders().set("Cache-Control", "no-cache");
        ex.sendResponseHeaders(200, data.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(data);
        }
    }

    static String mime(String name) {
        String n = name.toLowerCase();
        if (n.endsWith(".html")) return "text/html; charset=utf-8";
        if (n.endsWith(".css")) return "text/css; charset=utf-8";
        if (n.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (n.endsWith(".json")) return "application/json; charset=utf-8";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".jfif")) return "image/jpeg";
        if (n.endsWith(".ico")) return "image/x-icon";
        if (n.endsWith(".webp")) return "image/webp";
        if (n.endsWith(".gif")) return "image/gif";
        return "application/octet-stream";
    }

    static void send(HttpExchange ex, int status, String body, String type) throws IOException {
        byte[] b = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", type);
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        ex.sendResponseHeaders(status, b.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(b);
        }
    }

    static Map<String, String> params(HttpExchange ex) throws IOException {
        Map<String, String> m = new HashMap<String, String>();
        parseInto(m, ex.getRequestURI().getRawQuery());
        if ("POST".equalsIgnoreCase(ex.getRequestMethod())) {
            String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            parseInto(m, body);
        }
        return m;
    }

    static void parseInto(Map<String, String> m, String s) {
        if (s == null || s.isEmpty()) return;
        for (String kv : s.split("&")) {
            int i = kv.indexOf('=');
            String k = i < 0 ? kv : kv.substring(0, i);
            String v = i < 0 ? "" : kv.substring(i + 1);
            try {
                m.put(URLDecoder.decode(k, "UTF-8"), URLDecoder.decode(v, "UTF-8"));
            } catch (UnsupportedEncodingException ignore) {
            }
        }
    }

    // ------------------------------ small helpers -----------------------------
    static String str(Map<String, String> p, String k) {
        String v = p.get(k);
        return v == null ? "" : v.trim();
    }

    static int integer(Map<String, String> p, String k) {
        try {
            return Integer.parseInt(str(p, k));
        } catch (NumberFormatException e) {
            throw new ApiException(400, "Invalid value for " + k + ".");
        }
    }

    static double dbl(Map<String, String> p, String k) {
        try {
            double d = Double.parseDouble(str(p, k));
            if (Double.isNaN(d) || Double.isInfinite(d)) throw new NumberFormatException();
            return d;
        } catch (NumberFormatException e) {
            throw new ApiException(400, "Invalid number for " + k + ".");
        }
    }

    static boolean truthy(Object o) {
        if (o == null) return false;
        if (o instanceof Boolean) return (Boolean) o;
        if (o instanceof Number) return ((Number) o).intValue() != 0;
        String s = o.toString();
        return s.equals("1") || s.equalsIgnoreCase("true");
    }

    static Map<String, Object> map(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        for (int i = 0; i + 1 < kv.length; i += 2) m.put(String.valueOf(kv[i]), kv[i + 1]);
        return m;
    }

    static void bind(PreparedStatement ps, Object[] params) throws SQLException {
        for (int i = 0; i < params.length; i++) {
            if (params[i] == null) ps.setNull(i + 1, Types.NULL);
            else ps.setObject(i + 1, params[i]);
        }
    }

    static List<Map<String, Object>> query(Connection c, String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            bind(ps, params);
            try (ResultSet rs = ps.executeQuery()) {
                ResultSetMetaData md = rs.getMetaData();
                int n = md.getColumnCount();
                List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
                while (rs.next()) {
                    Map<String, Object> row = new LinkedHashMap<String, Object>();
                    for (int i = 1; i <= n; i++) {
                        Object v = rs.getObject(i);
                        if (v != null && !(v instanceof Number) && !(v instanceof Boolean) && !(v instanceof String)) {
                            String s = v.toString();
                            if (v instanceof Timestamp || v instanceof java.time.LocalDateTime) {
                                s = s.replace('T', ' ');
                                if (s.length() > 19) s = s.substring(0, 19);
                            }
                            v = s;
                        }
                        row.put(md.getColumnLabel(i), v);
                    }
                    out.add(row);
                }
                return out;
            }
        }
    }

    static int exec(Connection c, String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            bind(ps, params);
            return ps.executeUpdate();
        }
    }

    static double scalar(Connection c, String sql, Object... params) throws SQLException {
        List<Map<String, Object>> r = query(c, sql, params);
        if (r.isEmpty()) return 0;
        Object v = r.get(0).values().iterator().next();
        return v instanceof Number ? ((Number) v).doubleValue() : 0;
    }

    static long count(Connection c, String sql, Object... params) throws SQLException {
        return (long) scalar(c, sql, params);
    }

    // ---------------------------------- JSON ----------------------------------
    static String json(Object o) {
        StringBuilder sb = new StringBuilder();
        writeJson(sb, o);
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    static void writeJson(StringBuilder sb, Object o) {
        if (o == null) {
            sb.append("null");
        } else if (o instanceof Boolean || o instanceof Number) {
            sb.append(o.toString());
        } else if (o instanceof Map) {
            sb.append('{');
            boolean first = true;
            for (Map.Entry<String, Object> e : ((Map<String, Object>) o).entrySet()) {
                if (!first) sb.append(',');
                first = false;
                writeString(sb, e.getKey());
                sb.append(':');
                writeJson(sb, e.getValue());
            }
            sb.append('}');
        } else if (o instanceof List) {
            sb.append('[');
            boolean first = true;
            for (Object x : (List<Object>) o) {
                if (!first) sb.append(',');
                first = false;
                writeJson(sb, x);
            }
            sb.append(']');
        } else {
            writeString(sb, o.toString());
        }
    }

    static void writeString(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            switch (ch) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (ch < 0x20) sb.append(String.format("\\u%04x", (int) ch));
                    else sb.append(ch);
            }
        }
        sb.append('"');
    }

    // ------------------------------ authentication ----------------------------
    static String token(HttpExchange ex) {
        String h = ex.getRequestHeaders().getFirst("Authorization");
        if (h != null && h.startsWith("Bearer ")) return h.substring(7).trim();
        return null;
    }

    static Session auth(HttpExchange ex) {
        String t = token(ex);
        Session s = t == null ? null : sessions.get(t);
        if (s == null) throw new ApiException(401, "Please sign in again.");
        return s;
    }

    static Object startSession(int id, String name, String role) {
        byte[] b = new byte[24];
        RNG.nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        String token = sb.toString();
        sessions.put(token, new Session(id, name, role));
        return map("token", token, "id", id, "name", name, "role", role);
    }

    static Object login(Connection c, Map<String, String> p) throws SQLException {
        String u = str(p, "username");
        String pw = p.get("password") == null ? "" : p.get("password");
        String as = str(p, "as"); // "admin", "customer" or empty (try both)
        if (u.isEmpty() || pw.isEmpty()) throw new ApiException(400, "Please enter your username and password.");
        List<Map<String, Object>> r;
        if (!as.equals("customer")) {
            r = query(c, "SELECT id, username AS name FROM admins WHERE username=? AND password=?", u, pw);
            if (!r.isEmpty())
                return startSession(((Number) r.get(0).get("id")).intValue(), String.valueOf(r.get(0).get("name")), "ADMIN");
        }
        if (!as.equals("admin")) {
            r = query(c, "SELECT id, name FROM users WHERE email=? AND password=?", u, pw);
            if (!r.isEmpty())
                return startSession(((Number) r.get(0).get("id")).intValue(), String.valueOf(r.get(0).get("name")), "CUSTOMER");
        }
        throw new ApiException(401, "Invalid username or password.");
    }

    static Object register(Connection c, Map<String, String> p) throws SQLException {
        String name = str(p, "name"), email = str(p, "email").toLowerCase(), phone = str(p, "phone");
        String pw = p.get("password") == null ? "" : p.get("password");
        if (name.isEmpty() || email.isEmpty() || pw.isEmpty()) throw new ApiException(400, "Please fill in all required fields.");
        if (!email.contains("@") || email.length() > 150) throw new ApiException(400, "Please enter a valid email address.");
        if (pw.length() < 4) throw new ApiException(400, "Password must be at least 4 characters.");
        if (count(c, "SELECT COUNT(*) FROM users WHERE email=?", email) > 0)
            throw new ApiException(409, "An account with this email already exists.");
        exec(c, "INSERT INTO users(name,email,password,phone,wallet) VALUES(?,?,?,?,5000)", name, email, pw, phone);
        List<Map<String, Object>> r = query(c, "SELECT id FROM users WHERE email=?", email);
        return startSession(((Number) r.get(0).get("id")).intValue(), name, "CUSTOMER");
    }

    static Object me(Connection c, Session s) throws SQLException {
        Map<String, Object> m = map("id", s.id, "name", s.name, "role", s.role);
        if (s.role.equals("CUSTOMER")) {
            List<Map<String, Object>> r = query(c, "SELECT wallet FROM users WHERE id=?", s.id);
            if (r.isEmpty()) throw new ApiException(401, "This account no longer exists.");
            m.put("wallet", r.get(0).get("wallet"));
            m.put("cart", count(c, "SELECT COUNT(*) FROM cart WHERE user_id=?", s.id));
            m.put("unread", count(c, "SELECT COUNT(*) FROM notifications WHERE user_id=? AND is_read=0", s.id));
            m.put("due", count(c, "SELECT COUNT(*) FROM rentals WHERE customer_id=? AND status='ACTIVE' AND due_date<=DATE_ADD(CURDATE(),INTERVAL 1 DAY)", s.id));
        }
        return m;
    }

    // --------------------------------- routing --------------------------------
    static Object route(Connection c, HttpExchange ex, String path, Map<String, String> p) throws Exception {
        if (path.equals("/api/login")) return login(c, p);
        if (path.equals("/api/register")) return register(c, p);
        if (path.equals("/api/logout")) {
            String t = token(ex);
            if (t != null) sessions.remove(t);
            return map("ok", true);
        }
        Session s = auth(ex);
        if (path.equals("/api/me")) return me(c, s);
        if (path.startsWith("/api/admin/")) {
            if (!s.role.equals("ADMIN")) throw new ApiException(403, "Admin access only.");
            return adminRoute(c, path, p);
        }
        if (!s.role.equals("CUSTOMER")) throw new ApiException(403, "Customer access only.");
        Object x2 = extraRoute(c, path, p, s);
        if (x2 != NOT_HANDLED) return x2;
        return customerRoute(c, path, p, s);
    }

    // ----------------------------------- ADMIN --------------------------------
    static Object adminRoute(Connection c, String path, Map<String, String> p) throws Exception {
        switch (path) {
            case "/api/admin/stats":
                return map(
                        "users", count(c, "SELECT COUNT(*) FROM users"),
                        "approvedProducts", count(c, "SELECT COUNT(*) FROM products WHERE UPPER(TRIM(status))='APPROVED'"),
                        "pendingProducts", count(c, "SELECT COUNT(*) FROM products WHERE UPPER(TRIM(status))='PENDING'"),
                        "activeRentals", count(c, "SELECT COUNT(*) FROM rentals WHERE status='ACTIVE'"),
                        "overdueRentals", count(c, "SELECT COUNT(*) FROM rentals WHERE status='ACTIVE' AND due_date < CURDATE()"),
                        "transactions", count(c, "SELECT COUNT(*) FROM transactions"),
                        "revenue", scalar(c, "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='RENTAL'"),
                        "walletTotal", scalar(c, "SELECT COALESCE(SUM(wallet),0) FROM users"));

            case "/api/admin/users":
                return query(c, "SELECT id, name, email, phone, wallet FROM users ORDER BY id DESC");

            case "/api/admin/users/delete": {
                int id = integer(p, "id");
                c.setAutoCommit(false);
                try {
                    exec(c, "DELETE FROM transactions WHERE rental_id IN (SELECT id FROM rentals WHERE customer_id=? OR seller_id=? "
                            + "OR product_id IN (SELECT id FROM products WHERE seller_id=?))", id, id, id);
                    exec(c, "DELETE FROM reviews WHERE user_id=? OR product_id IN (SELECT id FROM products WHERE seller_id=?)", id, id);
                    exec(c, "DELETE FROM cart WHERE user_id=? OR product_id IN (SELECT id FROM products WHERE seller_id=?)", id, id);
                    exec(c, "DELETE FROM wishlist WHERE user_id=? OR product_id IN (SELECT id FROM products WHERE seller_id=?)", id, id);
                    exec(c, "DELETE FROM notifications WHERE user_id=?", id);
                    exec(c, "DELETE FROM transactions WHERE user_id=?", id);
                    exec(c, "DELETE FROM rentals WHERE customer_id=? OR seller_id=?", id, id);
                    exec(c, "DELETE FROM rentals WHERE product_id IN (SELECT id FROM products WHERE seller_id=?)", id);
                    exec(c, "DELETE FROM products WHERE seller_id=?", id);
                    exec(c, "DELETE FROM users WHERE id=?", id);
                    c.commit();
                } catch (SQLException e) {
                    c.rollback();
                    throw e;
                } finally {
                    c.setAutoCommit(true);
                }
                return map("ok", true);
            }

            case "/api/admin/products":
                return query(c, "SELECT p.id, p.name, p.category, p.price, p.image_url AS image, u.name AS seller, p.status, p.available "
                        + "FROM products p JOIN users u ON p.seller_id=u.id ORDER BY p.id DESC");

            case "/api/admin/products/delete":
                deleteProduct(c, integer(p, "id"), -1);
                return map("ok", true);

            case "/api/admin/approvals":
                return query(c, "SELECT p.id, p.name, p.category, p.price, p.description, p.image_url AS image, u.name AS seller, p.status "
                        + "FROM products p JOIN users u ON p.seller_id=u.id WHERE UPPER(TRIM(p.status))='PENDING' ORDER BY p.id DESC");

            case "/api/admin/approve": {
                int id = integer(p, "id");
                boolean approve = str(p, "approve").equals("true");
                exec(c, "UPDATE products SET status=?, available=? WHERE id=?", approve ? "APPROVED" : "REJECTED", approve ? 1 : 0, id);
                List<Map<String, Object>> pr = query(c, "SELECT seller_id, name FROM products WHERE id=?", id);
                if (!pr.isEmpty()) note(c, ((Number) pr.get(0).get("seller_id")).intValue(),
                        "Your product \"" + pr.get(0).get("name") + "\" was " + (approve ? "approved and is now live." : "rejected."));
                return map("ok", true);
            }

            case "/api/admin/rentals":
                return query(c, "SELECT r.id, u.name AS customer, s.name AS seller, p.name AS product, r.start_date AS startDate, "
                        + "r.due_date AS dueDate, r.return_date AS returnDate, r.amount, r.status, "
                        + "(r.status='ACTIVE' AND r.due_date < CURDATE()) AS overdue "
                        + "FROM rentals r JOIN users u ON r.customer_id=u.id JOIN users s ON r.seller_id=s.id "
                        + "JOIN products p ON r.product_id=p.id ORDER BY r.id DESC");

            case "/api/admin/payments":
                return query(c, "SELECT t.id, u.name AS customer, t.amount, t.type, t.transaction_date AS txDate "
                        + "FROM transactions t JOIN users u ON t.user_id=u.id ORDER BY t.id DESC");

            case "/api/admin/wallets":
                return query(c, "SELECT id, name, email, wallet FROM users ORDER BY wallet DESC");

            case "/api/admin/deposits":
                return query(c, "SELECT r.id, u.name AS customer, s.name AS seller, p.name AS product, r.status, r.return_date AS returnDate, "
                        + "r.deposit, r.late_fee AS lateFee, r.damage_fee AS damageFee, r.deposit_status AS depositStatus, "
                        + "r.return_note AS returnNote, r.damage_note AS damageNote FROM rentals r JOIN users u ON r.customer_id=u.id "
                        + "JOIN users s ON r.seller_id=s.id JOIN products p ON r.product_id=p.id WHERE r.deposit>0 ORDER BY r.id DESC");
            case "/api/admin/settle":
                return settleDeposit(c, new Session(0, "admin", "ADMIN"), integer(p, "rental_id"), str(p, "level"), str(p, "note"));
            case "/api/admin/reviews":
                return query(c, "SELECT rv.id, p.name AS product, u.name AS customer, rv.rating, rv.title, rv.comment, rv.created_at AS createdAt "
                        + "FROM reviews rv JOIN products p ON p.id=rv.product_id JOIN users u ON u.id=rv.user_id ORDER BY rv.id DESC");
            case "/api/admin/reviews/delete":
                exec(c, "DELETE FROM reviews WHERE id=?", integer(p, "id"));
                return map("ok", true);

            case "/api/admin/admins":
                return query(c, "SELECT id, username FROM admins ORDER BY id");

            case "/api/admin/addAdmin": {
                String u = str(p, "username");
                String pw = p.get("password") == null ? "" : p.get("password");
                if (u.isEmpty() || pw.isEmpty()) throw new ApiException(400, "Enter a username and password.");
                if (pw.length() < 4) throw new ApiException(400, "Password must be at least 4 characters.");
                if (count(c, "SELECT COUNT(*) FROM admins WHERE username=?", u) > 0)
                    throw new ApiException(409, "That admin username is already taken.");
                exec(c, "INSERT INTO admins(username,password) VALUES(?,?)", u, pw);
                return map("ok", true);
            }
        }
        throw new ApiException(404, "Unknown admin endpoint.");
    }

    static void deleteProduct(Connection c, int id, int onlySellerId) throws SQLException {
        List<Map<String, Object>> r = query(c, "SELECT seller_id FROM products WHERE id=?", id);
        if (r.isEmpty()) throw new ApiException(404, "Product not found.");
        if (onlySellerId > 0 && ((Number) r.get(0).get("seller_id")).intValue() != onlySellerId)
            throw new ApiException(403, "You can only delete your own products.");
        if (count(c, "SELECT COUNT(*) FROM rentals WHERE product_id=? AND status='ACTIVE'", id) > 0)
            throw new ApiException(409, "This product is rented out right now. Delete it after it is returned.");
        c.setAutoCommit(false);
        try {
            exec(c, "DELETE FROM transactions WHERE rental_id IN (SELECT id FROM rentals WHERE product_id=?)", id);
            exec(c, "DELETE FROM reviews WHERE product_id=?", id);
            exec(c, "DELETE FROM cart WHERE product_id=?", id);
            exec(c, "DELETE FROM wishlist WHERE product_id=?", id);
            exec(c, "DELETE FROM rentals WHERE product_id=?", id);
            exec(c, "DELETE FROM products WHERE id=?", id);
            c.commit();
        } catch (SQLException e) {
            c.rollback();
            throw e;
        } finally {
            c.setAutoCommit(true);
        }
    }

    // --------------------------------- CUSTOMER -------------------------------
    static final String RENTAL_SELECT =
            "SELECT r.id, r.product_id AS productId, p.price AS dayPrice, r.deposit, r.late_fee AS lateFee, r.damage_fee AS damageFee, "
                    + "r.deposit_status AS depositStatus, r.damage_note AS damageNote, (SELECT COUNT(*) FROM reviews rv WHERE rv.rental_id=r.id) AS reviewed, "
                    + "p.name AS product, p.category, p.image_url AS image, u.name AS seller, "
                    + "r.start_date AS startDate, r.due_date AS dueDate, r.return_date AS returnDate, r.amount, r.status, "
                    + "(r.status='ACTIVE' AND r.due_date < CURDATE()) AS overdue "
                    + "FROM rentals r JOIN products p ON r.product_id=p.id JOIN users u ON r.seller_id=u.id ";

    static Object customerRoute(Connection c, String path, Map<String, String> p, Session s) throws Exception {
        switch (path) {
            case "/api/products": {
                String q = str(p, "q");
                String sql = PSEL + "WHERE UPPER(TRIM(p.status))='APPROVED'";
                List<Object> args = new ArrayList<Object>();
                args.add(s.id);
                args.add(s.id);
                if (!q.isEmpty()) {
                    sql += " AND (p.name LIKE ? OR p.category LIKE ? OR p.description LIKE ?)";
                    String like = "%" + q + "%";
                    args.add(like);
                    args.add(like);
                    args.add(like);
                }
                sql += " ORDER BY p.available DESC, p.id DESC";
                return query(c, sql, args.toArray());
            }

            case "/api/rent":
                return rentProduct(c, s, integer(p, "product_id"), integer(p, "days"));

            case "/api/return":
                return returnRental(c, s, integer(p, "rental_id"), str(p, "note"));

            case "/api/my/stats":
                return map(
                        "wallet", scalar(c, "SELECT wallet FROM users WHERE id=?", s.id),
                        "activeRentals", count(c, "SELECT COUNT(*) FROM rentals WHERE customer_id=? AND status='ACTIVE'", s.id),
                        "history", count(c, "SELECT COUNT(*) FROM rentals WHERE customer_id=?", s.id),
                        "myProducts", count(c, "SELECT COUNT(*) FROM products WHERE seller_id=?", s.id),
                        "pendingProducts", count(c, "SELECT COUNT(*) FROM products WHERE seller_id=? AND UPPER(TRIM(status))='PENDING'", s.id),
                        "lentActive", count(c, "SELECT COUNT(*) FROM rentals WHERE seller_id=? AND status='ACTIVE'", s.id),
                        "earnings", scalar(c, "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE user_id=? AND type='EARNING'", s.id),
                        "spent", scalar(c, "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE user_id=? AND type='RENTAL'", s.id));

            case "/api/my/rentals": {
                boolean all = str(p, "all").equals("1");
                return query(c, RENTAL_SELECT + "WHERE r.customer_id=? " + (all ? "" : "AND r.status='ACTIVE' ") + "ORDER BY r.id DESC", s.id);
            }

            case "/api/my/lent":
                return query(c, "SELECT r.id, p.name AS product, u.name AS customer, r.start_date AS startDate, r.due_date AS dueDate, "
                        + "r.return_date AS returnDate, r.amount, r.status, r.deposit, r.late_fee AS lateFee, r.damage_fee AS damageFee, "
                        + "r.deposit_status AS depositStatus, r.return_note AS returnNote, r.damage_note AS damageNote, "
                        + "(r.status='ACTIVE' AND r.due_date < CURDATE()) AS overdue "
                        + "FROM rentals r JOIN products p ON r.product_id=p.id JOIN users u ON r.customer_id=u.id "
                        + "WHERE r.seller_id=? ORDER BY r.id DESC", s.id);

            case "/api/wallet":
                return map(
                        "balance", scalar(c, "SELECT wallet FROM users WHERE id=?", s.id),
                        "transactions", query(c, "SELECT id, amount, type, transaction_date AS txDate FROM transactions "
                                + "WHERE user_id=? ORDER BY id DESC LIMIT 100", s.id));

            case "/api/wallet/topup": {
                double amt = dbl(p, "amount");
                if (amt < 1 || amt > 100000) throw new ApiException(400, "Enter an amount between Rs. 1 and Rs. 1,00,000.");
                amt = Math.round(amt * 100.0) / 100.0;
                c.setAutoCommit(false);
                try {
                    exec(c, "UPDATE users SET wallet=wallet+? WHERE id=?", amt, s.id);
                    exec(c, "INSERT INTO transactions(user_id,amount,type,transaction_date) VALUES(?,?,'TOPUP',NOW())", s.id, amt);
                    c.commit();
                } catch (SQLException e) {
                    c.rollback();
                    throw e;
                } finally {
                    c.setAutoCommit(true);
                }
                return map("ok", true, "balance", scalar(c, "SELECT wallet FROM users WHERE id=?", s.id));
            }

            case "/api/my/products":
                return query(c, "SELECT id, name, category, price, image_url AS image, status, available FROM products "
                        + "WHERE seller_id=? ORDER BY id DESC", s.id);

            case "/api/my/products/add": {
                String name = str(p, "name"), cat = str(p, "category"), desc = str(p, "description"), img = str(p, "image");
                double price = dbl(p, "price");
                if (name.isEmpty() || name.length() > 150) throw new ApiException(400, "Enter a product name (up to 150 characters).");
                if (cat.isEmpty() || cat.length() > 60) throw new ApiException(400, "Enter a category (up to 60 characters).");
                if (price <= 0 || price > 1000000) throw new ApiException(400, "Enter a valid price per day.");
                if (desc.length() > 1000) throw new ApiException(400, "Description is too long (max 1000 characters).");
                if (!img.isEmpty() && !(img.startsWith("http://") || img.startsWith("https://")) || img.length() > 500)
                    throw new ApiException(400, "Image URL must start with http:// or https://");
                exec(c, "INSERT INTO products(name,category,price,seller_id,status,available,description,image_url) "
                                + "VALUES(?,?,?,?,'PENDING',0,?,?)",
                        name, cat, price, s.id, desc.isEmpty() ? null : desc, img.isEmpty() ? null : img);
                return map("ok", true);
            }

            case "/api/my/products/delete":
                deleteProduct(c, integer(p, "id"), s.id);
                return map("ok", true);
        }
        throw new ApiException(404, "Unknown endpoint.");
    }

    // ===================== v2: cart, wishlist, safe deposit, damage, reviews, alerts =====================
    static final double DEPOSIT_MULT = 2.0;   // refundable safe deposit = 2 x the daily price
    static final double LATE_RATE = 0.5;      // late fee per overdue day = 50% of daily price (taken from the deposit)
    static final Object NOT_HANDLED = new Object();

    // shared product SELECT (2 placeholders: wished, incart)
    static final String PSEL = "SELECT p.id, p.name, p.category, p.price, p.description, p.image_url AS image, p.available, "
            + "p.seller_id AS sellerId, u.name AS seller, ROUND(p.price*" + DEPOSIT_MULT + ",2) AS deposit, "
            + "(SELECT ROUND(AVG(rv.rating),1) FROM reviews rv WHERE rv.product_id=p.id) AS rating, "
            + "(SELECT COUNT(*) FROM reviews rv WHERE rv.product_id=p.id) AS reviews, "
            + "EXISTS(SELECT 1 FROM wishlist w WHERE w.product_id=p.id AND w.user_id=?) AS wished, "
            + "EXISTS(SELECT 1 FROM cart ct WHERE ct.product_id=p.id AND ct.user_id=?) AS incart "
            + "FROM products p JOIN users u ON p.seller_id=u.id ";

    static double r2(double d) {
        return Math.round(d * 100.0) / 100.0;
    }

    static void setupExtras(Connection c) {
        addColumnSafe(c, "rentals", "deposit", "DECIMAL(10,2) NOT NULL DEFAULT 0");
        addColumnSafe(c, "rentals", "late_fee", "DECIMAL(10,2) NOT NULL DEFAULT 0");
        addColumnSafe(c, "rentals", "damage_fee", "DECIMAL(10,2) NOT NULL DEFAULT 0");
        addColumnSafe(c, "rentals", "deposit_status", "VARCHAR(20) NOT NULL DEFAULT 'NONE'");
        addColumnSafe(c, "rentals", "return_note", "VARCHAR(500) NULL");
        addColumnSafe(c, "rentals", "damage_note", "VARCHAR(500) NULL");
        String[] sql = {
            "CREATE TABLE IF NOT EXISTS cart (user_id INT NOT NULL, product_id INT NOT NULL, PRIMARY KEY(user_id,product_id))",
            "CREATE TABLE IF NOT EXISTS wishlist (user_id INT NOT NULL, product_id INT NOT NULL, PRIMARY KEY(user_id,product_id))",
            "CREATE TABLE IF NOT EXISTS notifications (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, message VARCHAR(255), "
                    + "is_read TINYINT(1) DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
            "CREATE TABLE IF NOT EXISTS reviews (id INT AUTO_INCREMENT PRIMARY KEY, rental_id INT NOT NULL UNIQUE, product_id INT NOT NULL, "
                    + "user_id INT NOT NULL, rating TINYINT NOT NULL, title VARCHAR(120), comment VARCHAR(1000), "
                    + "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
            // wallet top-ups have no rental, so rental_id must allow NULL
            "ALTER TABLE transactions MODIFY rental_id INT NULL",
            // tidy up old data so the app sees consistent values
            "UPDATE rentals SET status=UPPER(status)",
            "UPDATE transactions SET type='RENTAL' WHERE type='Rental Payment'",
            "UPDATE products SET available=0 WHERE id IN (SELECT product_id FROM rentals WHERE status='ACTIVE')",
            // product photos live in public/images/products/product_<id>.jpg (png/webp also work)
            "UPDATE products SET image_url=CONCAT('images/product_',id,'.jpg') WHERE image_url IS NULL OR image_url='' "
                    + "OR image_url=CONCAT('images/products/',id,'.jpg') OR image_url=CONCAT('images/products/product_',id,'.jpg')"
        };
        for (String q : sql) {
            try (Statement st = c.createStatement()) {
                st.execute(q);
            } catch (SQLException ignore) {
            }
        }
    }

    static void addColumnSafe(Connection c, String t, String col, String ddl) {
        try {
            addColumnIfMissing(c, t, col, ddl);
        } catch (SQLException e) {
            System.out.println("WARNING: could not add " + t + "." + col + ": " + e.getMessage());
        }
    }

    static void note(Connection c, int uid, String msg) throws SQLException {
        exec(c, "INSERT INTO notifications(user_id,message) VALUES(?,?)", uid, msg.length() > 250 ? msg.substring(0, 250) : msg);
    }

    static void tx(Connection c, int uid, Integer rentalId, double amt, String type) throws SQLException {
        exec(c, "INSERT INTO transactions(user_id,rental_id,amount,type,transaction_date) VALUES(?,?,?,?,NOW())", uid, rentalId, amt, type);
    }

    // Rent = pay (rent + refundable deposit) from wallet, credit seller with the rent, hold the deposit. All-or-nothing.
    static Object rentProduct(Connection c, Session s, int productId, int days) throws Exception {
        if (days < 1 || days > 365) throw new ApiException(400, "Rental period must be between 1 and 365 days.");
        c.setAutoCommit(false);
        try {
            List<Map<String, Object>> r = query(c, "SELECT seller_id, price, available, status, name FROM products WHERE id=? FOR UPDATE", productId);
            if (r.isEmpty()) throw new ApiException(404, "Product not found.");
            Map<String, Object> pr = r.get(0);
            int sellerId = ((Number) pr.get("seller_id")).intValue();
            double price = ((Number) pr.get("price")).doubleValue();
            String status = String.valueOf(pr.get("status")).trim().toUpperCase();
            if (!status.equals("APPROVED")) throw new ApiException(400, "This product is not approved for rent yet.");
            if (!truthy(pr.get("available"))) throw new ApiException(409, "Sorry, this product was just rented by someone else.");
            if (sellerId == s.id) throw new ApiException(400, "You cannot rent your own product.");

            double amount = r2(price * days), deposit = r2(price * DEPOSIT_MULT), total = r2(amount + deposit);
            int ok = exec(c, "UPDATE users SET wallet=wallet-? WHERE id=? AND wallet>=?", total, s.id, total);
            if (ok == 0) throw new ApiException(400, "Insufficient wallet balance. You need Rs. " + total + " (rent + refundable deposit). Add money and try again.");
            exec(c, "UPDATE users SET wallet=wallet+? WHERE id=?", amount, sellerId);
            exec(c, "INSERT INTO rentals(product_id,customer_id,seller_id,start_date,due_date,return_date,amount,status,deposit,deposit_status) "
                            + "VALUES(?,?,?,CURDATE(),DATE_ADD(CURDATE(),INTERVAL ? DAY),NULL,?,'ACTIVE',?,'HELD')",
                    productId, s.id, sellerId, days, amount, deposit);
            int rid = ((Number) query(c, "SELECT LAST_INSERT_ID() AS id").get(0).get("id")).intValue();
            exec(c, "UPDATE products SET available=0 WHERE id=?", productId);
            tx(c, s.id, rid, amount, "RENTAL");
            tx(c, s.id, rid, deposit, "DEPOSIT");
            tx(c, sellerId, rid, amount, "EARNING");
            exec(c, "DELETE FROM cart WHERE user_id=? AND product_id=?", s.id, productId);
            note(c, sellerId, s.name + " rented your \"" + pr.get("name") + "\" for " + days + " day(s). You earned Rs. " + amount + ".");
            note(c, s.id, "You rented \"" + pr.get("name") + "\". Return it on time to get your Rs. " + deposit + " deposit back.");
            c.commit();
            String due = String.valueOf(query(c, "SELECT DATE_ADD(CURDATE(), INTERVAL ? DAY) AS d", days).get(0).get("d"));
            return map("ok", true, "amount", amount, "deposit", deposit, "dueDate", due);
        } catch (Exception e) {
            c.rollback();
            throw e;
        } finally {
            c.setAutoCommit(true);
        }
    }

    // Return = rental closes, late fee (if any) is taken from the deposit, rest of deposit waits for the owner's inspection.
    static Object returnRental(Connection c, Session s, int rentalId, String cond) throws Exception {
        if (cond.length() > 500) throw new ApiException(400, "Note is too long (max 500 characters).");
        c.setAutoCommit(false);
        try {
            List<Map<String, Object>> r = query(c,
                    "SELECT r.product_id, r.seller_id, r.deposit, GREATEST(DATEDIFF(CURDATE(), r.due_date),0) AS late, p.price, p.name "
                            + "FROM rentals r JOIN products p ON p.id=r.product_id "
                            + "WHERE r.id=? AND r.customer_id=? AND r.status='ACTIVE' FOR UPDATE", rentalId, s.id);
            if (r.isEmpty()) throw new ApiException(404, "Active rental not found.");
            Map<String, Object> m = r.get(0);
            int pid = ((Number) m.get("product_id")).intValue(), sellerId = ((Number) m.get("seller_id")).intValue();
            double deposit = ((Number) m.get("deposit")).doubleValue(), price = ((Number) m.get("price")).doubleValue();
            int lateDays = ((Number) m.get("late")).intValue();
            double lateFee = Math.min(deposit, r2(lateDays * price * LATE_RATE));
            exec(c, "UPDATE rentals SET status='RETURNED', return_date=CURDATE(), late_fee=?, return_note=?, deposit_status=? WHERE id=?",
                    lateFee, cond.isEmpty() ? null : cond, deposit > 0 ? "HELD" : "NONE", rentalId);
            exec(c, "UPDATE products SET available=1 WHERE id=?", pid);
            if (lateFee > 0) {
                exec(c, "UPDATE users SET wallet=wallet+? WHERE id=?", lateFee, sellerId);
                tx(c, s.id, rentalId, lateFee, "LATEFEE");
                tx(c, sellerId, rentalId, lateFee, "EARNING");
            }
            note(c, sellerId, "\"" + m.get("name") + "\" was returned. Please inspect it and settle the deposit.");
            c.commit();
            return map("ok", true, "lateDays", lateDays, "lateFee", lateFee, "held", r2(deposit - lateFee));
        } catch (Exception e) {
            c.rollback();
            throw e;
        } finally {
            c.setAutoCommit(true);
        }
    }

    // Settle = owner (or admin) rates the damage; that % of the held deposit goes to the owner, the rest is refunded.
    static Object settleDeposit(Connection c, Session a, int rentalId, String level, String text) throws Exception {
        double pct;
        switch (level) {
            case "NONE": pct = 0; break;
            case "MINOR": pct = 0.25; break;
            case "MODERATE": pct = 0.5; break;
            case "MAJOR": pct = 1; break;
            default: throw new ApiException(400, "Choose a damage level.");
        }
        if (pct > 0 && text.isEmpty()) throw new ApiException(400, "Please describe the damage.");
        if (text.length() > 500) throw new ApiException(400, "Description is too long (max 500 characters).");
        c.setAutoCommit(false);
        try {
            List<Map<String, Object>> r = query(c,
                    "SELECT r.customer_id, r.seller_id, r.deposit, r.late_fee, p.name FROM rentals r JOIN products p ON p.id=r.product_id "
                            + "WHERE r.id=? AND r.status='RETURNED' AND r.deposit_status='HELD' FOR UPDATE", rentalId);
            if (r.isEmpty()) throw new ApiException(404, "Nothing to settle for this rental.");
            Map<String, Object> m = r.get(0);
            int cust = ((Number) m.get("customer_id")).intValue(), seller = ((Number) m.get("seller_id")).intValue();
            if (!a.role.equals("ADMIN") && seller != a.id) throw new ApiException(403, "Only the product owner or an admin can settle this deposit.");
            double held = r2(((Number) m.get("deposit")).doubleValue() - ((Number) m.get("late_fee")).doubleValue());
            double ded = r2(held * pct), refund = r2(held - ded);
            if (refund > 0) {
                exec(c, "UPDATE users SET wallet=wallet+? WHERE id=?", refund, cust);
                tx(c, cust, rentalId, refund, "REFUND");
            }
            if (ded > 0) {
                exec(c, "UPDATE users SET wallet=wallet+? WHERE id=?", ded, seller);
                tx(c, cust, rentalId, ded, "DAMAGE");
                tx(c, seller, rentalId, ded, "EARNING");
            }
            exec(c, "UPDATE rentals SET damage_fee=?, damage_note=?, deposit_status=? WHERE id=?",
                    ded, text.isEmpty() ? null : text, ded == 0 ? "REFUNDED" : (refund == 0 ? "FORFEITED" : "PARTIAL"), rentalId);
            note(c, cust, ded == 0 ? "Your full deposit of Rs. " + refund + " for \"" + m.get("name") + "\" was refunded."
                    : "Damage charged on \"" + m.get("name") + "\": Rs. " + ded + " deducted, Rs. " + refund + " refunded.");
            c.commit();
            return map("ok", true, "deduction", ded, "refund", refund);
        } catch (Exception e) {
            c.rollback();
            throw e;
        } finally {
            c.setAutoCommit(true);
        }
    }

    static Object extraRoute(Connection c, String path, Map<String, String> p, Session s) throws Exception {
        switch (path) {
            case "/api/cart":
                return query(c, PSEL + "WHERE UPPER(TRIM(p.status))='APPROVED' AND p.id IN (SELECT product_id FROM cart WHERE user_id=?) ORDER BY p.id DESC",
                        s.id, s.id, s.id);
            case "/api/wishlist":
                return query(c, PSEL + "WHERE UPPER(TRIM(p.status))='APPROVED' AND p.id IN (SELECT product_id FROM wishlist WHERE user_id=?) ORDER BY p.id DESC",
                        s.id, s.id, s.id);
            case "/api/cart/add": {
                int id = integer(p, "product_id");
                List<Map<String, Object>> r = query(c, "SELECT seller_id FROM products WHERE id=? AND UPPER(TRIM(status))='APPROVED'", id);
                if (r.isEmpty()) throw new ApiException(404, "Product not found.");
                if (((Number) r.get(0).get("seller_id")).intValue() == s.id) throw new ApiException(400, "You cannot add your own product.");
                exec(c, "INSERT IGNORE INTO cart(user_id,product_id) VALUES(?,?)", s.id, id);
                return map("ok", true, "cart", count(c, "SELECT COUNT(*) FROM cart WHERE user_id=?", s.id));
            }
            case "/api/cart/remove": {
                exec(c, "DELETE FROM cart WHERE user_id=? AND product_id=?", s.id, integer(p, "product_id"));
                return map("ok", true, "cart", count(c, "SELECT COUNT(*) FROM cart WHERE user_id=?", s.id));
            }
            case "/api/cart/checkout": { // items = "productId:days,productId:days"
                List<Object> errors = new ArrayList<Object>();
                int done = 0;
                double paid = 0;
                for (String part : str(p, "items").split(",")) {
                    if (part.trim().isEmpty()) continue;
                    int id = 0;
                    try {
                        String[] kv = part.split(":");
                        id = Integer.parseInt(kv[0].trim());
                        Map<?, ?> res = (Map<?, ?>) rentProduct(c, s, id, Integer.parseInt(kv[1].trim()));
                        paid += ((Number) res.get("amount")).doubleValue() + ((Number) res.get("deposit")).doubleValue();
                        done++;
                    } catch (ApiException e) {
                        errors.add(map("id", id, "error", e.getMessage()));
                    } catch (NumberFormatException | ArrayIndexOutOfBoundsException e) {
                        errors.add(map("id", id, "error", "Invalid cart item."));
                    }
                }
                return map("ok", true, "rented", done, "paid", r2(paid), "errors", errors);
            }
            case "/api/wishlist/toggle": {
                int id = integer(p, "product_id");
                boolean had = count(c, "SELECT COUNT(*) FROM wishlist WHERE user_id=? AND product_id=?", s.id, id) > 0;
                if (had) exec(c, "DELETE FROM wishlist WHERE user_id=? AND product_id=?", s.id, id);
                else exec(c, "INSERT IGNORE INTO wishlist(user_id,product_id) VALUES(?,?)", s.id, id);
                return map("ok", true, "wished", !had);
            }
            case "/api/notifications":
                return map("items", query(c, "SELECT id, message, is_read AS isRead, created_at AS createdAt FROM notifications "
                                + "WHERE user_id=? ORDER BY id DESC LIMIT 50", s.id),
                        "reminders", query(c, "SELECT r.id, p.name AS product, r.due_date AS dueDate, DATEDIFF(r.due_date,CURDATE()) AS daysLeft "
                                + "FROM rentals r JOIN products p ON p.id=r.product_id WHERE r.customer_id=? AND r.status='ACTIVE' "
                                + "AND r.due_date<=DATE_ADD(CURDATE(),INTERVAL 2 DAY) ORDER BY r.due_date", s.id));
            case "/api/notifications/read":
                exec(c, "UPDATE notifications SET is_read=1 WHERE user_id=?", s.id);
                return map("ok", true);
            case "/api/reviews":
                return query(c, "SELECT rv.id, rv.rating, rv.title, rv.comment, rv.created_at AS createdAt, u.name AS customer "
                        + "FROM reviews rv JOIN users u ON u.id=rv.user_id WHERE rv.product_id=? ORDER BY rv.id DESC LIMIT 50", integer(p, "product_id"));
            case "/api/review/add": {
                int rid = integer(p, "rental_id"), rating = integer(p, "rating");
                String title = str(p, "title"), com = str(p, "comment");
                if (rating < 1 || rating > 5) throw new ApiException(400, "Please choose a star rating from 1 to 5.");
                if (title.length() > 120 || com.length() > 1000) throw new ApiException(400, "Your review is too long.");
                List<Map<String, Object>> r = query(c, "SELECT product_id, seller_id FROM rentals WHERE id=? AND customer_id=? AND status='RETURNED'", rid, s.id);
                if (r.isEmpty()) throw new ApiException(400, "You can review an item after you have returned it.");
                if (count(c, "SELECT COUNT(*) FROM reviews WHERE rental_id=?", rid) > 0) throw new ApiException(409, "You already reviewed this rental.");
                exec(c, "INSERT INTO reviews(rental_id,product_id,user_id,rating,title,comment) VALUES(?,?,?,?,?,?)",
                        rid, r.get(0).get("product_id"), s.id, rating, title.isEmpty() ? null : title, com.isEmpty() ? null : com);
                note(c, ((Number) r.get(0).get("seller_id")).intValue(), s.name + " left a " + rating + "-star review on your product.");
                return map("ok", true);
            }
            case "/api/settle":
                return settleDeposit(c, s, integer(p, "rental_id"), str(p, "level"), str(p, "note"));
        }
        return NOT_HANDLED;
    }
}
