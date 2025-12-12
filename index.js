const express = require('express')
const cors = require('cors');
const app = express()
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 3000

// middleware
app.use(express.json());
app.use(cors());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2o3am.mongodb.net/?appName=Cluster0`;

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

      // Save Google user to DB
      const result = await usersCollection.insertOne(user);

      res.send({
        success: true,
        message: "Google user saved successfully",
        data: result
      });
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