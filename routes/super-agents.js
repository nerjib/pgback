const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorization');
const { query } = require('../config/database');

// @route   GET api/super-agents
// @desc    Get all super agents information
// @access  Private (Admin only)
router.get('/', auth, authorize('admin'), async (req, res) => {
  try {
    const superAgents = await query(`
      SELECT 
        u.id, 
        u.username AS name, 
        u.email, 
        u.phone_number AS phone, 
        u.state AS region, 
        u.status,
        u.commission_rate AS "commissionRate",
        (SELECT COUNT(*) FROM users WHERE super_agent_id = u.id) AS "agentsManaged",
        (SELECT COALESCE(SUM(sac.amount), 0) FROM super_agent_commissions sac WHERE sac.super_agent_id = u.id) AS "totalCommissionsEarned",
        u.commission_paid AS "commissionPaid",
        ((SELECT COALESCE(SUM(sac.amount), 0) FROM super_agent_commissions sac WHERE sac.super_agent_id = u.id) - COALESCE(u.commission_paid, 0)) AS "commissionBalance",
        u.last_active
      FROM users u
      WHERE u.role = 'super-agent'
    `);
    res.json(superAgents.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/super-agents/:id
// @desc    Get single super agent data with all details
// @access  Private (Admin, Super-Agent - can only view their own profile)
router.get('/:id', auth, async (req, res) => {
  const { id } = req.params;

  try {
    const superAgent = await query(
      `SELECT
        u.id,
        u.username AS name,
        u.email,
        u.phone_number AS phone,
        u.state AS region,
        u.city,
        u.address,
        u.landmark,
        u.gps,
        u.status,
        u.created_at AS "joinDate",
        u.last_active,
        u.commission_rate AS "commissionRate",
        COALESCE(SUM(sac.amount), 0) AS "totalCommissionsEarned",
        u.commission_paid AS "commissionPaid",
        ((SELECT COALESCE(SUM(sac2.amount), 0) FROM super_agent_commissions sac2 WHERE sac2.super_agent_id = u.id) - COALESCE(u.commission_paid, 0)) AS "commissionBalance",
        (SELECT COUNT(*) FROM users WHERE super_agent_id = u.id) AS "agentsManaged",
        (SELECT json_agg(json_build_object(
          'id', a.id,
          'name', a.username,
          'email', a.email,
          'phone', a.phone_number,
          'status', a.status,
          'devicesManaged', (SELECT COUNT(*) FROM devices WHERE assigned_by = a.id)
        )) FROM users a WHERE a.super_agent_id = u.id) AS "managedAgents",
        (SELECT json_agg(json_build_object(
          'id', w.id,
          'amount', w.amount,
          'date', w.withdrawal_date,
          'transactionId', w.transaction_id
        ) ORDER BY w.withdrawal_date DESC) FROM super_agent_withdrawals w WHERE w.super_agent_id = u.id) AS "withdrawalHistory"
      FROM users u
      LEFT JOIN super_agent_commissions sac ON sac.super_agent_id = u.id
      WHERE u.id = $1 AND u.role = 'super-agent'
      GROUP BY u.id
      `,
      [id]
    );

    if (superAgent.rows.length === 0) {
      return res.status(404).json({ msg: 'Super Agent not found' });
    }

    // Authorize: Admin can view any super agent, Super-Agent can only view their own profile
    if (req.user.role === 'super-agent' && req.user.id !== id) {
      return res.status(403).json({ msg: 'Access denied: You can only view your own profile.' });
    }

    res.json(superAgent.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/super-agents/:id
// @desc    Update super agent information
// @access  Private (Admin, Super-Agent - can only update their own profile)
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { username, email, phone_number, state, city, address, landmark, gps, commission_rate, status } = req.body;

  try {
    // Authorize: Admin can update any super agent, Super-Agent can only update their own profile
    if (req.user.role === 'super-agent' && req.user.id !== id) {
      return res.status(403).json({ msg: 'Access denied: You can only update your own profile.' });
    }

    // Only admin can update commission_rate and status
    if (req.user.role !== 'admin' && (commission_rate !== undefined || status !== undefined)) {
      return res.status(403).json({ msg: 'Access denied: Only administrators can update commission rate or status.' });
    }

    const updatedSuperAgent = await query(
      `UPDATE users SET
        username = COALESCE($1, username),
        email = COALESCE($2, email),
        phone_number = COALESCE($3, phone_number),
        state = COALESCE($4, state),
        city = COALESCE($5, city),
        address = COALESCE($6, address),
        landmark = COALESCE($7, landmark),
        gps = COALESCE($8, gps),
        commission_rate = COALESCE($9, commission_rate),
        status = COALESCE($10, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $11 RETURNING id, username, email, phone_number, state, city, address, landmark, gps, commission_rate, status, created_at, last_active, commission_paid;
      `,
      [username, email, phone_number, state, city, address, landmark, gps, commission_rate, status, id]
    );

    if (updatedSuperAgent.rows.length === 0) {
      return res.status(404).json({ msg: 'Super Agent not found' });
    }

    res.json({ msg: 'Super Agent updated successfully', superAgent: updatedSuperAgent.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/super-agents/withdraw-commission
// @desc    Super Agent withdraws commission
// @access  Private (Super-Agent, Admin)
router.post('/withdraw-commission', auth, authorize('super-agent', 'admin'), async (req, res) => {
  const { amount } = req.body;
  const superAgentId = req.user.id;

  try {
    // Fetch super agent's current commission details
    const superAgentResult = await query(
      `SELECT 
        COALESCE(SUM(sac.amount), 0) AS total_earned,
        COALESCE(u.commission_paid, 0) AS total_paid,
        u.last_withdrawal_date
      FROM users u
      LEFT JOIN super_agent_commissions sac ON sac.super_agent_id = u.id
      WHERE u.id = $1
      GROUP BY u.commission_paid, u.last_withdrawal_date`,
      [superAgentId]
    );

    if (superAgentResult.rows.length === 0) {
      return res.status(404).json({ msg: 'Super Agent not found.' });
    }

    const { total_earned, total_paid, last_withdrawal_date } = superAgentResult.rows[0];
    const availableBalance = parseFloat(total_earned) - parseFloat(total_paid);

    // Check if withdrawal is allowed this month
    const now = new Date();
    if (last_withdrawal_date) {
      const lastWithdrawal = new Date(last_withdrawal_date);
      if (lastWithdrawal.getMonth() === now.getMonth() && lastWithdrawal.getFullYear() === now.getFullYear()) {
        return res.status(400).json({ msg: 'You can only withdraw commission once a month.' });
      }
    }

    // Validate withdrawal amount
    if (amount <= 0 || amount > availableBalance) {
      return res.status(400).json({ msg: 'Invalid withdrawal amount or insufficient balance.' });
    }

    // Record withdrawal
    const newWithdrawal = await query(
      'INSERT INTO super_agent_withdrawals (super_agent_id, amount) VALUES ($1, $2) RETURNING *;',
      [superAgentId, amount]
    );

    // Update super agent's commission_paid and last_withdrawal_date
    const updatedSuperAgent = await query(
      'UPDATE users SET commission_paid = commission_paid + $1, last_withdrawal_date = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *;',
      [amount, superAgentId]
    );

    res.json({ msg: 'Commission withdrawn successfully', withdrawal: newWithdrawal.rows[0], superAgent: updatedSuperAgent.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;