import express from "express";
import bodyParser from "body-parser";
import { dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import bcrypt from "bcrypt";
import { DataRowMessage } from "pg-protocol/dist/messages";
import path from "path";

dotenv.config();
const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const port = process.env.PORT || 3000;

// --- PostgreSQL pool ---
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// --- Session Store (เก็บ session ลง Postgres) ---
const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "session", // ชื่อตาราง session (ปล่อยให้ lib สร้างให้โดยอัตโนมัติ)
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24, // 1 วัน
    },
  })
);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'assets')));

// --- Helper: แนบ user เข้ากับ req จาก session ---
app.use((req, res, next) => {
  if (req.session && req.session.user) {
    req.user = req.session.user;
  }
  next();
});

// --- Middleware: ต้องล็อกอินก่อน ---
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).sendFile(path.join(__dirname, 'public', 'login_page.html'));
  }
  next();
}

// check in case user without login enter where "no role" can't enter
// (enter the path that contain /u will check if user login yet)
app.use((req, res, next) => {
  const openPaths = ["/", "/login", "/logout", "/register"]; //all paths that "no role" can enter
  if (openPaths.includes(req.path)) {
    return next(); 
  }
  return requireAuth(req, res, next); 
});

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).send("กรุณาลงชื่อเข้าใช้");
    if (!roles.includes(req.user.role)) return res.status(403).send("คุณไม่ได้รับอนุญาตให้เข้าหน้านี้");
    next();
  };
}

// click on ลงชื่อเข้าใช้ in index.html will check first if already login
app.get("/login", (req, res) => {
  if(req.user){
    return res.render("main.ejs", { u : req.user });
  }
  return res.status(401).sendFile(path.join(__dirname, 'public', 'login_page.html'));
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const q = `
      SELECT user_id, username, phone, role
      FROM "user_detail"
      WHERE username = $1
        AND password = crypt($2, password)
      LIMIT 1
    `;

    const { rows } = await pool.query(q, [username, password]);

    if (rows.length === 0) {
      return res.status(401).send("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือบัญชีถูกระงับ");
    }

    const u = rows[0];
    req.session.user = {
      user_id: u.user_id,
      username: u.username,
      phone: u.phone,
      role: u.role,
    };
    res.render("main.ejs", { u });
  } catch (e) {
    console.error(e);
    res.status(500).send("เกิดข้อผิดพลาดภายในระบบ");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});
// --- ออกจากระบบ ---
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.post("/register", async (req, res) => {
  const { username, number, password } = req.body;
  try {
    const q = `
      INSERT INTO user_detail
      (username, phone, password, role)
      VALUES ($1, $2, crypt($3, gen_salt('bf')) , 'user')
    `;

    await pool.query(q, [username, number, password]); //ดักจับถ้าชื่อผู้ใช้ซ้ำ

    return res.render('register.ejs');
  } catch (e) {
    console.error(e);
    if (e.code === '23505') {
      return res.status(409).send(`
        <h1>ชื่อผู้ใช้ซ้ำกรุณาลงทะเบียนใหม่</h1>
        <a href="/login_page.html">ย้อนกลับ/a>
        `);
    }
    return res.status(500).send("เกิดข้อผิดพลาดภายในระบบ");
  }
});

app.get("/first", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'first.html'));
});

app.get("/purchase_history", (req, res) => {
  res.render('purchase_history.ejs', { u : req.user });
});

app.get("/editProfile", (req, res) => {
  res.render('edit_profile.ejs', { u : req.user });
});

// fetch user transaction for display
app.get('/fetchTransactions', async (req, res) => {
  try {
    let q;
    let params;

    if (req.user.role === 'admin') {
      // Admin: fetch ALL users' transactions
      q = `
        SELECT 
          t.trans_id,
          z.zone_name,
          t.seat_number,
          z.base_price,
          t.purchase_date,
          c.title,
          u.user_id,
          u.username
        FROM "transaction" t
        JOIN zone_detail z ON t.zone_id = z.zone_id
        JOIN concert_detail c ON z.concert_id = c.concert_id
        JOIN user_detail u ON t.user_id = u.user_id
        ORDER BY t.purchase_date DESC
      `;
      params = [];
    } else {
      //  User: fetch only their own transactions
      q = `
        SELECT 
          t.trans_id,
          z.zone_name,
          t.seat_number,
          z.base_price,
          t.purchase_date,
          c.title
        FROM "transaction" t
        JOIN zone_detail z ON t.zone_id = z.zone_id
        JOIN concert_detail c ON z.concert_id = c.concert_id
        WHERE t.user_id = $1
        ORDER BY t.purchase_date DESC
      `;
      params = [req.user.user_id];
    }
    const result = await pool.query(q, params);

    // Get list of zone names only
    const timeStamp = result.rows.map(row => row.purchase_date);
    console.log('Zone names:', timeStamp);

    res.json(result.rows);
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).send('Query to database not successful');
  }
})

app.get('/admin/delete/:id', async (req, res) =>{
  const { id } = req.params;
  try {
    await pool.query(`Delete transaction id $1?`, [ id ]);
    res.json({ message: 'Transaction deleted'});
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).send('Query to database not successful');
  }
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});