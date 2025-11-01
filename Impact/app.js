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
import multer from 'multer';



dotenv.config();
const __dirname = dirname(fileURLToPath(import.meta.url)); //เหมือนว่าจะสร้างตัวแปร __dirname เพื่อให้ใช้เป็น ไดเรทเทอรีเริ้มต้น


const app = express();
const port = process.env.PORT || 3000;


// --- PostgreSQL pool ---
const { Pool } = pg; //ดึงclass pool ออกจาก pg
const pool = new Pool({ //สร้าง อินสแตนซ์ ขึ้นมาใช้งาน
  connectionString: process.env.DATABASE_URL, //ดึงค่าจาก .env จาก DATABASE_URL มา
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
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'assets')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ตั้งค่า multer สำหรับอัปโหลดไฟล์
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads');
  },
  filename: (req, file, cb) => {
     cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });


// --- Helper: แนบ user เข้ากับ req จาก session ---
app.use((req, res, next) => {  //ทำทุกครั้งที่มีการ Request เข้ามา
  if (req.session && req.session.user) {
    req.user = req.session.user;
  }
  next();
});

app.get("/", async (req, res) => {  //localhost:3000 ที่เรียกใช้
  let result = { rows: [] };
  try {
        
        result = await pool.query('SELECT * FROM concert_detail2 ORDER BY date ASC');
        
    } catch (err) {
        
        console.error("Error fetching concerts for main page:", err);
        
    }
  res.render("main.ejs", { concerts: result.rows, u : req.user});
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
  const openPaths = ["/", "/login", "/logout", "/register","/reset", "/naruto", "/Lisa", "/Mayaram", "/Solo", "/cocktail"]; //เส้นทางที่เข้าถึงได้โดยไม่ต้อง Login
  if (openPaths.includes(req.path)) { //เช็คreq ที่ถูกส่งมาปัจจุบันว่า มีใน path ในนี้ไหม 
    return next();  //ถ้า ใช่ ให้ไปต่อ
  }
  return requireAuth(req, res, next); //ถ้าไม่ ให้ไปทำฟังชั่น requireAuth บรรทัดที่ 63
});

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).send("กรุณาลงชื่อเข้าใช้");
    if (!roles.includes(req.user.role)) {
      return res.status(403).render('No_login.ejs', {
         mess:"คุณไม่มีสิทธิ"
        ,u : req.user });
      // return res.status(403).send("ไม่มีสิทธิ์");
    }
    next();
  };
}

// click on ลงชื่อเข้าใช้ in index.html will check first if already login
app.get("/login",async (req, res) => { 
  let result = { rows: [] }; 
   try {    
        result = await pool.query('SELECT * FROM concert_detail2 ORDER BY date ASC');     
    } catch (err) {       
        console.error("Error fetching concerts for main page:", err);     
    }
  if(req.user){
    return res.render("main.ejs", { u : req.user,concerts: result.rows });
  }
  return res.status(401).sendFile(path.join(__dirname, 'public', 'login_page.html'));
});

