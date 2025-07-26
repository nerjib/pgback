const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorization');
const { query } = require('../config/database');

// @route   GET api/agents
// @desc    Get all agents information
// @access  Private (Admin only)
router.get('/', auth, authorize('admin'), async (req, res) => {
  try {
    const agents = await query(`
      SELECT 
        u.id, 
        u.username AS name, 
        u.email, 
        u.phone_number AS phone, 
        u.state AS region, 
        u.status,
        (SELECT COUNT(*) FROM devices WHERE assigned_by = u.id) AS "devicesManaged",
        (SELECT SUM(p.amount) FROM payments p JOIN loans l ON p.loan_id = l.id WHERE l.customer_id IN (SELECT id FROM users WHERE assigned_agent_id = u.id)) AS "totalSales",
        u.last_active
      FROM users u
      WHERE u.role = 'agent'
    `);
    res.json(agents.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/agents/me
// @desc    Get current agent's profile
// @access  Private (Agent and Admin only)
router.get('/me', auth, authorize('agent', 'admin'), async (req, res) => {
  try {
    const user = await query('SELECT id, username, email, role, phone_number, state, city, address, landmark, gps FROM users WHERE id = $1', [req.user.id]);
    if (user.rows.length === 0) {
      return res.status(404).json({ msg: 'Agent not found' });
    }
    res.json(user.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/agents/assign-device
// @desc    Assign a device to a customer
// @access  Private (Agent and Admin only)
router.post('/assign-device', auth, authorize('agent', 'admin'), async (req, res) => {
  const { device_id, customer_id } = req.body;

  try {
    // Check if device exists and is available
    let device = await query('SELECT * FROM devices WHERE id = $1 AND status = $2', [device_id, 'available']);
    if (device.rows.length === 0) {
      return res.status(400).json({ msg: 'Device not found or not available for assignment' });
    }

    // Check if customer exists and is a customer role
    let customer = await query('SELECT * FROM users WHERE id = $1 AND role = $2', [customer_id, 'customer']);
    if (customer.rows.length === 0) {
      return res.status(400).json({ msg: 'Customer not found' });
    }

    // Assign device
    const assignedDevice = await query(
      'UPDATE devices SET assigned_to = $1, assigned_by = $2, status = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *;',
      [customer_id, req.user.id, 'assigned', device_id]
    );

    res.json({ msg: 'Device assigned successfully', device: assignedDevice.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Add more agent-specific routes here (e.g., assign device to customer)

module.exports = router;
