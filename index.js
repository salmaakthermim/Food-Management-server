const express = require('express')
const cors = require('cors');
const app = express()
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000

// middleware
app.use(express.json());
app.use(cors());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.z4bua.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db('food_db');
    const usersCollection = db.collection('users');
    const foodsCollection = db.collection('foods');
    const cartsCollection = db.collection('carts');
    const ordersCollection = db.collection('orders');

    // ==========================================
    // CARTS API ENDPOINTS
    // ==========================================

    // GET cart items by user email
    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.send([]);
      }
      const query = { email: email };
      const result = await cartsCollection.find(query).toArray();
      res.send(result);
    });

    // POST item to cart
    app.post("/carts", async (req, res) => {
      const cartItem = req.body;
      const result = await cartsCollection.insertOne(cartItem);
      res.send(result);
    });

    // DELETE item from cart
    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartsCollection.deleteOne(query);
      res.send(result);
    });

    // PATCH update quantity in cart
    app.patch("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const { quantity } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { quantity: quantity },
      };
      const result = await cartsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    // ==========================================

    // ==========================================
    // ORDERS API ENDPOINTS
    // ==========================================

    // POST a new order
    app.post("/orders", async (req, res) => {
      const orderData = req.body;
      const result = await ordersCollection.insertOne(orderData);
      res.send(result);
    });

    // GET all orders (For Admin)
    app.get("/orders/admin/all", async (req, res) => {
      const result = await ordersCollection.find().sort({ timestamp: -1 }).toArray();
      res.send(result);
    });

    // GET orders by user email
    app.get("/orders", async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.send([]);
      }
      const query = { customerEmail: email };
      const result = await ordersCollection.find(query).sort({ timestamp: -1 }).toArray();
      res.send(result);
    });

    // PATCH update order status (For Admin)
    app.patch("/orders/:id/status", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { status: status },
      };
      const result = await ordersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    // ==========================================

    // ==========================================
    // REVIEWS API ENDPOINTS
    // ==========================================
    const reviewsCollection = db.collection('reviews');

    app.post("/reviews", async (req, res) => {
      const review = req.body;
      review.timestamp = new Date();
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    app.get("/reviews/:foodId", async (req, res) => {
      const foodId = req.params.foodId;
      const query = { foodId: foodId };
      const result = await reviewsCollection.find(query).sort({ timestamp: -1 }).toArray();
      res.send(result);
    });
    // ==========================================


    // 🔥 ONLY Google Users Save API
    app.post("/users", async (req, res) => {
      const user = req.body;

      console.log("Google User Received:", user);

      // Only allow users that have provider: 'google'
      if (user.provider !== "google") {
        return res.status(403).send({
          success: false,
          message: "Only Google users can be saved"
        });
      }

      // Google user must have an email
      if (!user.email) {
        return res.status(400).send({ message: "Email is required" });
      }

      // Check if user already exists
      const exists = await usersCollection.findOne({ email: user.email });

      if (exists) {
        return res.send({
          success: false,
          message: "User already exists",
          user: exists
        });
      }

      // Set default role to customer
      const newUser = {
        ...user,
        role: "customer",
        createdAt: new Date()
      };

      // Save Google user to DB
      const result = await usersCollection.insertOne(newUser);

      res.send({
        success: true,
        message: "User saved successfully",
        data: result
      });
    });

    // GET all users (For Admin Dashboard)
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // GET user role by email
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let role = "customer";
      if (user?.role) {
        role = user.role;
      }
      res.send({ role });
    });



    // GET all foods
    app.get("/foods", async (req, res) => {
      const result = await foodsCollection.find().toArray();
      res.send(result);
    });

    // POST new food
    app.post("/foods", async (req, res) => {
      const food = req.body;
      if (!food.title || !food.description) {
        return res.status(400).send({ message: "Title and Description are required" });
      }
      const result = await foodsCollection.insertOne(food);
      res.send({ success: true, data: result });
    });

    // GET single food by id
    app.get("/foods/:id", async (req, res) => {
      const { id } = req.params;
      // const ObjectId = require("mongodb").ObjectId;

      try {
        const food = await foodsCollection.findOne({ _id: new ObjectId(id) });
        if (!food) {
          return res.status(404).send({ message: "Food not found" });
        }
        res.send(food);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // GET all foods, sorted by price ascending
    app.get("/foods", async (req, res) => {
      try {
        // Optional: ?sort=asc or ?sort=desc
        const sortOrder = req.query.sort === "desc" ? -1 : 1;

        const foods = await foodsCollection
          .find()
          .sort({ price: sortOrder })  // sort by price
          .toArray();

        res.send(foods);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch foods" });
      }
    });

    // DELETE food by id
    app.delete("/foods/:id", async (req, res) => {
      const { id } = req.params;

      try {
        const result = await foodsCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Food not found" });
        }
        res.send({ success: true, message: "Food deleted successfully" });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });




    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})