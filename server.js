import express from "express";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5002;

app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({ message: "Server is Running" });
});

// Handle email subscriptions
app.post("/api/subscribe", async (req, res) => {
  const { email } = req.body;

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
    console.log("Subscription error:", error.message);

    let errorMessage = "Something went wrong";
    if (error.response?.data?.title === "Member Exists") {
      errorMessage = "This email is already subscribed";
    }

    res.status(400).json({ error: errorMessage });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server ready at Port ${PORT}`);
});
