const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.z4bua.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

let db;
async function connectDB() {
  if (!db) {
    await client.connect();
    db = client.db('food_db');
    console.log("✅ Connected to MongoDB!");
  }
  return db;
}

// ── FOODS ──
app.get('/foods', async (req, res) => {
  try {
    const database = await connectDB();
    const sortOrder = req.query.sort === 'desc' ? -1 : 1;
    const result = await database.collection('foods').find().sort({ price: sortOrder }).toArray();
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.post('/foods', async (req, res) => {
  try {
    const database = await connectDB();
    const food = req.body;
    if (!food.title || !food.description) return res.status(400).send({ message: 'Title and Description required' });
    const result = await database.collection('foods').insertOne(food);
    res.send({ success: true, data: result });
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.get('/foods/:id', async (req, res) => {
  try {
    const database = await connectDB();
    const food = await database.collection('foods').findOne({ _id: new ObjectId(req.params.id) });
    if (!food) return res.status(404).send({ message: 'Food not found' });
    res.send(food);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.delete('/foods/:id', async (req, res) => {
  try {
    const database = await connectDB();
    const result = await database.collection('foods').deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).send({ message: 'Food not found' });
    res.send({ success: true });
  } catch (e) { res.status(500).send({ message: e.message }); }
});

// ── CARTS ──
app.get('/carts', async (req, res) => {
  try {
    const database = await connectDB();
    const email = req.query.email;
    if (!email) return res.send([]);
    const result = await database.collection('carts').find({ email }).toArray();
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.post('/carts', async (req, res) => {
  try {
    const database = await connectDB();
    const result = await database.collection('carts').insertOne(req.body);
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.patch('/carts/:id', async (req, res) => {
  try {
    const database = await connectDB();
    const result = await database.collection('carts').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { quantity: req.body.quantity } }
    );
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.delete('/carts/:id', async (req, res) => {
  try {
    const database = await connectDB();
    const result = await database.collection('carts').deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

// ── ORDERS ──
app.post('/orders', async (req, res) => {
  try {
    const database = await connectDB();
    const orderData = req.body;
    const result = await database.collection('orders').insertOne(orderData);
    // Notify customer
    await database.collection('notifications').insertOne({
      recipientEmail: orderData.customerEmail, type: 'order_placed',
      title: 'Order Placed!', message: `Your order of $${orderData.grandTotal} is being processed.`,
      link: '/Dashboard/MyOrders', read: false, createdAt: new Date()
    });
    // Notify admins
    const admins = await database.collection('users').find({ role: 'admin' }).toArray();
    for (const admin of admins) {
      await database.collection('notifications').insertOne({
        recipientEmail: admin.email, type: 'new_order',
        title: 'New Order!', message: `${orderData.customerName} placed $${orderData.grandTotal} order.`,
        link: '/Dashboard/ManageOrders', read: false, createdAt: new Date()
      });
    }
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.get('/orders/admin/all', async (req, res) => {
  try {
    const database = await connectDB();
    const result = await database.collection('orders').find().sort({ timestamp: -1 }).toArray();
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.get('/orders', async (req, res) => {
  try {
    const database = await connectDB();
    const email = req.query.email;
    if (!email) return res.send([]);
    const result = await database.collection('orders').find({ customerEmail: email }).sort({ timestamp: -1 }).toArray();
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.patch('/orders/:id/status', async (req, res) => {
  try {
    const database = await connectDB();
    const { status } = req.body;
    const filter = { _id: new ObjectId(req.params.id) };
    const result = await database.collection('orders').updateOne(filter, { $set: { status } });
    const order = await database.collection('orders').findOne(filter);
    const messages = { 'Cooking': 'Your order is being cooked! 🍳', 'Out for Delivery': 'On the way! 🚴', 'Delivered': 'Delivered! Enjoy 🎉' };
    if (order?.customerEmail && messages[status]) {
      await database.collection('notifications').insertOne({
        recipientEmail: order.customerEmail, type: 'order_status',
        title: `Order ${status}`, message: messages[status],
        link: '/Dashboard/MyOrders', read: false, createdAt: new Date()
      });
    }
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.patch('/orders/:id/assign', async (req, res) => {
  try {
    const database = await connectDB();
    const { deliveryEmail, deliveryName } = req.body;
    const result = await database.collection('orders').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { deliveryEmail, deliveryName, status: 'Out for Delivery' } }
    );
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.patch('/orders/:id/location', async (req, res) => {
  try {
    const database = await connectDB();
    const { lat, lng, address } = req.body;
    const result = await database.collection('orders').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { deliveryLocation: { lat, lng, address }, updatedAt: new Date() } }
    );
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

// ── DELIVERY ──
app.get('/delivery/orders', async (req, res) => {
  try {
    const database = await connectDB();
    const email = req.query.email;
    if (!email) return res.send([]);
    const result = await database.collection('orders').find({ deliveryEmail: email }).sort({ timestamp: -1 }).toArray();
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

// ── REVIEWS ──
app.post('/reviews', async (req, res) => {
  try {
    const database = await connectDB();
    const review = { ...req.body, timestamp: new Date() };
    const result = await database.collection('reviews').insertOne(review);
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.get('/reviews/:foodId', async (req, res) => {
  try {
    const database = await connectDB();
    const result = await database.collection('reviews').find({ foodId: req.params.foodId }).sort({ timestamp: -1 }).toArray();
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.get('/user-reviews', async (req, res) => {
  try {
    const database = await connectDB();
    const email = req.query.email;
    if (!email) return res.send([]);
    const result = await database.collection('reviews').find({ email }).sort({ timestamp: -1 }).toArray();
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

// ── WISHLISTS ──
app.post('/wishlists', async (req, res) => {
  try {
    const database = await connectDB();
    const item = req.body;
    const existing = await database.collection('wishlists').findOne({ email: item.email, foodId: item.foodId });
    if (existing) return res.send({ message: 'Item already in wishlist', insertedId: null });
    const result = await database.collection('wishlists').insertOne(item);
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.get('/wishlists', async (req, res) => {
  try {
    const database = await connectDB();
    const email = req.query.email;
    if (!email) return res.send([]);
    const result = await database.collection('wishlists').find({ email }).toArray();
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.delete('/wishlists/:id', async (req, res) => {
  try {
    const database = await connectDB();
    const result = await database.collection('wishlists').deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

// ── USERS ──
app.post('/users', async (req, res) => {
  try {
    const database = await connectDB();
    const user = req.body;
    if (!user.email) return res.status(400).send({ message: 'Email required' });
    const exists = await database.collection('users').findOne({ email: user.email });
    if (exists) return res.send({ success: false, message: 'User already exists', user: exists });
    const result = await database.collection('users').insertOne({ ...user, role: 'customer', createdAt: new Date() });
    res.send({ success: true, data: result });
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.get('/users', async (req, res) => {
  try {
    const database = await connectDB();
    const result = await database.collection('users').find().toArray();
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.get('/users/by-email/:email', async (req, res) => {
  try {
    const database = await connectDB();
    const user = await database.collection('users').findOne({ email: req.params.email });
    if (!user) return res.status(404).send({ message: 'User not found' });
    res.send(user);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.get('/users/role/:email', async (req, res) => {
  try {
    const database = await connectDB();
    const user = await database.collection('users').findOne({ email: req.params.email });
    res.send({ role: user?.role || 'customer' });
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.patch('/users/update/:email', async (req, res) => {
  try {
    const database = await connectDB();
    const { name, photo } = req.body;
    const result = await database.collection('users').updateOne({ email: req.params.email }, { $set: { name, photo } });
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.patch('/users/role/:id', async (req, res) => {
  try {
    const database = await connectDB();
    const result = await database.collection('users').updateOne(
      { _id: new ObjectId(req.params.id) }, { $set: { role: req.body.role } }
    );
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.delete('/users/:id', async (req, res) => {
  try {
    const database = await connectDB();
    const result = await database.collection('users').deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

// ── NOTIFICATIONS ──
app.get('/notifications', async (req, res) => {
  try {
    const database = await connectDB();
    const email = req.query.email;
    if (!email) return res.send([]);
    const result = await database.collection('notifications').find({ recipientEmail: email }).sort({ createdAt: -1 }).limit(20).toArray();
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.get('/notifications/unread-count', async (req, res) => {
  try {
    const database = await connectDB();
    const email = req.query.email;
    if (!email) return res.send({ count: 0 });
    const count = await database.collection('notifications').countDocuments({ recipientEmail: email, read: false });
    res.send({ count });
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.patch('/notifications/mark-all-read', async (req, res) => {
  try {
    const database = await connectDB();
    const result = await database.collection('notifications').updateMany(
      { recipientEmail: req.body.email, read: false }, { $set: { read: true } }
    );
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.patch('/notifications/:id/read', async (req, res) => {
  try {
    const database = await connectDB();
    const result = await database.collection('notifications').updateOne(
      { _id: new ObjectId(req.params.id) }, { $set: { read: true } }
    );
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

app.delete('/notifications', async (req, res) => {
  try {
    const database = await connectDB();
    const result = await database.collection('notifications').deleteMany({ recipientEmail: req.query.email });
    res.send(result);
  } catch (e) { res.status(500).send({ message: e.message }); }
});

// ── CONTACT ──
app.post('/contact', async (req, res) => {
  try {
    const database = await connectDB();
    const { name, email, subject, message } = req.body;
    if (!name || !email || !message) return res.status(400).send({ message: 'All fields required' });
    const result = await database.collection('contacts').insertOne({ name, email, subject, message, createdAt: new Date(), read: false });
    res.send({ success: true, data: result });
  } catch (e) { res.status(500).send({ message: e.message }); }
});

// ── ROOT ──
app.get('/', (req, res) => res.send('Hello World!'));

app.listen(port, () => console.log(`Server running on port ${port}`));

module.exports = app;
