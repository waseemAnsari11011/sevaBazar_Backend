const nodemailer = require("nodemailer");
require("dotenv").config();

// Create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASSWORD,
  },
});

exports.sendOrderConfirmationEmail = async (customerEmail, orderDetails) => {
  const mailOptions = {
    from: process.env.EMAIL,
    to: customerEmail,
    subject: "Order Confirmation",
    text: `Your order has been placed successfully. Order details: ${JSON.stringify(
      orderDetails
    )}`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Order confirmation email sent to customer");
  } catch (error) {
    console.error("Error sending order confirmation email to customer:", error);
    throw error;
  }
};

exports.sendNewOrderNotificationEmail = async (
  vendorEmail,
  orderDetails,
  customerContactNumber
) => {
  const mailOptions = {
    from: process.env.EMAIL,
    to: vendorEmail,
    subject: "New Order Placed",
    html: `
            <p>Hello,</p>
            <p>A new order has been placed. Here are the details:</p>
            <ul>
                <li><strong>Order ID:</strong> ${orderDetails.orderId}</li>
                <li><strong>Customer:</strong> ${orderDetails.name}</li>
                <li><strong>Customer Number:</strong> ${customerContactNumber}</li>
                <li><strong>Shipping Address:</strong> <br>
                    ${orderDetails.shippingAddress.address}<br>
                    ${orderDetails.shippingAddress.city}, ${
      orderDetails.shippingAddress.state
    }, ${orderDetails.shippingAddress.country}<br>
                    Postal Code: ${orderDetails.shippingAddress.postalCode}
                </li>
                <li><strong>Order Date:</strong> ${new Date(
                  orderDetails.createdAt
                ).toLocaleString()}</li>
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
                    ${orderDetails.vendors
                      .map(
                        (vendor) => `
                        <tr>
                            <td style="border: 1px solid #ccc; padding: 8px;">
                                ${vendor.products
                                  .map(
                                    (product) => `
                                    <p><strong>${product.quantity}x ${
                                      product.name
                                    }</strong></p>
                                    <p><em>Attributes:</em> ${product.variations
                                      .map(
                                        (variation) => `
                                        ${variation.attributes.selected}: ${variation.attributes.value}
                                    `
                                      )
                                      .join(", ")}</p>
                                `
                                  )
                                  .join("")}
                            </td>
                            <td style="border: 1px solid #ccc; padding: 8px;">₹${vendor.products
                              .reduce(
                                (sum, product) => sum + product.totalAmount,
                                0
                              )
                              .toFixed(2)}</td>
                            <td style="border: 1px solid #ccc; padding: 8px;">${vendor.products.reduce(
                              (sum, product) => sum + product.quantity,
                              0
                            )}</td>
                            <td style="border: 1px solid #ccc; padding: 8px;">₹${vendor.products
                              .reduce(
                                (sum, product) => sum + product.totalAmount,
                                0
                              )
                              .toFixed(2)}</td>
                        </tr>
                    `
                      )
                      .join("")}
                </tbody>
            </table>
            <br>
            <p>Please process the order at your earliest convenience.</p>
            <br>
            <p>Thank you.</p>
        `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("New order notification email sent to vendor");
  } catch (error) {
    console.error(
      "Error sending new order notification email to vendor:",
      error
    );
    throw error;
  }
};

exports.sendNewChatOrderNotificationEmail = async (
  vendorEmail,
  orderDetails,
  customerDetails
) => {
  const rupeeSymbol = "\u20B9";
  console.log("vendorEmail-->>", vendorEmail);
  const mailOptions = {
    from: process.env.EMAIL,
    to: vendorEmail,
    subject: "New Order Placed",
    html: `
            <p>Hello,</p>
            <p>A new order has been placed. Here are the details:</p>
            <ul>
                <li><strong>Order ID:</strong> ${orderDetails.orderId}</li>
                <li><strong>Customer:</strong> ${customerDetails.name}</li>
                <li><strong>Phone:</strong> ${
                  customerDetails.contactNumber
                }</li>
                <li><strong>Shipping Address:</strong> <br>
                    ${orderDetails.shippingAddress.address}<br>
                    ${orderDetails.shippingAddress.city}, ${
      orderDetails.shippingAddress.state
    }, ${orderDetails.shippingAddress.country}<br>
                    Postal Code: ${orderDetails.shippingAddress.postalCode}
                </li>
                <li><strong>Order Date:</strong> ${new Date(
                  orderDetails.createdAt
                ).toLocaleString()}</li>
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
        `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("New order notification email sent to vendor");
  } catch (error) {
    console.error(
      "Error sending new order notification email to vendor:",
      error
    );
    throw error;
  }
};

exports.sendNewChatOrderPaymentNotificationEmail = async (
  customerEmail,
  orderDetails,
  customerDetails
) => {
  const rupeeSymbol = "\u20B9";
  console.log("customerEmail-->>", customerEmail);
  const mailOptions = {
    from: process.env.EMAIL,
    to: customerEmail,
    subject: "New Order Placed",
    html: `
            <p>Hello,</p>
            <p>A new order has been placed. Here are the details:</p>
            <ul>
                <li><strong>Order ID:</strong> ${orderDetails.orderId}</li>
                <li><strong>Customer:</strong> ${customerDetails.name}</li>
                <li><strong>Phone:</strong> ${
                  customerDetails.contactNumber
                }</li>
                <li><strong>Shipping Address:</strong> <br>
                    ${orderDetails.shippingAddress.address}<br>
                    ${orderDetails.shippingAddress.city}, ${
      orderDetails.shippingAddress.state
    }, ${orderDetails.shippingAddress.country}<br>
                    Postal Code: ${orderDetails.shippingAddress.postalCode}
                </li>
                <li><strong>Order Date:</strong> ${new Date(
                  orderDetails.createdAt
                ).toLocaleString()}</li>
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
        `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("New order notification email sent to vendor");
  } catch (error) {
    console.error(
      "Error sending new order notification email to vendor:",
      error
    );
    throw error;
  }
};
