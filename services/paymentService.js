const { query } = require('../config/database');
const { sendSMS } = require('./smsService');

const generateToken = () => {
  // Generate a simple 6-digit numeric token for now
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const handleSuccessfulPayment = async (userId, amount, paymentId, loanId = null) => {
  try {
    const token = generateToken();

    // Save token to database
    await query(
      'INSERT INTO tokens (user_id, token, payment_id, expires_at) VALUES ($1, $2, $3, $4)',
      [userId, token, paymentId, new Date(Date.now() + 24 * 60 * 60 * 1000)]
    );

    // Get user's phone number (assuming it's stored in the users table or can be fetched)
    const user = await query('SELECT phone_number FROM users WHERE id = $1', [userId]);
    const userContact = user.rows[0] ? user.rows[0].phone_number : null;

    if (userContact) {
      const message = `Your PayGo token is: ${token}. Amount paid: ${amount}. Valid for 24 hours.`;
      // await sendSMS(userContact, message);
      console.log(`Token sent to user ${userId} via SMS.`);
    } else {
      console.warn(`Could not send token to user ${userId}: No phone number found.`);
    }

    // Commission calculation
    // Find devices assigned to this customer by an agent
    const assignedDevices = await query(
      'SELECT assigned_by FROM devices WHERE assigned_to = $1 AND assigned_by IS NOT NULL',
      [userId]
    );

    if (assignedDevices.rows.length > 0) {
      const agentId = assignedDevices.rows[0].assigned_by;

      const agent = await query('SELECT commission_rate FROM users WHERE id = $1 AND role = $2', [agentId, 'agent']);

      if (agent.rows.length > 0 && agent.rows[0].commission_rate > 0) {
        const commissionRate = agent.rows[0].commission_rate;
        const commissionAmount = (amount * commissionRate) / 100;

        await query(
          'INSERT INTO commissions (agent_id, customer_id, payment_id, amount, commission_percentage) VALUES ($1, $2, $3, $4, $5)',
          [agentId, userId, paymentId, commissionAmount, commissionRate]
        );
        console.log(`Commission of ${commissionAmount} recorded for agent ${agentId}.`);
      }
    }

    // Loan management: Update loans
    let loansToUpdate = [];
    if (loanId) {
      // If a specific loanId is provided, fetch only that loan
      const specificLoan = await query('SELECT * FROM loans WHERE id = $1 AND customer_id = $2', [loanId, userId]);
      if (specificLoan.rows.length > 0) {
        loansToUpdate.push(specificLoan.rows[0]);
      } else {
        console.warn(`Specific loan ${loanId} not found for customer ${userId}.`);
      }
    } else {
      // If no specific loanId, apply to active loans (existing behavior)
      const activeLoans = await query(
        'SELECT * FROM loans WHERE customer_id = $1 AND status = active ORDER BY created_at ASC',
        [userId]
      );
      loansToUpdate = activeLoans.rows;
    }

    let remainingAmount = amount;

    for (const loan of loansToUpdate) {
      if (remainingAmount <= 0) break;

      const amountToApply = Math.min(remainingAmount, loan.balance);
      const newAmountPaid = parseFloat(loan.amount_paid) + amountToApply;
      const newBalance = parseFloat(loan.balance) - amountToApply;
      const newStatus = newBalance <= 0 ? 'completed' : 'active';
      let newNextPaymentDate = loan.next_payment_date;

      // Only advance next payment date if the loan is still active after this payment
      if (newStatus === 'active') {
        // Advance next payment date by one month
        newNextPaymentDate = new Date(loan.next_payment_date);
        newNextPaymentDate.setMonth(newNextPaymentDate.getMonth() + 1);
      }

      await query(
        'UPDATE loans SET amount_paid = $1, balance = $2, status = $3, next_payment_date = $4, updated_at = $6 WHERE id = $5',
        [newAmountPaid, newBalance, newStatus, newNextPaymentDate, loan.id, new Date()]
      );
      console.log(`Loan ${loan.id} updated: Paid ${amountToApply}, New Balance ${newBalance}, Status ${newStatus}, Next Payment Date ${newNextPaymentDate}.`);

      remainingAmount -= amountToApply;
    }

    return token;
  } catch (error) {
    console.error('Error handling successful payment and token generation:', error);
    throw error;
  }
};

module.exports = {
  handleSuccessfulPayment,
};
