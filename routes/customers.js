const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorization');
const { query } = require('../config/database');

// @route   GET api/customers/me
// @desc    Get current customer's profile
// @access  Private (Customer and Admin only)
router.get('/me', auth, authorize('customer', 'admin'), async (req, res) => {
  try {
    const user = await query('SELECT id, username, email, role, phone_number, state, city, address, landmark, gps FROM users WHERE id = $1', [req.user.id]);
    if (user.rows.length === 0) {
      return res.status(404).json({ msg: 'Customer not found' });
    }
    res.json(user.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Add more customer-specific routes here (e.g., view payments, view devices)

module.exports = router;
