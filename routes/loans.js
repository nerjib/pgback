const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorization');
const { query } = require('../config/database');

// @route   POST api/loans
// @desc    Create a new loan (Admin/Agent)
// @access  Private (Admin, Agent)
router.post('/', auth, authorize('admin', 'agent'), async (req, res) => {
  const { customer_id, device_id, device_price, term_months, down_payment = 0, guarantor_details } = req.body;

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
      'INSERT INTO loans (customer_id, device_id, total_amount, amount_paid, balance, term_months, monthly_payment, down_payment, next_payment_date, guarantor_details) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *;',
      [customer_id, device_id, total_amount, down_payment, total_amount, term_months, monthly_payment, down_payment, next_payment_date, guarantor_details]
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
    const loans = await query('SELECT * FROM loans');
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

module.exports = router;
