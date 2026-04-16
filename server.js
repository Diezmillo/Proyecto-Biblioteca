const express = require("express");
const mysql = require("mysql2/promise");
const session = require("express-session");
const bcrypt = require("bcrypt");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;

// Motor de vistas
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.static("public"));
app.use(session({
    secret: "secreto_super_seguro",
    resave: false,
    saveUninitialized: false
}));
// Conexión a MySQL
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
});
console.log("✅ Pool de MySQL listo");
// Usuario global
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});
// Middleware para rutas protegidas
function authMiddleware(req, res, next){
    if(!req.session.user){return res.redirect("/");}
    next();
}
function userType(type) {
    return (req, res, next) => {

        if (!req.session.user) {
            return res.redirect("/");
        }

        if (req.session.user.userType !== type) {
            return res.send("⛔ Acceso no autorizado");
        }

        next();
    };
}
// Registro
app.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
        if (rows.length > 0) {
            return res.render("index", { error: "El correo ya está registrado", loginError: null });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", [name, email, hashedPassword]);
        res.redirect("/");
    } catch (error) {
        console.error(error);
        res.send("Error en el registro");
    }
});
// Login
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
        if (rows.length === 0) {
            return res.render("index", { error: null, loginError: "Correo o contraseña incorrectos" });
        }
        const user = rows[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.render("index", { error: null, loginError: "Correo o contraseña incorrectos" });
        }
        req.session.user = { 
            id: user.id, 
            name: user.name, 
            email: user.email,
            userType: user.userType
        };
        res.redirect("/");
    } catch (error) {
        console.error(error);
        res.send("Error en el login");
    }
});
// Logout
app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/");
});
// Home con libros + paginación
app.get("/", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 6;
        const offset = (page - 1) * limit;
        const [libros] = await db.query("SELECT * FROM libros LIMIT ? OFFSET ?", [limit, offset]);
        const [[{ total }]] = await db.query("SELECT COUNT(*) as total FROM libros");
        const totalPages = Math.ceil(total / limit);
        res.render("index", {
            libros,
            currentPage: page,
            totalPages,
            error: null,
            loginError: null
        });
    } catch (error) {
        console.error(error);
        res.send("Error al cargar libros");
    }
});
// Rutas Categorías
app.get("/categorias", authMiddleware, userType("admin"), async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM categorias");
        res.render("categorias", { categorias: rows });
    } catch (error) {
        console.error(error);
        res.send("Error al cargar categorías");
    }
});
app.post("/categorias/agregar", authMiddleware, userType("admin"), async (req, res) => {
    try {
        const { nombre } = req.body;
        await db.query("INSERT INTO categorias (nombre) VALUES (?)", [nombre]);
        res.redirect("/categorias");
    } catch (error) {
        console.error(error);
        res.send("Error al agregar categoría");
    }
});
app.get("/categorias/editar/:id", authMiddleware, userType("admin"), async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM categorias WHERE id = ?", [req.params.id]);
        res.render("editar-categoria", { categoria: rows[0] });
    } catch (error) {
        console.error(error);
        res.send("Error al cargar categoría");
    }
});
app.post("/categorias/editar/:id", authMiddleware, userType("admin"), async (req, res) => {
    try {
        const { nombre } = req.body;
        await db.query("UPDATE categorias SET nombre = ? WHERE id = ?", [nombre, req.params.id]);
        res.redirect("/categorias");
    } catch (error) {
        console.error(error);
        res.send("Error al editar categoría");
    }
});
app.get("/categorias/eliminar/:id", authMiddleware, userType("admin"), async (req, res) => {
    try {
        await db.query("DELETE FROM categorias WHERE id = ?", [req.params.id]);
        res.redirect("/categorias");
    } catch (error) {
        console.error(error);
        res.send("Error al eliminar categoría");
    }
});
// Rutas Libros
app.get("/libros/agregar", authMiddleware, (req, res) => {
    res.render("agregar-libro");
});
app.post("/libros/agregar", authMiddleware, async (req, res) => {
    try {
        const { titulo, descripcion, imagen } = req.body;
        await db.query("INSERT INTO libros (titulo, descripcion, imagen) VALUES (?, ?, ?)", [titulo, descripcion, imagen]);
        res.redirect("/");
    } catch (error) {
        console.error(error);
        res.send("Error al agregar libro");
    }
});
app.get("/libros/editar/:id", authMiddleware, async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM libros WHERE id = ?", [req.params.id]);
        res.render("editar-libro", { libro: rows[0] });
    } catch (error) {
        console.error(error);
        res.send("Error al cargar libro");
    }
});
app.post("/libros/editar/:id", authMiddleware, async (req, res) => {
    try {
        const { titulo, descripcion, imagen } = req.body;
        await db.query("UPDATE libros SET titulo=?, descripcion=?, imagen=? WHERE id=?", [titulo, descripcion, imagen, req.params.id]);
        res.redirect("/");
    } catch (error) {
        console.error(error);
        res.send("Error al editar libro");
    }
});
app.get("/libros/eliminar/:id", authMiddleware, async (req, res) => {
    try {
        await db.query("DELETE FROM libros WHERE id = ?", [req.params.id]);
        res.redirect("/");
    } catch (error) {
        console.error(error);
        res.send("Error al eliminar libro");
    }
});
// FORM PRESTAMO
app.get("/prestamos/:id",authMiddleware,async(req,res)=>{
    const [rows]=await db.query("SELECT * FROM libros WHERE id=?",[req.params.id]);
    res.render("prestar-libro",{libro:rows[0]});
});
// CREAR PRESTAMO
app.post("/prestamos/crear/:id",authMiddleware,async(req,res)=>{
    const user=req.session.user.id;
    const libro=req.params.id;
    const {fecha_devolucion}=req.body;
    await db.query(`INSERT INTO prestamos (user_id,libro_id,fecha_prestamo,fecha_devolucion)
        VALUES(?,?,CURDATE(),?)`,[user,libro,fecha_devolucion]);
    await db.query("UPDATE libros SET disponible=false WHERE id=?",[libro]);
    res.redirect("/");
});
// MIS PRESTAMOS
app.get("/mis-prestamos",authMiddleware,async(req,res)=>{
    const [rows]=await db.query(`SELECT prestamos.*,libros.titulo FROM prestamos
    JOIN libros ON libros.id=prestamos.libro_id WHERE user_id=?`,[req.session.user.id]);
    res.render("mis-prestamos",{prestamos:rows});
});
//DEOVLUCiON
app.get("/prestamos/devolver/:id", authMiddleware, async (req,res)=>{
    try{const prestamo = req.params.id; await db.query(
        "UPDATE prestamos SET estado='Devuelto' WHERE id=?",[prestamo]);
    await db.query(`UPDATE libros JOIN prestamos ON prestamos.libro_id=libros.id
    SET libros.disponible=true WHERE prestamos.id=?`,[prestamo]);
    res.redirect("/mis-prestamos");}
    
    catch(error){console.log(error);res.send("Error");}
});
// Servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});