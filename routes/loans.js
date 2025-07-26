const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorization');
const { query } = require('../config/database');

// @route   POST api/loans
// @desc    Create a new loan (Admin/Agent)
// @access  Private (Admin, Agent)
router.post('/', auth, authorize('admin', 'agent'), async (req, res) => {
  const { customer_id, device_id, device_price, term_months, down_payment = 0, guarantor_details, agent_id } = req.body;

  try {
    // Basic validation
    if (!customer_id || !device_id || !device_price || !term_months) {
      return res.status(400).json({ msg: 'Please provide customer_id, device_id, device_price, and term_months' });
    }

    // Check if customer and device exist
    const customer = await query('SELECT id FROM users WHERE id = $1 AND role = customer', [customer_id]);
    if (customer.rows.length === 0) {
      return res.status(404).json({ msg: 'Customer not found' });
    }

    const device = await query('SELECT id FROM devices WHERE id = $1', [device_id]);
    if (device.rows.length === 0) {
      return res.status(404).json({ msg: 'Device not found' });
    }

    const total_amount = device_price - down_payment;
    const monthly_payment = total_amount / term_months;
    const next_payment_date = new Date();
    next_payment_date.setMonth(next_payment_date.getMonth() + 1); // Next month

    const newLoan = await query(
      'INSERT INTO loans (customer_id, device_id, total_amount, amount_paid, balance, term_months, monthly_payment, down_payment, next_payment_date, guarantor_details, agent_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *;',
      [customer_id, device_id, total_amount, down_payment, total_amount, term_months, monthly_payment, down_payment, next_payment_date, guarantor_details, agent_id]
    );

    res.json({ msg: 'Loan created successfully', loan: newLoan.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/loans
// @desc    Get all loans (Admin)
// @access  Private (Admin)
router.get('/', auth, authorize('admin'), async (req, res) => {
  try {
    const loans = await query(`
      SELECT
        l.id AS loan_id,
        u.username AS customer_name,
        l.total_amount AS loan_amount,
        (l.amount_paid / l.total_amount) * 100 AS payment_progress,
        l.status,
        l.next_payment_date AS next_payment,
        l.monthly_payment
      FROM loans l
      JOIN users u ON l.customer_id = u.id
      ORDER BY l.id ASC
    `);
    res.json(loans.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/loans/:id
// @desc    Get loan by ID (Admin, Agent, Customer if it's their loan)
// @access  Private
router.get('/:id', auth, async (req, res) => {
  const { id } = req.params;

  try {
    const loan = await query('SELECT * FROM loans WHERE id = $1', [id]);

    if (loan.rows.length === 0) {
      return res.status(404).json({ msg: 'Loan not found' });
    }

    // Authorize: Admin can view any loan, Agent can view any loan, Customer can only view their own loan
    if (req.user.role === 'customer' && loan.rows[0].customer_id !== req.user.id) {
      return res.status(403).json({ msg: 'Access denied: You can only view your own loans.' });
    }

    res.json(loan.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/loans/customer/:customerId
// @desc    Get all loans for a specific customer
// @access  Private (Admin, Agent, Customer - can only view their own loans)
router.get('/customer/:customerId', auth, async (req, res) => {
  const { customerId } = req.params;

  try {
    // Authorize: Admin and Agent can view any customer's loans, Customer can only view their own loans
    if (req.user.role === 'customer' && req.user.id !== customerId) {
      return res.status(403).json({ msg: 'Access denied: You can only view your own loans.' });
    }

    const loans = await query(`
      SELECT
        l.id,
        l.total_amount AS "totalAmount",
        l.amount_paid AS "amountPaid",
        l.balance AS "remainingAmount",
        l.status,
        l.next_payment_date AS "nextPaymentDate",
        dt.device_name AS "deviceType",
        d.serial_number AS "deviceId",
        (l.amount_paid / l.total_amount) * 100 AS progress
      FROM loans l
      JOIN devices d ON l.device_id = d.id
      JOIN device_types dt ON d.device_type_id = dt.id
      WHERE l.customer_id = $1
      ORDER BY l.next_payment_date ASC
    `, [customerId]);

    res.json(loans.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
