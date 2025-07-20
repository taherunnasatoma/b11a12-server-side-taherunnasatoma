const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const app = express();

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');


dotenv.config();


const stripe= require('stripe')(process.env.PAYMENT_GATEWAY_KEY)
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.i41acjo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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


        //category
        const db = client.db('medicineDB')
        const categoryCollection = db.collection('categories')
        const usersCollection = db.collection('users')
        const cartCollection = db.collection('carts');

        // app.get('/categories', async (req, res) => {
        //     const categories = await categoryCollection.find().toArray();
        //     res.send(categories)
        // })


        //users
        app.post('/users', async (req, res) => {
            const email = req.body.email;
            const userExits = await usersCollection.findOne({ email })
            if (userExits) {
                return res.status(200).send({
                    message: "User already exits",
                    inserted: false
                })

            }

            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result)

        })

        //medicines
        // POST medicine
        app.post('/medicines', async (req, res) => {
            const medicine = req.body;
            const result = await db.collection('medicines').insertOne(medicine);
            res.send(result);
        });

        app.get('/medicines', async (req, res) => {
            try {
                const email = req.query.email;
                const query = email ? { added_by: email } : {};
                const result = await db.collection('medicines').find(query).toArray();
                res.send(result);
            } catch (error) {
                console.error("Error fetching medicines:", error);
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });





        app.get('/categories', async (req, res) => {
            try {
                const userEmail = req.query.email;
                const query = userEmail ? { created_by: userEmail } : {};
                const categories = await categoryCollection.find(query).sort({ createdAt: -1 }).toArray();
                res.send(categories);
            } catch (error) {
                console.error('error fetching', error);
                res.status(500).send({ message: 'failed to get category' });
            }
        });



        // Add Category (POST)
        app.post('/categories', async (req, res) => {
            try {
                const category = req.body;
                const result = await categoryCollection.insertOne(category);

                res.status(201).send({
                    message: "Category added successfully",
                    insertedId: result.insertedId,
                });
            } catch (error) {
                console.error("Error inserting category:", error);
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });

        // Update Category
        app.patch('/categories/:id', async (req, res) => {
            const { id } = req.params;
            const updatedData = req.body;

            try {
                const result = await categoryCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updatedData }
                );

                if (result.modifiedCount > 0) {
                    res.send({ success: true });
                } else {
                    res.status(404).send({ success: false, message: 'Category not updated' });
                }
            } catch (error) {
                console.error('Update failed:', error);
                res.status(500).send({ success: false, message: 'Internal server error' });
            }
        });


        //Delete category

        app.delete('/categories/:id', async (req, res) => {
            const id = req.params.id;
            try {
                const result = await categoryCollection.deleteOne({ _id: new ObjectId(id) });
                if (result.deletedCount > 0) {
                    res.send({ success: true });
                } else {
                    res.status(404).send({ error: 'Category not found' });
                }
            } catch (error) {
                console.error('Delete failed:', error);
                res.status(500).send({ error: 'Failed to delete category' });
            }
        });


        // cart

        // Get cart for a user
        app.get('/cart', async (req, res) => {
            const userEmail = req.query.email;
            if (!userEmail) {
                return res.status(400).send({ error: "Missing email query param" });
            }
            const cart = await cartCollection.findOne({ userEmail });
            if (!cart) {
                return res.send({ items: [] }); // empty cart if none found
            }
            res.send(cart);
        });

        // Add or update cart items for a user
        app.post('/cart', async (req, res) => {
            const { userEmail, items } = req.body;
            console.log("Received cart items:", items); // <-- check shape

            if (!userEmail || !Array.isArray(items)) {
                return res.status(400).send({ error: "Invalid request body" });
            }
            const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

            try {
                const updateResult = await cartCollection.updateOne(
                    { userEmail },
                    {
                        $set: {
                            items,
                            total,
                            updatedAt: new Date(),
                        }
                    },
                    { upsert: true }
                );
                res.send({
                    success: true,
                    modifiedCount: updateResult.modifiedCount,
                    upsertedId: updateResult.upsertedId
                });
            } catch (error) {
                console.error("Error updating cart:", error);
                res.status(500).send({ error: "Internal Server Error" });
            }
        });


        // Optionally, clear cart for a user
        app.delete('/cart', async (req, res) => {
            const userEmail = req.query.email;
            if (!userEmail) {
                return res.status(400).send({ error: "Missing email query param" });
            }
            try {
                await cartCollection.deleteOne({ userEmail });
                res.send({ success: true });
            } catch (error) {
                console.error("Error clearing cart:", error);
                res.status(500).send({ error: "Internal Server Error" });
            }
        });

        //payment

        // app.post('/payments', async (req, res) => {


        //     console.log('headers in payments', req.headers)

        //     try {
        //         const { parcelId, email, amount, paymentMethod, transactionId } = req.body;

        //         const updateResult = await parcelsCollection.updateOne(
        //             {
        //                 _id: new ObjectId(parcelId)
        //             },
        //             {
        //                 $set: {
        //                     paymentStatus: 'paid'
        //                 }
        //             }

        //         )

        //         if (updateResult.modifiedCount === 0) {
        //             return res.status(404).send({ message: 'parcel not found or already paid' })
        //         }


        //         const paymentDoc = {
        //             parcelId,
        //             email,
        //             amount,
        //             paymentMethod,
        //             transactionId,
        //             paid_at_string: new Date().toISOString(),
        //             paid_at: new Date()

        //         }
        //         const paymentResult = await paymentCollection.insertOne(paymentDoc)

        //         res.status(201).send({
        //             message: 'payment recorded and parcel marked as paid',
        //             insertedId: paymentResult.insertedId
        //         })
        //     }

        //     catch (error) {
        //         console.error('payment processing failed', error)

        //     }


        // })


        // app.get('/payments', verifyFBToken, async (req, res) => {
        //     try {

        //         const userEmail = req.query.email;
        //         console.log('decoded', req.decoded)

        //         if (req.decoded.email !== userEmail) {
        //             return res.status(403).send({ message: 'forbidden access' })
        //         }

        //         const query = userEmail ? { email: userEmail } : {}
        //         const options = { sort: { paid_at: -1 } }
        //         const payments = await paymentCollection.find(query, options).toArray()
        //         res.send(payments)
        //     } catch (error) {
        //         console.error('Error fetching payments:', error);
        //         res.status(500).send({ message: 'Failed to fetch payments' });
        //     }
        // })






        app.post('/create-payment-intent', async (req, res) => {

            const totalInCents = req.body.totalInCents
            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: totalInCents,
                    currency: 'usd',
                    payment_method_types: ['card'],
                })
                res.json({ clientSecret: paymentIntent.client_secret })
            } catch (error) {
                res.status(500).json({ error: error.message })
            }
        })






        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


// Sample Routes
app.get('/', (req, res) => {
    res.send('Lifenix Medicine Multi-Vendor Server Running...');
});

app.listen(port, () => {
    console.log(`Server in listening on port ${port}`)
})