const nodemailer = require('nodemailer');
require('dotenv').config();

// Create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD
    }
});

exports.sendOrderConfirmationEmail = async (customerEmail, orderDetails) => {
    const mailOptions = {
        from: process.env.EMAIL,
        to: customerEmail,
        subject: 'Order Confirmation',
        text: `Your order has been placed successfully. Order details: ${JSON.stringify(orderDetails)}`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Order confirmation email sent to customer');
    } catch (error) {
        console.error('Error sending order confirmation email to customer:', error);
        throw error;
    }
};

exports.sendNewOrderNotificationEmail = async (vendorEmail, orderDetails, customerContactNumber) => {
    const mailOptions = {
        from: process.env.EMAIL,
        to: vendorEmail,
        subject: 'New Order Placed',
        html: `
            <p>Hello,</p>
            <p>A new order has been placed. Here are the details:</p>
            <ul>
                <li><strong>Order ID:</strong> ${orderDetails.orderId}</li>
                <li><strong>Customer:</strong> ${orderDetails.name}</li>
                <li><strong>Customer Number:</strong> ${customerContactNumber}</li>
                <li><strong>Shipping Address:</strong> <br>
                    ${orderDetails.shippingAddress.address}<br>
                    ${orderDetails.shippingAddress.city}, ${orderDetails.shippingAddress.state}, ${orderDetails.shippingAddress.country}<br>
                    Postal Code: ${orderDetails.shippingAddress.postalCode}
                </li>
                <li><strong>Order Date:</strong> ${new Date(orderDetails.createdAt).toLocaleString()}</li>
            </ul>
            <p><strong>Products:</strong></p>
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #ccc;">
                <thead>
                    <tr style="background-color: #f0f0f0;">
                        <th style="border: 1px solid #ccc; padding: 8px;">Product</th>
                        <th style="border: 1px solid #ccc; padding: 8px;">Price</th>
                        <th style="border: 1px solid #ccc; padding: 8px;">Quantity</th>
                        <th style="border: 1px solid #ccc; padding: 8px;">Total Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${orderDetails.vendors.map(vendor => `
                        <tr>
                            <td style="border: 1px solid #ccc; padding: 8px;">
                                ${vendor.products.map(product => `
                                    <p><strong>${product.quantity}x ${product.name}</strong></p>
                                    <p><em>Attributes:</em> ${product.variations.map(variation => `
                                        ${variation.attributes.map(attr => `${attr.name}: ${attr.value}`).join(', ')}
                                    `).join(', ')}</p>
                                `).join('')}
                            </td>
                            <td style="border: 1px solid #ccc; padding: 8px;">₹${vendor.products.reduce((sum, product) => sum + product.totalAmount, 0).toFixed(2)}</td>
                            <td style="border: 1px solid #ccc; padding: 8px;">${vendor.products.reduce((sum, product) => sum + product.quantity, 0)}</td>
                            <td style="border: 1px solid #ccc; padding: 8px;">₹${vendor.products.reduce((sum, product) => sum + product.totalAmount, 0).toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <br>
            <p>Please process the order at your earliest convenience.</p>
            <br>
            <p>Thank you.</p>
        `
    };


    try {
        await transporter.sendMail(mailOptions);
        console.log('New order notification email sent to vendor');
    } catch (error) {
        console.error('Error sending new order notification email to vendor:', error);
        throw error;
    }
};

exports.sendNewChatOrderNotificationEmail = async (vendorEmail, orderDetails, customerDetails) => {
    const rupeeSymbol = '\u20B9';
    console.log("vendorEmail-->>", vendorEmail)
    const mailOptions = {
        from: process.env.EMAIL,
        to: vendorEmail,
        subject: 'New Order Placed',
        html: `
            <p>Hello,</p>
            <p>A new order has been placed. Here are the details:</p>
            <ul>
                <li><strong>Order ID:</strong> ${orderDetails.orderId}</li>
                <li><strong>Customer:</strong> ${customerDetails.name}</li>
                <li><strong>Phone:</strong> ${customerDetails.contactNumber}</li>
                <li><strong>Shipping Address:</strong> <br>
                    ${orderDetails.shippingAddress.address}<br>
                    ${orderDetails.shippingAddress.city}, ${orderDetails.shippingAddress.state}, ${orderDetails.shippingAddress.country}<br>
                    Postal Code: ${orderDetails.shippingAddress.postalCode}
                </li>
                <li><strong>Order Date:</strong> ${new Date(orderDetails.createdAt).toLocaleString()}</li>
            </ul>
            <p><strong>Products:</strong></p>
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #ccc;">
                <thead>
                    <tr style="background-color: #f0f0f0;">
                        <th style="border: 1px solid #ccc; padding: 8px;">Order Message</th>
                    </tr>
                </thead>
                <tbody>
                <tr>
                <td>${orderDetails.orderMessage}</td>
            </tr>
                </tbody>
            </table>
            <br>
            <p>Please process the order at your earliest convenience.</p>
            <br>
            <p>Thank you.</p>
        `
    };


    try {
        await transporter.sendMail(mailOptions);
        console.log('New order notification email sent to vendor');
    } catch (error) {
        console.error('Error sending new order notification email to vendor:', error);
        throw error;
    }
};

exports.sendNewChatOrderPaymentNotificationEmail = async (customerEmail, orderDetails, customerDetails) => {
    const rupeeSymbol = '\u20B9';
    console.log("customerEmail-->>", customerEmail)
    const mailOptions = {
        from: process.env.EMAIL,
        to: customerEmail,
        subject: 'New Order Placed',
        html: `
            <p>Hello,</p>
            <p>A new order has been placed. Here are the details:</p>
            <ul>
                <li><strong>Order ID:</strong> ${orderDetails.orderId}</li>
                <li><strong>Customer:</strong> ${customerDetails.name}</li>
                <li><strong>Phone:</strong> ${customerDetails.contactNumber}</li>
                <li><strong>Shipping Address:</strong> <br>
                    ${orderDetails.shippingAddress.address}<br>
                    ${orderDetails.shippingAddress.city}, ${orderDetails.shippingAddress.state}, ${orderDetails.shippingAddress.country}<br>
                    Postal Code: ${orderDetails.shippingAddress.postalCode}
                </li>
                <li><strong>Order Date:</strong> ${new Date(orderDetails.createdAt).toLocaleString()}</li>
            </ul>
            <p><strong>Products:</strong></p>
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #ccc;">
                <thead>
                    <tr style="background-color: #f0f0f0;">
                        <th style="border: 1px solid #ccc; padding: 8px;">Order Message</th>
                    </tr>
                </thead>
                <tbody>
                <tr>
                <td>${orderDetails.orderMessage}</td>
            </tr>
                </tbody>
            </table>
            <br>
            <p>Please process the order at your earliest convenience.</p>
            <br>
            <p>Thank you.</p>
        `
    };


    try {
        await transporter.sendMail(mailOptions);
        console.log('New order notification email sent to vendor');
    } catch (error) {
        console.error('Error sending new order notification email to vendor:', error);
        throw error;
    }
};

exports.sendVendorBlockEmail = async (vendorEmail, vendorName) => {
    const mailOptions = {
        from: process.env.EMAIL,
        to: vendorEmail,
        subject: 'Account Temporarily Blocked - SevaBazar',
        html: `
            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                <h2 style="color: #FF3B30;">Account Temporarily Blocked</h2>
                <p>Hello <strong>${vendorName}</strong>,</p>
                <p>Your SevaBazar vendor account has been temporarily blocked for today because you have rejected 3 orders.</p>
                <p><strong>Why this happened?</strong><br>
                To ensure a great experience for our customers, we monitor order rejection rates. 3 rejections in a single day trigger an automatic temporary block.</p>
                <p><strong>When will I be unblocked?</strong><br>
                Your account will be automatically unblocked at <strong>12:00 AM tonight IST</strong>. You will be able to receive orders again tomorrow.</p>
                <p>If you have any questions, please contact SevaBazar Support.</p>
                <br>
                <p>Regards,<br>Team SevaBazar</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Block notification email sent to vendor: ${vendorEmail}`);
    } catch (error) {
        console.error('Error sending vendor block email:', error);
    }
};
