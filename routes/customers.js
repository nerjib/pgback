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
        u.role,
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

// @route   GET api/customers/:id
// @desc    Get single customer data with all details
// @access  Private (Admin, Agent, Customer - can only view their own profile)
router.get('/:id', auth, async (req, res) => {
  const { id } = req.params;
  try {
    const customer = await query(`
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
        (SELECT COUNT(*) FROM loans WHERE customer_id = u.id AND status = 'completed') AS "completedLoans",
        (SELECT SUM(total_amount) FROM loans WHERE customer_id = u.id) AS "totalBorrowed",
        (SELECT SUM(amount_paid) FROM loans WHERE customer_id = u.id) AS "totalPaid",
        (SELECT SUM(balance) FROM loans WHERE customer_id = u.id) AS "outstandingBalance",
        (SELECT COUNT(*) FROM devices WHERE assigned_to = u.id) AS devices,
        (SELECT MAX(payment_date) FROM payments WHERE user_id = u.id) AS "lastPayment",
        (SELECT MIN(next_payment_date) FROM loans WHERE customer_id = u.id AND status = 'active') AS "nextPaymentDue",
        (SELECT json_agg(json_build_object(
          'id', l.id,
          'deviceType', dt.device_name,
          'deviceId', l.device_id,
          'principalAmount', l.total_amount,
          'totalAmount', l.total_amount,
          'paidAmount', l.amount_paid,
          'remainingAmount', l.balance,
          'monthlyPayment', l.monthly_payment,
          'startDate', l.start_date,
          'endDate', l.end_date,
          'status', l.status,
          'nextPaymentDate', l.next_payment_date,
          'progress', (l.amount_paid / l.total_amount) * 100
        )) FROM loans l JOIN devices d ON l.device_id = d.id JOIN device_types dt ON d.device_type_id = dt.id WHERE l.customer_id = u.id) AS loans,
        (SELECT json_agg(json_build_object(
          'id', d.id,
          'serialNumber', d.serial_number,
          'type', dt.device_name,
          'model', dt.device_model,
          'status', d.status,
          'installDate', d.created_at,
          'batteryLevel', 0, -- Placeholder, as devices table does not have this
          'lastSync', d.updated_at -- Using updated_at as last sync for now
        )) FROM devices d JOIN device_types dt ON d.device_type_id = dt.id WHERE d.assigned_to = u.id) AS devices,
        (SELECT json_agg(json_build_object(
          'id', p.id,
          'date', p.payment_date,
          'amount', p.amount,
          'method', p.payment_method,
          'reference', p.transaction_id,
          'status', p.status,
          'loanId', p.loan_id
        )) FROM payments p WHERE p.user_id = u.id) AS "paymentHistory",
        (SELECT json_agg(json_build_object(
          'id', a.id,
          'type', 'payment', -- Assuming all activities are payments for now
          'message', 'Payment received: NGN ' || a.amount,
          'timestamp', a.payment_date,
          'status', 'success' -- Assuming all payments are successful for now
        ) ORDER BY a.payment_date DESC) FROM (SELECT * FROM payments WHERE user_id = u.id ORDER BY payment_date DESC LIMIT 5) a) AS "recentActivities"
      FROM users u
      WHERE u.id = $1 AND u.role = 'customer'
    `, [id]);

    if (customer.rows.length === 0) {
      return res.status(404).json({ msg: 'Customer not found' });
    }

    // Authorize: Admin and Agent can view any customer, Customer can only view their own profile
    if (req.user.role === 'customer' && req.user.id !== id) {
      return res.status(403).json({ msg: 'Access denied: You can only view your own profile.' });
    }

    res.json(customer.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/customers/:id
// @desc    Update customer information
// @access  Private (Admin, Agent, Customer - can only update their own profile)
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, idNumber, occupation, monthly_income, location, county, status } = req.body;

  try {
    // Authorize: Admin and Agent can update any customer, Customer can only update their own profile
    if (req.user.role === 'customer' && req.user.id !== id) {
      return res.status(403).json({ msg: 'Access denied: You can only update your own profile.' });
    }

    const updatedCustomer = await query(
      `UPDATE users SET
        username = COALESCE($1, username),
        email = COALESCE($2, email),
        phone_number = COALESCE($3, phone_number),
        id_number = COALESCE($4, id_number),
        occupation = COALESCE($5, occupation),
        monthly_income = COALESCE($6, monthly_income),
        state = COALESCE($7, state),
        city = COALESCE($8, city),
        status = COALESCE($9, status)
      WHERE id = $10 RETURNING *`,
      [name, email, phone, idNumber, occupation, monthly_income, location, county, status, id]
    );

    if (updatedCustomer.rows.length === 0) {
      return res.status(404).json({ msg: 'Customer not found' });
    }

    res.json({ msg: 'Customer updated successfully', customer: updatedCustomer.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;

