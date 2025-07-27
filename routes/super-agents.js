
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorization');
const { query } = require('../config/database');

// @route   GET api/super-agents
// @desc    Get all super-agents
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
        (SELECT COUNT(*) FROM devices WHERE assigned_by IN (SELECT id FROM users WHERE super_agent_id = u.id)) AS "devicesManaged",
        (SELECT SUM(p.amount) FROM payments p JOIN loans l ON p.loan_id = l.id WHERE l.agent_id IN (SELECT id FROM users WHERE super_agent_id = u.id)) AS "totalSales",
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

module.exports = router;
