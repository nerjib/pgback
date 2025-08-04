const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorization');
const { query } = require('../config/database');
const axios = require('axios');
const { handleSuccessfulPayment } = require('../services/paymentService');

// @route   POST api/payments/manual
// @desc    Record a manual payment (Admin only)
// @access  Private (Admin)
router.post('/manual', auth, authorize('admin'), async (req, res) => {
  const { user_id, amount, currency, payment_method, transaction_id, loan_id } = req.body;

    if (!loan_id) {
      return res.status(400).json({ msg: 'Loan ID is required for manual payments.' });
    }

    const loan = await query('SELECT payment_cycle_amount FROM loans WHERE id = $1', [loan_id]);
    if (loan.rows.length === 0) {
      return res.status(404).json({ msg: 'Loan not found.' });
    }

    if (amount < loan.rows[0].payment_cycle_amount) {
      return res.status(400).json({ msg: `Payment amount must be at least the payment cycle amount of ${loan.rows[0].payment_cycle_amount}.` });
    }

  try {
    // Check if user exists and is a customer
    const user = await query('SELECT id, role FROM users WHERE id = $1 AND role = $2', [user_id, 'customer']);
    if (user.rows.length === 0) {
      return res.status(404).json({ msg: 'Customer not found' });
    }

    const newPayment = await query(
      'INSERT INTO payments (user_id, amount, currency, payment_method, transaction_id, status, loan_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;',
      [user_id, amount, currency || 'NGN', payment_method || 'manual', transaction_id || null, 'completed', loan_id]
    );

    await handleSuccessfulPayment(user_id, amount, newPayment.rows[0].id, loan_id);

    res.json({ msg: 'Manual payment recorded successfully', payment: newPayment.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/payments/paystack/verify
// @desc    Verify a Paystack payment
// @access  Private (Customer, Admin)
router.post('/paystack/verify', auth, authorize('customer', 'admin'), async (req, res) => {
  const { reference, user_id, amount } = req.body; // user_id is the customer making the payment

  if (!reference) {
    return res.status(400).json({ msg: 'Payment reference is required' });
  }

  try {
    const paystackResponse = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer kkkk`,
        },
      }
    );

    const { status, data } = paystackResponse.data;

    if (status && data.status === 'success') {
      // Payment is successful, record it in your database
      const newPayment = await query(
        'INSERT INTO payments (user_id, amount, currency, payment_method, transaction_id, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;',
        [user_id, data.amount / 100, data.currency, 'paystack', data.reference, 'completed'] // Paystack amount is in kobo/cents
      );

      await handleSuccessfulPayment(user_id, data.amount / 100, newPayment.rows[0].id);

      res.json({ msg: 'Paystack payment verified and recorded', payment: newPayment.rows[0] });
    } else {
      res.status(400).json({ msg: 'Paystack payment verification failed', details: data });
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