app.post("/login", async (req, res) => {  //เมื่อมีการส่ง Request POST มา
  let result = { rows: [] };
  const { username, password } = req.body;
  try {
    const q = `
      SELECT user_id, username, phone, role
      FROM "user_detail"
      WHERE username = $1
        AND password = crypt($2, password)
      LIMIT 1
    `;
    result = await pool.query('SELECT * FROM concert_detail2 ORDER BY date ASC');
    const { rows } = await pool.query(q, [username, password]); // ถ้าตรวจสอบแล้วพบ มันจะส่ง 1 กลับมา

    if (rows.length === 0) {
      return res.status(401).render('No_login.ejs',{
        mess:"ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
      
        , u : req.user }
        
      );
    }

    const u = rows[0];
    req.session.user = {
      user_id: u.user_id,
      username: u.username,
      phone: u.phone,
      role: u.role,
    };
    res.render("main.ejs", { u ,concerts: result.rows});
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
        <a href="/login">ย้อนกลับ/a>
        `);
    }
    return res.status(500).send("เกิดข้อผิดพลาดภายในระบบ");
  }
});

app.get('/add', (req, res) => {
  res.render('add_event.ejs');
});

app.post('/add', 
  upload.fields([
    { name: 'image', maxCount: 1 },   // สำหรับภาพหน้าปก
    { name: 'imageBG', maxCount: 1 }  // สำหรับภาพพื้นหลัง
  ]), async (req, res) => {
  const { title, artist, date, time } = req.body;
  const image_path = req.files['image'] ? `/uploads/${req.files['image'][0].filename}`: null;
  const image_pathbg = req.files['imageBG'] ? `/uploads/${req.files['image'][0].filename}`: null;
    
  try {
      await pool.query(
        `INSERT INTO concert_detail2 
         (title, artist, date, time, image_path, image_pathbg) 
         VALUES ($1, $2, $3, $4, $5, $6 )`,
        [title, artist, date, time, image_path, image_pathbg]
      );
      console.log("2")
    res.redirect('/listConcerts');
  } catch (err) {
    console.error(err);
    res.send('Error inserting concert');
  }
});

// ✅ Route แสดงคอนเสิร์ตทั้งหมด
app.get('/listConcerts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM concert_detail2 ORDER BY concert_id DESC');
    res.render('listConcert.ejs', { concerts: result.rows, u : req.user });
    
  } catch (err) {
    console.error(err);
    res.send('Error loading concerts');
  }
});

app.get('/listConcerts/:title', async (req, res) => {
  const concertTitle = req.params.title; 

    try {
        
        const result = await pool.query(
            'SELECT * FROM concert_detail2 WHERE title = $1', 
            [concertTitle]
        );
        
       
        if (result.rows.length === 0) {
            return res.status(404).send('Concert not found');
        }

        // ดึงข้อมูลคอนเสิร์ตที่พบมาเพียงรายการเดียว
        const concert = result.rows[0]; 
        
        
        res.render('concertDetail.ejs', { 
            concert: concert, 
            u : req.user 
        });
        
    } catch (err) {
        console.error(err);
        res.send('Error loading concert detail');
    }
});

app.post('/listConcert/delete/:id', async (req, res) => {
  try {
    
    

    const { id } = req.params;
    await pool.query('DELETE FROM concert_detail2 WHERE concert_id = $1', [id]);

    res.redirect('/listConcerts');
  } catch (err) {
    console.error(err);
    res.status(500).send('เกิดข้อผิดพลาดในการลบข้อมูล');
  }
});

app.post("/reset",async (req, res) =>{
   const { username,phone, passwordNew } = req.body;
  try {
    const q = `
      SELECT username, phone
      FROM "user_detail"
      WHERE username = $1
        AND phone = $2
      LIMIT 1
    `;
    console.log("this");
     const { rows }= await pool.query(q, [username,phone]);

    if (rows.length === 0) {
      return res.status(401).render('No_login.ejs',{
        mess:"ชื่อผู้ใช้หรือเบอร์โทรไม่ถูกต้อง "}      
      );
    }
    const qq = `
    UPDATE "user_detail" 
    SET password = crypt($1, gen_salt('bf')) 
    WHERE username = $2  RETURNING *
    `;
    await pool.query(qq, [passwordNew,username]);
   return res.render("Yes_reset.ejs");

  } catch (e) {
    console.error(e);
   return res.status(500).send("เกิดข้อผิดพลาดภายในระบบ");
  }
});

app.post("/buyTicket", requireRole("user"), async (req, res) => {
    
  const { title, zone_name, seat_number } = req.body;
    try {
    const q = `
      INSERT INTO transaction(user_id, zone_id, seat_number) 
      SELECT 
        $1 AS user_id,
        z.zone_id,
        $2 AS seat_number
      FROM zone_detail z
      JOIN concert_detail2 c
        ON z.concert_id = c.concert_id
      WHERE c.title = $3 AND z.zone_name = $4;
    `;

    await pool.query(q, [req.user.user_id, seat_number,title, zone_name]);//ดักจับที่นั่งซ้ำ

    res.render('succeed.ejs', { u : req.user });
  } catch (e) {
    console.error(e);
    if (e.code === '23505') { //ดักจับที่นั่งซ้ำ
     
      return res.status(409).render('No_login.ejs', { 
        mess:"ที่นั่งนี้ถูกจองไปแล้ว"
        ,u : req.user });
    }
    return res.status(500).send("เกิดข้อผิดพลาดภายในระบบ");
  }
});


// strat path

app.get("/naruto", (req, res) => {
 res.render('naruto.ejs', { u : req.user });
});

app.get("/cocktail", (req, res) => {
 res.render('cocktail.ejs', { u : req.user });
});

app.get("/Solo", (req, res) => {
 res.render('solo.ejs', { u : req.user });
});

app.get("/Mayaram", (req, res) => {
 res.render('Mayaram.ejs', { u : req.user });
});

app.get("/Lisa", (req, res) => {
 res.render('Lisa.ejs', { u : req.user });
});

app.get("/add_event", (req, res) => {
 res.render('add_event.ejs', { u : req.user });
});



// End path


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
          to_char(t.purchase_date, 'HH24:MI on DD Month YYYY') AS formatted_purchase_date,
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
          to_char(t.purchase_date, 'HH24:MI on DD Month YYYY') AS formatted_purchase_date,
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
    // const all_trans_id = result.rows.map(row => row.trans_id);
    // console.log('all transaction id: ', all_trans_id);

    res.json(result.rows);
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).send('Query to database not successful');
  }
})

app.delete('/admin/delete/:id', async (req, res) =>{
  const { id } = req.params;
  try {
    await pool.query(`DELETE FROM "transaction" WHERE trans_id = $1`, [ id ]);
    res.json({ message: 'Transaction deleted'});
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).send('Query to database not successful');
  }
});

app.post("/editProfile/update", async (req, res) => {
  const { inputUsername, inputPhone, inputPass } = req.body;
  try {
    const validPassword = await pool.query(
      'SELECT * FROM "user_detail" WHERE user_id = $1 AND password = crypt($2, password) LIMIT 1',
      [req.user.user_id, inputPass]
    );
    if (validPassword.rows.length === 0) {
      console.log("wrong password input");
      return res.status(404).json({ message: 'Invalid password' });
    }

    await pool.query(
      'UPDATE "user_detail" SET username = $1, phone = $2 WHERE user_id = $3 RETURNING *',
      [inputUsername, inputPhone, req.user.user_id]
    );

    req.session.user.username = inputUsername;
    req.session.user.phone = inputPhone;

    console.log("profile update succesfully");
    return res.json({ message: 'profile update' });
  } catch (err) {
    if (err.code === '23505') {
      console.error('Username or Phone Number already exists');
      return res.json({ message : 'Username or Phone Number has been taken' });
    }
    console.error('error massage: ', err.message);
    res.status(500).send('Server error');
  }
});

app.post("/editProfile/updatePass", async (req, res) => {
  const { inputUsername, inputPhone, inputPass, inputPassNew } = req.body;
  try {
    const validPassword = await pool.query(
      'SELECT * FROM "user_detail" WHERE user_id = $1 AND password = crypt($2, password) LIMIT 1',
      [req.user.user_id, inputPass]
    );
    if (validPassword.rows.length === 0) {
      console.log("wrong password input");
      return res.status(404).json({ message: 'Invalid password' });
    }

    const q = `
    UPDATE "user_detail" 
    SET username = $1, phone = $2, password = crypt($3, gen_salt('bf')) 
    WHERE user_id = $4 RETURNING *
    `;
    await pool.query(q, [inputUsername, inputPhone, inputPassNew, req.user.user_id]);

    req.session.user.username = inputUsername;
    req.session.user.phone = inputPhone;

    console.log("profile update succesfully");
    return res.json({ message: 'profile update' });
  } catch (err) {
    if (err.code === '23505') {
      console.error('Username or Phone Number already exists');
      return res.json({ message : 'Username is already taken' });
    }
    console.error('error massage: ', err.message);
    res.status(500).send('Server error');
  }
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
  console.log(`URL : http://localhost:${port}/`);
});