import { Redis } from "@upstash/redis";
import { createClerkClient } from "@clerk/backend";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY
});

export default async function handler(req, res) {
  try {
    // Authenticate the request with Clerk
    const { isSignedIn, userId } =
      await clerk.authenticateRequest(req);

    if (!isSignedIn || !userId) {
      return res.status(401).json({
        error: "You must be signed in."
      });
    }

    // Get the signed-in user
    const user = await clerk.users.getUser(userId);

    const role = user.publicMetadata?.role;

    /*
      GET
      Students and teachers can view events.
    */

    if (req.method === "GET") {
      const events = await redis.lrange("woodlands:events", 0, 49);

      const parsedEvents = events
        .map(event => {
          try {
            return typeof event === "string"
              ? JSON.parse(event)
              : event;
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      return res.status(200).json({
        events: parsedEvents
      });
    }

    /*
      POST
      Only teachers and admins can create events.
    */

    if (req.method === "POST") {

      if (role !== "teacher" && role !== "admin") {
        return res.status(403).json({
          error: "Teacher or admin access required."
        });
      }

      const {
        title,
        description,
        date,
        time,
        location
      } = req.body || {};

      if (!title || !date) {
        return res.status(400).json({
          error: "Event title and date are required."
        });
      }

      const event = {
        id:
          "event_" +
          Date.now() +
          "_" +
          Math.random().toString(36).slice(2, 9),

        title: String(title).trim(),
        description: String(description || "").trim(),
        date: String(date).trim(),
        time: String(time || "").trim(),
        location: String(location || "").trim(),

        createdBy: userId,

        createdAt: new Date().toISOString()
      };

      // Save event
      await redis.lpush(
        "woodlands:events",
        JSON.stringify(event)
      );

      // Keep the list from growing forever
      await redis.ltrim(
        "woodlands:events",
        0,
        49
      );

      // Create a student notification
      const notification = {
        id:
          "notification_" +
          Date.now() +
          "_" +
          Math.random().toString(36).slice(2, 9),

        type: "event",

        title: "New school event",

        message:
          `${event.title} has been added to the school calendar.`,

        eventId: event.id,

        createdAt: new Date().toISOString()
      };

      await redis.lpush(
        "woodlands:notifications",
        JSON.stringify(notification)
      );

      await redis.ltrim(
        "woodlands:notifications",
        0,
        99
      );

      return res.status(201).json({
        success: true,
        event
      });
    }

    return res.status(405).json({
      error: "Method not allowed."
    });

  } catch (error) {

    console.error("Events API error:", error);

    return res.status(500).json({
      error: "Unable to process event request."
    });
  }
}
