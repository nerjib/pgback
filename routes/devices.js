const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorization');
const { query } = require('../config/database');

// @route   POST api/devices
// @desc    Add a new device (Admin only)
// @access  Private (Admin)
router.post('/', auth, authorize('admin'), async (req, res) => {
  const { serial_number, model } = req.body;

  try {
    let device = await query('SELECT * FROM devices WHERE serial_number = $1', [serial_number]);
    if (device.rows.length > 0) {
      return res.status(400).json({ msg: 'Device with this serial number already exists' });
    }

    const newDevice = await query(
      'INSERT INTO devices (serial_number, model, status) VALUES ($1, $2, $3) RETURNING *;',
      [serial_number, model, 'pending_approval'] // Devices are pending approval by default
    );
    res.json({ msg: 'Device added successfully, pending approval', device: newDevice.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/devices/:id/approve
// @desc    Approve a device (Admin only)
// @access  Private (Admin)
router.put('/:id/approve', auth, authorize('admin'), async (req, res) => {
  const { id } = req.params;

  try {
    const device = await query('UPDATE devices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *;',
      ['available', id]
    );

    if (device.rows.length === 0) {
      return res.status(404).json({ msg: 'Device not found' });
    }
    res.json({ msg: 'Device approved and is now available', device: device.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/devices
// @desc    Get all devices (Admin and Agent only)
// @access  Private (Admin, Agent)
router.get('/', auth, authorize('admin', 'agent'), async (req, res) => {
  try {
    const devices = await query('SELECT * FROM devices');
    res.json(devices.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
