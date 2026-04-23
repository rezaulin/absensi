const mysql = require('mysql2/promise');
require('dotenv').config();

// ============================================================
// Database Connection Pool
// ============================================================
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'epesantren',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'epesantren_saas',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  charset: 'utf8mb4'
});

// ============================================================
// Helper: INSERT and return inserted id
// ============================================================
async function dbInsert(table, data) {
  const keys = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO \`${table}\` (${keys.map(k => `\`${k}\``).join(', ')}) VALUES (${placeholders})`;
  const [result] = await pool.execute(sql, vals);
  return result.insertId;
}

// ============================================================
// Helper: UPDATE with WHERE clause
// ============================================================
async function dbUpdate(table, data, where, whereVals = []) {
  const sets = Object.keys(data).map(k => `\`${k}\` = ?`).join(', ');
  const vals = [...Object.values(data), ...whereVals];
  const sql = `UPDATE \`${table}\` SET ${sets} WHERE ${where}`;
  const [result] = await pool.execute(sql, vals);
  return result.affectedRows;
}

// ============================================================
// Helper: DELETE with WHERE clause
// ============================================================
async function dbDelete(table, where, vals = []) {
  const sql = `DELETE FROM \`${table}\` WHERE ${where}`;
  const [result] = await pool.execute(sql, vals);
  return result.affectedRows;
}

// ============================================================
// Helper: SELECT multiple rows
// ============================================================
async function dbQuery(sql, vals = []) {
  const [rows] = await pool.execute(sql, vals);
  return rows;
}

// ============================================================
// Helper: SELECT single row
// ============================================================
async function dbGet(sql, vals = []) {
  const [rows] = await pool.execute(sql, vals);
  return rows[0] || null;
}

// ============================================================
// Connection test
// ============================================================
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ Database connected successfully');
    conn.release();
    return true;
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    return false;
  }
}

module.exports = { pool, dbInsert, dbUpdate, dbDelete, dbQuery, dbGet, testConnection };
