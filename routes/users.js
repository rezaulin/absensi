const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { dbQuery, dbGet, dbInsert, dbUpdate, dbDelete } = require('../db');
const { requireAdmin } = require('../middleware/admin');
const { checkQuota } = require('../middleware/tenant');

// List users
router.get('/', requireAdmin, async (req, res) => {
  try {
    const rows = await dbQuery(
      'SELECT id, username, nama, role, email, no_hp, status, last_login, created_at FROM users WHERE sekolah_id = ? ORDER BY role, nama',
      [req.sekolah_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Gagal mengambil data pengguna' }); }
});

// Create user
router.post('/', requireAdmin, checkQuota('users'), async (req, res) => {
  try {
    const { username, password, nama, role, email, no_hp } = req.body;
    if (!username || !password || !nama) return res.status(400).json({ error: 'Username, password, dan nama harus diisi' });
    const existing = await dbGet('SELECT id FROM users WHERE sekolah_id = ? AND username = ?', [req.sekolah_id, username]);
    if (existing) return res.status(400).json({ error: 'Username sudah digunakan' });
    const hashedPass = await bcrypt.hash(password, 10);
    const id = await dbInsert('users', {
      sekolah_id: req.sekolah_id, username, password: hashedPass, nama,
      role: role || 'ustadz', email: email || '', no_hp: no_hp || ''
    });
    res.json({ success: true, id, message: 'Pengguna berhasil ditambahkan' });
  } catch (err) { res.status(500).json({ error: 'Gagal menambah pengguna' }); }
});

// Update user
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const data = {};
    ['nama','role','email','no_hp','status'].forEach(f => { if (req.body[f] !== undefined) data[f] = req.body[f]; });
    if (req.body.password) data.password = await bcrypt.hash(req.body.password, 10);
    await dbUpdate('users', data, 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    res.json({ success: true, message: 'Pengguna berhasil diupdate' });
  } catch (err) { res.status(500).json({ error: 'Gagal mengupdate pengguna' }); }
});

// Delete user
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    // Don't allow deleting yourself
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Tidak dapat menghapus akun sendiri' });
    await dbDelete('users', 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    res.json({ success: true, message: 'Pengguna berhasil dihapus' });
  } catch (err) { res.status(500).json({ error: 'Gagal menghapus pengguna' }); }
});

// Change own password
router.post('/change-password', async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password) return res.status(400).json({ error: 'Password lama dan baru harus diisi' });
    if (new_password.length < 6) return res.status(400).json({ error: 'Password baru minimal 6 karakter' });
    const user = await dbGet('SELECT * FROM users WHERE id = ? AND sekolah_id = ?', [req.user.id, req.sekolah_id]);
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
    const valid = await bcrypt.compare(old_password, user.password);
    if (!valid) return res.status(400).json({ error: 'Password lama salah' });
    const hashedPass = await bcrypt.hash(new_password, 10);
    await dbUpdate('users', { password: hashedPass }, 'id = ?', [req.user.id]);
    res.json({ success: true, message: 'Password berhasil diubah' });
  } catch (err) { res.status(500).json({ error: 'Gagal mengubah password' }); }
});

module.exports = router;
