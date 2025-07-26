const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorization');
const { query } = require('../config/database');

// @route   GET api/customers
// @desc    Get all customers information
// @access  Private (Admin only)
router.get('/', auth, authorize('admin'), async (req, res) => {
  try {
    const customers = await query(`
      SELECT
        u.id,
        u.username AS name,
        u.email,
        u.phone_number AS phone,
        u.state AS location,
        u.city AS county,
        u.id_number AS "idNumber",
        u.created_at AS "joinDate",
        u.status,
        u.credit_score AS "creditScore",
        (SELECT COUNT(*) FROM loans WHERE customer_id = u.id) AS "totalLoans",
        (SELECT COUNT(*) FROM loans WHERE customer_id = u.id AND status = 'active') AS "activeLoans",
        (SELECT SUM(total_amount) FROM loans WHERE customer_id = u.id) AS "totalBorrowed",
        (SELECT SUM(amount_paid) FROM loans WHERE customer_id = u.id) AS "totalPaid",
        (SELECT SUM(balance) FROM loans WHERE customer_id = u.id) AS "outstandingBalance",
        (SELECT COUNT(*) FROM devices WHERE assigned_to = u.id) AS devices,
        (SELECT MAX(payment_date) FROM payments WHERE user_id = u.id) AS "lastPayment",
        (SELECT MIN(next_payment_date) FROM loans WHERE customer_id = u.id AND status = 'active') AS "nextPaymentDue"
      FROM users u
      WHERE u.role = 'customer'
    `);
    res.json(customers.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

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
