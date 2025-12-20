const express = require('express');
const router = express.Router();
const controller = require('./controller');

router.post('/create', controller.createTicket);
router.get('/', controller.getAllTickets);

module.exports = router;
