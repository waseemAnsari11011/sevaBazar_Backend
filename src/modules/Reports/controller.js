const Order = require('../Order/model');  // Adjust the path according to your project structure


exports.getTotalSales = async (req, res) => {
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const calculateSales = async (startDate) => {
            const sales = await Order.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $unwind: '$vendors' },
                { $unwind: '$vendors.products' },
                {
                    $group: {
                        _id: null,
                        totalSales: { $sum: '$vendors.products.totalAmount' },
                    },
                },
            ]);

            return sales.length > 0 ? sales[0].totalSales : 0;
        };

        const totalSalesToday = (await calculateSales(startOfDay)).toFixed(2);
        const totalSalesThisWeek = (await calculateSales(startOfWeek)).toFixed(2);
        const totalSalesThisMonth = (await calculateSales(startOfMonth)).toFixed(2);

        res.json({
            totalSalesToday,
            totalSalesThisWeek,
            totalSalesThisMonth,
        });
    } catch (error) {
        res.status(500).send('Server Error');
    }
};

exports.getMonthlySales = async (req, res) => {
    try {
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);

        const salesData = await Order.aggregate([
            { $match: { createdAt: { $gte: startOfYear } } },
            { $unwind: '$vendors' },
            { $unwind: '$vendors.products' },
            {
                $group: {
                    _id: { $month: "$createdAt" },
                    totalSales: { $sum: '$vendors.products.totalAmount' }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const monthlySales = Array(12).fill(0);
        salesData.forEach(sale => {
            monthlySales[sale._id - 1] = parseFloat(sale.totalSales.toFixed(2));
        });

        res.json({
            labels: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
            data: monthlySales
        });
    } catch (error) {
        console.error('Error fetching monthly sales data', error);
        res.status(500).send('Server Error');
    }
};


exports.getOrderCounts = async (req, res) => {
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const calculateOrderCount = async (startDate) => {
            const orderCount = await Order.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                {
                    $group: {
                        _id: null,
                        count: { $sum: 1 }
                    }
                }
            ]);

            return orderCount.length > 0 ? orderCount[0].count : 0;
        };

        const ordersToday = await calculateOrderCount(startOfDay);
        const ordersThisWeek = await calculateOrderCount(startOfWeek);
        const ordersThisMonth = await calculateOrderCount(startOfMonth);

        res.json({
            ordersToday,
            ordersThisWeek,
            ordersThisMonth
        });
    } catch (error) {
        res.status(500).send('Server Error');
    }
};

exports.getMonthlyOrderCounts = async (req, res) => {
    try {
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);

        const orderData = await Order.aggregate([
            { $match: { createdAt: { $gte: startOfYear } } },
            {
                $group: {
                    _id: { $month: "$createdAt" },
                    orderCount: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const monthlyOrderCounts = Array(12).fill(0);
        orderData.forEach(order => {
            monthlyOrderCounts[order._id - 1] = order.orderCount;
        });

        res.json({
            labels: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
            data: monthlyOrderCounts
        });
    } catch (error) {
        console.error('Error fetching monthly order counts', error);
        res.status(500).send('Server Error');
    }
};

