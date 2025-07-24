const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const app = express();

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin");


dotenv.config();


const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY)
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());



const serviceAccount = require("./firebase-adminsdk-.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});



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
        const paymentCollection = db.collection('payments');
        const ordersCollection = db.collection('orders')
        const advertisementCollection = db.collection('advertisements')
        const medicineCollection = db.collection('medicines');


        //custom middleware

        const verifyFBToken = async (req, res, next) => {
            const authHeaders = req.headers.authorization;
            if (!authHeaders) {
                return res.status(401).send({ message: 'unauthorized access' })
            }
            const token = authHeaders.split(' ')[1];

            if (!token) {
                return res.status(401).send({ message: 'unauthorized access' })
            }
            try {
                const decoded = await admin.auth().verifyIdToken(token)
                req.decoded = decoded;

                next()

            }
            catch (error) {
                return res.status(403).send({ message: 'forbidden access' })
            }



        }

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            if (!user || user.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next()
        }


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

        // Search users by email (partial or full) or by _id
        app.get('/users', verifyFBToken, async (req, res) => {
            try {
                const { search } = req.query;

                if (!search) {
                    // Return all users (or limit to 100 for safety)
                    const users = await usersCollection.find({}).limit(100).toArray();
                    return res.send(users);
                }



                const query = {
                    $or: [
                        { email: { $regex: search, $options: 'i' } }, // case-insensitive match on email
                        // You can add other fields if needed, like username, name, etc.
                    ],
                };

                const users = await usersCollection.find(query).toArray();
                res.send(users);
            } catch (error) {
                console.error('Error searching users:', error);
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });

        // Update user role by admin (only admin can do this)
        app.patch('/users/:id/role', verifyFBToken, verifyAdmin, async (req, res) => {
            try {
                // Only admins can update user roles
                const requesterEmail = req.decoded.email;
                const requesterAccount = await usersCollection.findOne({ email: requesterEmail });

                if (!requesterAccount || requesterAccount.role !== 'admin') {
                    return res.status(403).send({ message: 'forbidden access - only admin allowed' });
                }

                const userId = req.params.id;
                const { role } = req.body;

                // Validate role input
                const allowedRoles = ['user', 'seller', 'admin'];
                if (!allowedRoles.includes(role)) {
                    return res.status(400).send({ message: 'Invalid role' });
                }

                const result = await usersCollection.updateOne(
                    { _id: new ObjectId(userId) },
                    { $set: { role } }
                );

                if (result.modifiedCount > 0) {
                    res.send({ success: true, message: `User role updated to ${role}` });
                } else {
                    res.status(404).send({ success: false, message: 'User not found or role unchanged' });
                }
            } catch (error) {
                console.error('Error updating user role:', error);
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });

        // GET /users/role?email=user@example.com
        app.get('/users/role', async (req, res) => {
            const email = req.query.email;
            if (!email) {
                return res.status(400).send({ error: 'Email query parameter is required' });
            }

            try {
                const user = await usersCollection.findOne({ email });
                if (!user) {
                    return res.status(404).send({ error: 'User not found' });
                }

                res.send({ email: user.email, role: user.role || 'user' });
            } catch (error) {
                console.error('Error fetching user role:', error);
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });


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
        app.post('/categories', verifyFBToken, verifyAdmin, async (req, res) => {
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
        app.patch('/categories/:id', verifyFBToken, verifyAdmin, async (req, res) => {
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

        app.delete('/categories/:id', verifyFBToken, verifyAdmin, async (req, res) => {
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

        // ✅ Get cart for a user
        app.get('/cart', async (req, res) => {
            const userEmail = req.query.email;
            if (!userEmail) {
                return res.status(400).send({ error: "Missing email query param" });
            }

            try {
                const cart = await cartCollection.findOne({ userEmail });
                if (!cart) {
                    // ✅ Return an empty cart structure if none found
                    return res.send({ userEmail, items: [] });
                }
                res.send(cart);
            } catch (error) {
                console.error("Error fetching cart:", error);
                res.status(500).send({ error: "Internal Server Error" });
            }
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




        

const { ObjectId } = require('mongodb');

app.post('/payments', async (req, res) => {
    try {
        const paymentInfo = req.body;

        if (!paymentInfo.userEmail || !paymentInfo.amount || !paymentInfo.transactionId || !paymentInfo.items) {
            return res.status(400).send({ error: "Missing required payment info" });
        }

        // Generate invoice number
        const invoiceNumber = 'INV-' + Date.now();

        // Enrich items with sellerEmail
        const enrichedItems = await Promise.all(
            paymentInfo.items.map(async (item) => {
                const medicine = await medicineCollection.findOne({ _id: new ObjectId(item._id) });

                return {
                    _id: item._id,
                    quantity: item.quantity || 1,
                    name: medicine?.itemName,
                    price: medicine?.price,
                    sellerEmail: medicine?.added_by || 'unknown', // <- key part
                };
            })
        );

        const paymentWithInvoice = {
            userEmail: paymentInfo.userEmail,
            amount: paymentInfo.amount,
            transactionId: paymentInfo.transactionId,
            items: enrichedItems,
            invoiceNumber,
            status: 'paid',
            paidAt: new Date(),
            createdAt: paymentInfo.createdAt || new Date(),
        };

        const result = await paymentCollection.insertOne(paymentWithInvoice);

        res.status(201).send({
            message: 'Payment recorded',
            insertedId: result.insertedId,
            invoiceNumber
        });
    } catch (error) {
        console.error('Error saving payment:', error);
        res.status(500).send({ error: 'Internal Server Error' });
    }
});

app.get('/seller/payments', async (req, res) => {
    const { sellerEmail } = req.query;

    if (!sellerEmail) {
        return res.status(400).send({ error: 'Missing sellerEmail' });
    }

    const sellerPayments = await paymentCollection.find({
        items: {
            $elemMatch: { sellerEmail }
        }
    }).toArray();

    res.send(sellerPayments);
});



        app.get('/payments', verifyFBToken, async (req, res) => {


            const userEmail = req.query.email;
            console.log('decoded', req.decoded)
            if (req.decoded.email !== userEmail) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            if (!userEmail) {
                return res.status(400).send({ error: 'Missing email query param' });
            }

            try {
                const payments = await paymentCollection
                    .find({ userEmail })
                    .sort({ paidAt: -1 })
                    .toArray();

                res.send(payments);
            } catch (error) {
                console.error('Error fetching payment history:', error);
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });
        // Get payment by invoiceNumber
        app.get('/payments/invoice/:invoiceNumber', async (req, res) => {
            const { invoiceNumber } = req.params;
            try {
                const payment = await paymentCollection.findOne({ invoiceNumber });
                if (!payment) {
                    return res.status(404).send({ message: 'Invoice not found' });
                }
                res.send(payment);
            } catch (error) {
                console.error('Error fetching invoice:', error);
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });

        
// Admin: Get all payments (paid + pending)
app.get("/admin/payments", verifyFBToken, verifyAdmin, async (req, res) => {
  const payments = await paymentCollection.find().toArray();
  res.send(payments);
});



        // Admin: Approve (mark as paid) a pending payment
        app.patch('/admin/payments/:id', verifyFBToken, verifyAdmin, async (req, res) => {
            const { id } = req.params;

            try {
                const result = await paymentCollection.updateOne(
                    { _id: new ObjectId(id), status: 'pending' },
                    {
                        $set: {
                            status: 'paid',
                            paidAt: new Date()
                        }
                    }
                );

                if (result.modifiedCount > 0) {
                    res.send({ success: true, message: 'Payment approved' });
                } else {
                    res.status(404).send({ success: false, message: 'No pending payment found with that ID' });
                }
            } catch (error) {
                console.error('Error updating payment status:', error);
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });






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

        //order
        app.post('/orders', async (req, res) => {
            const order = req.body;
            const result = await ordersCollection.insertOne(order);
            res.send(result);
        });
        // Get all orders of a user
        app.get('/orders', verifyFBToken, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                return res.status(400).send({ error: "Missing email query param" });
            }
            const orders = await ordersCollection.find({ userEmail: email }).toArray();
            res.send(orders);
        });

        // POST a new advertisement

        app.post('/advertisements', async (req, res) => {
            try {
                const advertisement = req.body;
                advertisement.status = 'pending';
                advertisement.createdAt = new Date();

                const result = await advertisementCollection.insertOne(advertisement);
                res.send(result);
            } catch (error) {
                console.error('Error posting advertisement:', error);
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });


        // GET all ads by seller email
        app.get('/advertisements', async (req, res) => {
            const { email } = req.query;
            try {
                const query = email ? { sellerEmail: email } : {};
                const ads = await advertisementCollection.find(query).sort({ createdAt: -1 }).toArray();
                res.send(ads);
            } catch (error) {
                console.error('Error fetching ads:', error);
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });

        // Get all advertisements (admin)
        app.get('/advertisements', verifyFBToken, verifyAdmin, async (req, res) => {
            const ads = await advertisementCollection.find().sort({ _id: -1 }).toArray();
            res.send(ads);
        });

        // Update advertisement status
        app.patch('/advertisements/:id', async (req, res) => {
            const { id } = req.params;
            const { status } = req.body;
            const result = await advertisementCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status } }
            );
            res.send(result);
        });

        // Get only approved advertisements for homepage slider
        app.get('/advertisements/banner', async (req, res) => {
            const ads = await advertisementCollection.find({ status: 'approved' }).toArray();
            res.send(ads);
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


// Sample Routes
app.get('/', (req, res) => {
    res.send('Lifenix Medicine Multi-Vendor Server Running...');
});

app.listen(port, () => {
    console.log(`Server in listening on port ${port}`)
})