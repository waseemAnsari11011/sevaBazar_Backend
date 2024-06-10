const FAQ = require('./model');

// Create a new FAQ
exports.createFAQ = async (req, res) => {
  try {
    const { question, answer } = req.body;
    const faq = new FAQ({ question, answer });
    await faq.save();
    res.status(201).json(faq);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get all FAQs
exports.getFAQs = async (req, res) => {
  try {
    const faqs = await FAQ.find();
    res.status(200).json(faqs);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get a single FAQ by ID
exports.getFAQById = async (req, res) => {
  try {
    const { id } = req.params;
    const faq = await FAQ.findById(id);
    if (!faq) {
      return res.status(404).json({ error: 'FAQ not found' });
    }
    res.status(200).json(faq);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Update an FAQ
exports.updateFAQ = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer } = req.body;
    const faq = await FAQ.findByIdAndUpdate(id, { question, answer, updated_at: Date.now() }, { new: true });
    if (!faq) {
      return res.status(404).json({ error: 'FAQ not found' });
    }
    res.status(200).json(faq);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Delete an FAQ
exports.deleteFAQ = async (req, res) => {
  try {
    const { id } = req.params;
    const faq = await FAQ.findByIdAndDelete(id);
    if (!faq) {
      return res.status(404).json({ error: 'FAQ not found' });
    }
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

