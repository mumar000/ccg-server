import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import cors from "cors";
import Stripe from 'stripe';

import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);



app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5000",
      "https://ccgconsultants.org",
      "https://ccg-ebook.netlify.app",
    ],
    credentials: true,
  })
);
const PORT = process.env.PORT || 5002;

app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({ message: "Server is Running" });
});

// Handle email subscriptions
app.post("/api/subscribe", async (req, res) => {
  const { email, firstName, lastName } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Please provide an email address" });
  }

  // Mailchimp settings
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const listId = process.env.MAILCHIMP_LIST_ID;
  const serverPrefix = apiKey.split("-")[1];

  try {
    // Send to Mailchimp
    const response = await axios.post(
      `https://${serverPrefix}.api.mailchimp.com/3.0/lists/${listId}/members`,
      {
        email_address: email,
        status: "subscribed",
        merge_fields: {
          FNAME: firstName || "",
          LNAME: lastName || "",
        },
      },
      {
        auth: {
          username: "anything",
          password: apiKey,
        },
      }
    );

    // If successful
    res.json({ success: true, message: "Thanks for subscribing!" });
  } catch (error) {
    // Handle errors
    if (error.response?.data?.title === "API Key Invalid") {
      console.log("API Key is disabled or invalid.");
      return res.status(401).json({ error: "Invalid Mailchimp API Key." });
    } else {
      console.log("Subscription error:", error.response?.data);
      return res.status(400).json({ error: "Subscription failed." });
    }
  }
});

app.post("/create-payment-intent", async (req, res) => {
  try {
    const { currency, email_for_receipt } = req.body;
    const ebookPriceInCents = 1499;

    const paymentIntentParams = {
      amount: ebookPriceInCents,
      currency: currency || "usd",
      automatic_payment_methods: { enabled: true },
      metadata: { product_name: "Top Funders of 2025 Ebook" }
    };
    if (email_for_receipt) {
      paymentIntentParams.receipt_email = email_for_receipt;
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);


    console.log("SERVER: /create-payment-intent - PaymentIntent object:", paymentIntent);
    console.log("SERVER: /create-payment-intent - Sending paymentIntentId:", paymentIntent.id);


    res.send({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      price: ebookPriceInCents,
      currency: paymentIntentParams.currency
    });
  } catch (error) {
    console.error("Error creating payment intent:", error.message);
    res.status(500).json({ error: `Failed to create payment intent: ${error.message}` });
  }
});

app.post("/update-payment-amount", async (req, res) => {
  const { paymentIntentId, newAmountInCents } = req.body;

  if (!paymentIntentId || typeof newAmountInCents !== 'number' || newAmountInCents <= 0) {
    return res.status(400).json({ error: "Invalid paymentIntentId or new amount." });
  }

  try {
    const currentPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (currentPaymentIntent.status !== 'requires_payment_method' && currentPaymentIntent.status !== 'requires_confirmation') {

      return res.status(400).json({ error: `PaymentIntent status ${currentPaymentIntent.status} does not allow amount update.` });
    }

    const updatedPaymentIntent = await stripe.paymentIntents.update(paymentIntentId, {
      amount: newAmountInCents,
    });

    res.json({
      success: true,
      updatedAmount: updatedPaymentIntent.amount,
      clientSecret: updatedPaymentIntent.client_secret
    });
  } catch (error) {
    console.error("Error updating payment intent amount:", error);
    res.status(500).json({ error: `Failed to update payment amount: ${error.message}` });
  }
});



app.get("/secure-download-ebook", async (req, res) => {
  const paymentIntentId = req.query.payment_intent_id;

  if (!paymentIntentId) {
    return res.status(400).send("Missing payment confirmation.");
  }

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      const ebookFileNameInPrivateFolder = 'Top Funders of 2025.pdf';
      const ebookFilePath = path.join(__dirname, 'private_content', ebookFileNameInPrivateFolder);

      const userDownloadFileName = 'Top-Funders-of-2025.pdf';

      res.download(ebookFilePath, userDownloadFileName, (err) => {
        if (err) {
          console.error("Error sending ebook file:", err);
          if (!res.headersSent) {
            res.status(500).send("Could not download the ebook. Please try again later or contact support.");
          }
        } else {
          console.log("Ebook downloaded successfully for PI:", paymentIntentId);
        }
      });

    } else {
      console.warn("Download attempt for non-succeeded PI:", paymentIntentId, "Status:", paymentIntent.status);
      res.status(403).send("Payment not confirmed. Access to ebook denied.");
    }
  } catch (error) {
    console.error("Error verifying payment for ebook download:", error);
    res.status(500).send("Error verifying your purchase. Please try again or contact support.");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server ready at Port ${PORT}`);
});
